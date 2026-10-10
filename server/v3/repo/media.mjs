// 画像ファイル（media_files）と知識項目の記憶イメージ（言語ごとに 1 枚）。
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from '../../files.mjs';
import { currentPlatform } from '../../platform.mjs';
import { v3MediaDir } from '../database.mjs';
import { SUPPORTED_LANGUAGES } from '../i18n.mjs';
import { InputError, NotFoundError, nowIso, oneOf, text } from './common.mjs';

const IMAGE_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const STATUSES = ['pending', 'prompt_ready', 'generated', 'approved'];

// 宣言した形式とバイト列が一致するラスター画像だけ受け付ける（SVG はスクリプトを含みうるので不可）
function imageBytesMatch(mime, bytes) {
  const ascii = (start, end) => bytes.subarray(start, end).toString('latin1');
  if (mime === 'image/png') return bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mime === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mime === 'image/gif') return ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a';
  if (mime === 'image/webp') return ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP';
  return false;
}

const AUDIO_TYPES = { 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/webm': 'webm', 'audio/ogg': 'ogg' };
const MAX_AUDIO_BYTES = 40 * 1024 * 1024;

/** base64 のファイル（画像・音声）を保存して media_files の rid を返す。同じ内容は同じ行を使う。 */
export function storeMedia(db, userId, { base64, mime, fileName = null }) {
  const type = String(mime ?? '').toLowerCase().split(';')[0].trim();
  const kind = IMAGE_TYPES[type] ? 'image' : AUDIO_TYPES[type] ? 'audio' : null;
  if (!kind) throw new InputError('ファイルは PNG・JPEG・WebP・GIF の画像か、MP3・M4A・AAC・WAV・WebM・Ogg の音声にしてください');
  const clean = String(base64 ?? '').replace(/^data:[^,]*,/, '').replace(/\s/g, '');
  if (!clean || !/^[A-Za-z0-9+/]*={0,2}$/.test(clean)) throw new InputError('ファイルのデータ（base64）が正しくありません');
  const bytes = Buffer.from(clean, 'base64');
  const limit = kind === 'image' ? MAX_IMAGE_BYTES : MAX_AUDIO_BYTES;
  if (!bytes.length || bytes.length > limit) throw new InputError(`ファイルは ${limit / 1024 / 1024} MB 以下にしてください`);
  if (kind === 'image' && !imageBytesMatch(type, bytes)) throw new InputError('画像の中身がファイル形式と一致しません');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const existing = db.prepare('SELECT rid FROM media_files WHERE user_id = ? AND sha256 = ? AND kind = ?').get(userId, sha256, kind);
  if (existing) return existing.rid;
  const dir = join(v3MediaDir(), String(userId));
  const path = join(dir, `${sha256}.${(IMAGE_TYPES[type] ?? AUDIO_TYPES[type])}`);
  mkdirSync(dir, { recursive: true });
  // 名前は内容のハッシュなので上書きしても同じ。Cloudflare の existsSync は R2 を見ずに true を返すため、確認せずに書く。
  writeFileSync(path, bytes);
  const now = nowIso();
  return Number(db.prepare(`INSERT INTO media_files (user_id, kind, file_name, mime, size, sha256, storage_path, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(userId, kind, fileName, type, bytes.length, sha256, path, now, now).lastInsertRowid);
}

/** 画像だけ受け付ける保存（記憶イメージ用）。 */
export function storeImage(db, userId, input) {
  if (!IMAGE_TYPES[String(input?.mime ?? '').toLowerCase()]) throw new InputError('画像は PNG、JPEG、WebP、GIF のいずれかにしてください');
  return storeMedia(db, userId, input);
}

/** 自分のファイルか確かめて rid を返す（kind を指定するとその種類だけ）。 */
export function ownedMedia(db, userId, rid, kind) {
  const row = db.prepare('SELECT rid, kind FROM media_files WHERE rid = ? AND user_id = ?').get(Number(rid), userId);
  if (!row) throw new InputError(`找不到文件：${rid}（先上传，再用返回的 mediaId）`);
  if (kind && row.kind !== kind) throw new InputError(`文件 ${rid} 是 ${row.kind}，这里需要 ${kind}`);
  return row.rid;
}

/** 他のユーザーのファイルを自分のものとして登録する（中身は sha256 で決まり書き換えないので、置き場所はそのまま共有）。 */
export function copyMedia(db, fromUserId, rid, toUserId) {
  const file = db.prepare('SELECT * FROM media_files WHERE rid = ? AND user_id = ?').get(Number(rid), fromUserId);
  if (!file) throw new NotFoundError(`ファイルが見つかりません：${rid}`);
  const existing = db.prepare('SELECT rid FROM media_files WHERE user_id = ? AND sha256 = ? AND kind = ?').get(toUserId, file.sha256, file.kind);
  if (existing) return existing.rid;
  const now = nowIso();
  return Number(db.prepare(`INSERT INTO media_files (user_id, kind, file_name, mime, size, sha256, storage_path, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(toUserId, file.kind, file.file_name, file.mime, file.size, file.sha256, file.storage_path, now, now).lastInsertRowid);
}

/** ファイルの中身。Cloudflare では R2 から読む。 */
export async function readMediaBytes(file, limit = MAX_AUDIO_BYTES) {
  const platform = currentPlatform();
  if (platform?.readMedia) {
    const bytes = await platform.readMedia(file.storage_path, limit);
    if (!bytes) throw new NotFoundError('ファイルの中身が見つかりません');
    return Buffer.from(bytes);
  }
  return Buffer.from(readFileSync(file.storage_path));
}

/** 自分のファイルだけ読める。 */
export function mediaFor(db, userId, rid) {
  const row = db.prepare('SELECT rid, kind, mime, size, storage_path FROM media_files WHERE rid = ? AND user_id = ?').get(Number(rid), userId);
  if (!row) throw new NotFoundError(`ファイルが見つかりません：${rid}`);
  return row;
}

function pointRid(db, userId, code) {
  const row = db.prepare('SELECT rid FROM knowledge_points WHERE user_id = ? AND code = ?').get(userId, String(code ?? '').toUpperCase());
  if (!row) throw new NotFoundError(`找不到知识点：${code}`);
  return row.rid;
}

/**
 * 記憶イメージを言語ごとに設定する。渡したキーだけ変わる。
 * 画像は imageBase64 + mime（アップロード）か url（https）。画像を付けて status を省くと generated。
 */
export function setMemoryImage(db, userId, code, input) {
  const rid = pointRid(db, userId, code);
  const language = oneOf(input?.language ?? 'zh-Hans', SUPPORTED_LANGUAGES, 'language');
  const current = db.prepare('SELECT * FROM knowledge_memory_images WHERE point_rid = ? AND language = ?').get(rid, language);
  const next = {
    concept: 'concept' in input ? text(input.concept, 'concept', { max: 2000 }) : current?.concept ?? null,
    prompt: 'prompt' in input ? text(input.prompt, 'prompt', { max: 4000 }) : current?.prompt ?? null,
    caption: 'caption' in input ? text(input.caption, 'caption', { max: 120 }) : current?.caption ?? null,
    media_rid: current?.media_rid ?? null,
    url: current?.url ?? null,
  };
  let imageChanged = false;
  if (input.imageBase64) {
    next.media_rid = storeImage(db, userId, { base64: input.imageBase64, mime: input.mime, fileName: input.fileName ?? null });
    next.url = null;
    imageChanged = true;
  } else if (input.url) {
    const url = text(input.url, 'url', { max: 2000 });
    if (!/^https:\/\//.test(url)) throw new InputError('画像の URL は https:// で始めてください');
    next.url = url;
    next.media_rid = null;
    imageChanged = true;
  }
  const hasImage = Boolean(next.media_rid || next.url);
  const status = input.status ? oneOf(input.status, STATUSES, 'status')
    : imageChanged ? 'generated' : current?.status ?? (next.prompt ? 'prompt_ready' : 'pending');
  if ((status === 'generated' || status === 'approved') && !hasImage) throw new InputError(`status ${status} には画像が必要です`);
  const now = nowIso();
  db.prepare(`INSERT INTO knowledge_memory_images (point_rid, language, concept, prompt, status, media_rid, url, caption, created_at, updated_at)
    VALUES (:rid, :language, :concept, :prompt, :status, :media_rid, :url, :caption, :now, :now)
    ON CONFLICT (point_rid, language) DO UPDATE SET concept = excluded.concept, prompt = excluded.prompt, status = excluded.status,
      media_rid = excluded.media_rid, url = excluded.url, caption = excluded.caption, updated_at = excluded.updated_at`)
    .run({ rid, language, ...next, status, now });
  db.prepare('UPDATE knowledge_points SET updated_at = ? WHERE rid = ?').run(now, rid);
  return { code: String(code).toUpperCase(), language, status, hasImage, concept: next.concept, prompt: next.prompt, caption: next.caption };
}

/** 画像だけ外す（構想と提示文は残す）。all: true でその言語の行ごと消す。 */
export function removeMemoryImage(db, userId, code, { language = 'zh-Hans', all = false } = {}) {
  const rid = pointRid(db, userId, code);
  const current = db.prepare('SELECT * FROM knowledge_memory_images WHERE point_rid = ? AND language = ?').get(rid, language);
  if (!current) throw new NotFoundError(`${code} には ${language} の記憶イメージがありません`);
  if (all || !current.prompt) db.prepare('DELETE FROM knowledge_memory_images WHERE point_rid = ? AND language = ?').run(rid, language);
  else db.prepare("UPDATE knowledge_memory_images SET media_rid = NULL, url = NULL, status = 'prompt_ready', updated_at = ? WHERE point_rid = ? AND language = ?").run(nowIso(), rid, language);
  return { code: String(code).toUpperCase(), language, removed: true };
}
