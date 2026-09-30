import { currentPlatform, transaction } from './platform.mjs';
import { createHash, randomUUID } from "node:crypto";
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from './files.mjs';
import { canonicalizeItemFields } from "./item-schema.mjs";
import {
  getDb,
  getDailyPractice,
  getReviewPackDraft,
  listDailyPractices,
  listReviewPackDrafts,
  listWordbooks,
  itemWordbookId,
  loadReviewData,
  createWordbook,
  createReviewPackDraft,
  listListeningQuestions,
  listeningQuestionForUser,
  readListeningAudioForUser,
  createListeningQuestion,
  deleteListeningQuestion,
} from "./storage.mjs";
const sharedAudioDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '.local', 'listening-audio', 'shares');
const itemFields =
  "deck type jlpt_level original reading meaning_ja paraphrase_ja meaning_zh core_memory part_of_speech inflection_class base_form conjugations examples patterns points comparisons register explanation_zh localizations ruby_terms tags content_origin verification_status question_kinds question_distractors images".split(
    " ",
  );
const questionFields =
  "kind title instruction prompt promptTarget choices answer translationZh context correctReason memoryPoint choiceAnalysis answerIndex".split(
    " ",
  );
const pick = (object, fields) =>
  Object.fromEntries(
    fields
      .filter((key) => object[key] !== undefined)
      .map((key) => [key, object[key]]),
  );
function database() {
  const db = getDb();
  db.exec(`CREATE TABLE IF NOT EXISTS market_shares (id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), source_id TEXT NOT NULL, kind TEXT NOT NULL, package_json TEXT NOT NULL, created_at TEXT NOT NULL, withdrawn INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS market_imports (user_id INTEGER NOT NULL REFERENCES users(id), digest TEXT NOT NULL, result_json TEXT NOT NULL, PRIMARY KEY(user_id,digest));
    CREATE TABLE IF NOT EXISTS user_review_items (id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), item_json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS market_listening_audio (share_id TEXT PRIMARY KEY REFERENCES market_shares(id), audio_path TEXT NOT NULL, audio_mime TEXT NOT NULL, audio_size INTEGER NOT NULL);`);
  return db;
}
export function userReviewData(userId) {
  database();
  return loadReviewData(userId);
}
export function sharingSources(userId) {
  const drafts = listReviewPackDrafts(userId);
  const practices = listDailyPractices(userId).map((practice) => ({
    ...practice,
    draft: drafts.find((draft) => draft.id === practice.sourceDraftId),
  }));
  // Read full records because older summaries do not expose sourceDraftId.
  return {
    practices: practices
      .map((p) => {
        const full = getDailyPractice(userId, p.id);
        const draft = drafts.find((d) => d.id === full.sourceDraftId);
        return {
          id: p.id,
          title: draft?.title || p.title,
          count: full.questions.length,
        };
      })
      .filter(
        (p) =>
          !/^(?:\d{4}-\d{2}-\d{2}|\d{1,2}月\d{1,2}日).*?(?:復習|复习|弱点强化|每日|练习)/u.test(
            p.title,
          ),
      ),
    wordbooks: listWordbooks(userId),
  };
}
export function validatePackage(input) {
  if (!input || Buffer.byteLength(JSON.stringify(input)) > 750000)
    throw new Error("分享包超过 750 KB 或格式无效");
  if (
    input.format !== "jlpt-share" ||
    input.version !== 1 ||
    !["practice", "wordbook"].includes(input.kind)
  )
    throw new Error("不支持的分享包格式");
  const title = String(input.title || "")
    .trim()
    .slice(0, 120);
  if (!title) throw new Error("请填写分享标题");
  const records = input.kind === "practice" ? input.questions : input.items;
  if (!Array.isArray(records) || !records.length || records.length > 1000)
    throw new Error("分享内容需包含 1–1000 项");
  const stringListFields = new Set(["tags", "question_kinds", "core_memory"]);
  const objectLists = {
    examples: [
      "ja",
      "zh",
      "spoken_ja",
      "spoken_zh",
      "analysis_zh",
      "form_analysis_zh",
    ],
    comparisons: ["target", "difference_zh", "kind"],
    patterns: ["pattern", "connection_zh", "meaning_zh", "example", "example_zh"],
    points: ["label", "detail_zh"],
    // Uploaded images belong to the sharer's account; only public URLs travel.
    images: ["url", "caption"],
    ruby_terms: ["text", "reading"],
    conjugations: [
      "kind",
      "form",
      "label",
      "reading",
      "meaning_zh",
      "polite",
      "negative",
      "past",
      "te",
    ],
  };
  const cleanItem = (record) => {
    if (!record || typeof record !== 'object' || typeof record.original !== 'string' || !record.original.trim() ||
      !['n1_vocab', 'name_reading', 'grammar_expression'].includes(record.deck))
      throw new Error('知识点内容无效');
    const item = pick(canonicalizeItemFields(record), itemFields);
    if (item.images) {
      item.images = item.images.filter((image) => image?.url);
      if (!item.images.length) delete item.images;
    }
    for (const [key, value] of Object.entries(item)) {
      if (stringListFields.has(key)) {
        if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'string')) throw new Error(`知识点字段 ${key} 格式无效`);
      } else if (objectLists[key]) {
        if (!Array.isArray(value)) throw new Error(`知识点字段 ${key} 格式无效`);
        item[key] = value.map((entry) => {
          if (!entry || typeof entry !== 'object') throw new Error(`知识点字段 ${key} 格式无效`);
          const clean = pick(entry, objectLists[key]);
          if (!Object.values(clean).every((v) => typeof v === 'string')) throw new Error(`知识点字段 ${key} 格式无效`);
          return clean;
        });
      } else if (key === 'register') {
        if (!value || typeof value !== 'object' || Array.isArray(value) || !Object.values(value).every((v) => typeof v === 'string')) throw new Error('知识点字段 register 格式无效');
        item.register = pick(value, ['level', 'note_zh', 'exam_tip_zh']);
      } else if (key === 'question_distractors' || key === 'localizations') {
        delete item[key];
      } else if (typeof value !== 'string') throw new Error(`知识点字段 ${key} 应为文字`);
    }
    return item;
  };
  const practiceItems = input.kind === 'practice' && input.items !== undefined
    ? (Array.isArray(input.items) && input.items.length <= 1000 ? input.items.map(cleanItem) : (() => { throw new Error('关联知识点格式无效'); })())
    : [];
  const clean = records.map((record) => {
    if (!record || typeof record !== "object") throw new Error("内容格式无效");
    if (input.kind === "practice") {
      if (
        typeof record.prompt !== "string" ||
        !Array.isArray(record.choices) ||
        record.choices.length < 2 ||
        record.choices.length > 8 ||
        !record.choices.every((c) => typeof c === "string") ||
        !record.choices.includes(record.answer) ||
        ![
          "grammar",
          "moji_goi",
          "meaning",
          "kana_to_kanji",
          "kanji_to_kana",
          "word_formation",
          "usage",
        ].includes(record.kind)
      )
        throw new Error("练习题缺少题干、选项或有效答案");
      const question = pick(record, questionFields);
      if (record.sourceItemIndex !== undefined) {
        if (!Number.isInteger(record.sourceItemIndex) || record.sourceItemIndex < 0 || record.sourceItemIndex >= practiceItems.length)
          throw new Error('题目的关联知识点无效');
        question.sourceItemIndex = record.sourceItemIndex;
      }
      for (const field of questionFields.filter(
        (key) => !["choices", "choiceAnalysis", "answerIndex"].includes(key),
      ))
        if (
          question[field] !== undefined &&
          typeof question[field] !== "string"
        )
          throw new Error(`题目字段 ${field} 应为文字`);
      question.answerIndex = question.choices.indexOf(question.answer);
      if (question.choiceAnalysis !== undefined) {
        if (!Array.isArray(question.choiceAnalysis))
          throw new Error("选项解析格式无效");
        question.choiceAnalysis = question.choiceAnalysis.map((entry) => {
          if (
            !entry ||
            typeof entry.choice !== "string" ||
            typeof entry.explanation !== "string"
          )
            throw new Error("选项解析格式无效");
          return {
            choice: entry.choice,
            explanation: entry.explanation,
            correct: entry.choice === question.answer,
          };
        });
      }
      return question;
    }
    return cleanItem(record);
  });
  return {
    format: "jlpt-share",
    version: 1,
    kind: input.kind,
    title,
    description: String(input.description || "").slice(0, 600),
    ...(input.kind === "practice" ? { questions: clean, ...(practiceItems.length ? { items: practiceItems } : {}) } : { items: clean }),
  };
}
export function sourcePackage(userId, { kind, sourceId, title, description }) {
  let payload;
  if (kind === "practice") {
    const practice = getDailyPractice(userId, sourceId);
    if (!practice) throw new Error("找不到自己的专项练习");
    const draft = practice.sourceDraftId
      ? getReviewPackDraft(userId, practice.sourceDraftId)
      : null;
    payload = {
      title: title || draft?.title || practice.title,
      questions: practice.questions,
    };
    const ownerItems = userReviewData(userId).items;
    const rawGrammar = [...(draft?.content?.grammar_items ?? []), ...(draft?.content?.grammar_points ?? [])];
    for (const [index, point] of rawGrammar.entries()) {
      if (!point || typeof point !== 'object') continue;
      const original = String(point.grammar_point ?? point.expression ?? point.point ?? '').trim();
      if (!original || ownerItems.some((item) => item.deck === 'grammar_expression' && item.original === original)) continue;
      ownerItems.push({ id: `draft-grammar-${index}`, deck: 'grammar_expression', original,
        meaning_zh: point.meaning_zh ?? '',
        core_memory: Array.isArray(point.core_memory) ? point.core_memory : point.core_memory ? [point.core_memory] : [],
        ...(point.connection ? { patterns: [{ pattern: original, connection_zh: String(point.connection) }] } : {}),
        ...(point.usage ? { explanation_zh: String(point.usage) } : {}),
        ...(point.example_ja ? { examples: [{ ja: String(point.example_ja), zh: String(point.example_zh ?? '') }] } : {}),
      });
    }
    const itemsById = new Map(ownerItems.map((item) => [item.id, item]));
    const linkedIdFor = (question) => {
      if (itemsById.has(question.itemId)) return question.itemId;
      const target = String(question.memoryPoint ?? question.promptTarget ?? '').trim().normalize('NFKC');
      if (!target) return undefined;
      const matches = ownerItems.filter((item) => item.original?.trim().normalize('NFKC') === target &&
        (question.kind !== 'grammar' || item.deck === 'grammar_expression'));
      return matches.length === 1 ? matches[0].id : undefined;
    };
    const linkedIds = [...new Set(practice.questions.map(linkedIdFor).filter(Boolean))];
    if (linkedIds.length) {
      payload.items = linkedIds.map((id) => itemsById.get(id));
      payload.questions = practice.questions.map((question) => ({
        ...question,
        ...(linkedIdFor(question) ? { sourceItemIndex: linkedIds.indexOf(linkedIdFor(question)) } : {}),
      }));
    }
  } else if (kind === "wordbook") {
    const book = listWordbooks(userId).find((book) => book.id === sourceId);
    if (!book) throw new Error("找不到自己的单词本");
    payload = {
      title: title || book.title,
      items: userReviewData(userId).items.filter(
        (item) => itemWordbookId(item) === book.id,
      ),
    };
  } else throw new Error("不支持的分享类型");
  return validatePackage({
    format: "jlpt-share",
    version: 1,
    kind,
    description,
    ...payload,
  });
}
export function publishShare(userId, input) {
  const db = database();
  return transaction(db, () => {
    const pkg = sourcePackage(userId, input);
    const id = randomUUID();
    const now = new Date().toISOString();
    db.prepare(
      "INSERT INTO market_shares (id,user_id,source_id,kind,package_json,created_at) VALUES (?,?,?,?,?,?)",
    ).run(id, userId, input.sourceId, pkg.kind, JSON.stringify(pkg), now);
    return shareDetail(userId, id);
  });
}
export async function publishListeningShare(userId, input) {
  const source = listeningQuestionForUser(userId, String(input?.sourceId ?? ''));
  if (!source) throw new Error('找不到自己的听力题');
  const questions = listListeningQuestions(userId).filter((item) => item.audioAssetId && item.audioAssetId === source.audioAssetId || !source.audioAssetId && item.id === source.id);
  const pkg = {
    format: 'jlpt-share', version: 1, kind: 'listening',
    title: String(input?.title || source.audioFileName).trim().slice(0, 120),
    description: String(input?.description || '').trim().slice(0, 600),
    audioFileName: source.audioFileName,
    audioMime: source.audioMime,
    transcript: source.transcript,
    transcriptTranslation: source.transcriptTranslation,
    questions: questions.map(({ title, questionTypeId, question, choices, choiceDetails, answerIndex, explanation }) =>
      ({ title, questionTypeId, question, choices, choiceDetails, answerIndex, explanation })),
  };
  if (!pkg.title || !pkg.questions.length || Buffer.byteLength(JSON.stringify(pkg)) > 750000) throw new Error('听力分享内容无效或超过 750 KB');
  const audio = await readListeningAudioForUser(userId, source.id);
  if (!audio) throw new Error('找不到听力音频');
  const bytes = Buffer.from(audio.data, 'base64');
  const id = randomUUID();
  const path = join(sharedAudioDir, id);
  mkdirSync(sharedAudioDir, { recursive: true });
  writeFileSync(path, bytes, { flag: 'wx' });
  try {
    transaction(database(), () => {
      database().prepare('INSERT INTO market_shares (id,user_id,source_id,kind,package_json,created_at) VALUES (?,?,?,?,?,?)')
        .run(id, userId, source.id, 'listening', JSON.stringify(pkg), new Date().toISOString());
      database().prepare('INSERT INTO market_listening_audio (share_id,audio_path,audio_mime,audio_size) VALUES (?,?,?,?)')
        .run(id, path, source.audioMime, bytes.length);
    });
  } catch (error) {
    if (existsSync(path)) unlinkSync(path);
    throw error;
  }
  return shareDetail(userId, id);
}
export function listeningShareAudio(userId, id) {
  const share = shareDetail(userId, id);
  if (share.package.kind !== 'listening') throw new Error('这份分享没有听力音频');
  const row = database().prepare('SELECT audio_path,audio_mime,audio_size FROM market_listening_audio WHERE share_id=?').get(id);
  if (!row || !existsSync(row.audio_path)) {
    const error = new Error('分享音频不存在'); error.statusCode = 404; throw error;
  }
  return row;
}
export async function importListeningShare(userId, shareId) {
  const share = shareDetail(userId, shareId);
  const pkg = share.package;
  if (pkg.kind !== 'listening') throw new Error('不是听力分享');
  const existing = database().prepare('SELECT result_json FROM market_imports WHERE user_id=? AND digest=?').get(userId, `listening:${shareId}`);
  if (existing) return { ...JSON.parse(existing.result_json), alreadyImported: true };
  const row = listeningShareAudio(userId, shareId);
  const bytes = currentPlatform()?.readMedia ? await currentPlatform().readMedia(row.audio_path, 25 * 1024 * 1024) : readFileSync(row.audio_path);
  if (!bytes) throw new Error('分享音频不存在');
  const audioBase64 = Buffer.from(bytes).toString('base64');
  const created = [];
  try {
    for (const question of pkg.questions) {
      created.push(createListeningQuestion(userId, {
        ...question, audioBase64, audioMime: row.audio_mime, audioFileName: pkg.audioFileName,
        transcript: pkg.transcript, transcriptTranslation: pkg.transcriptTranslation,
      }));
    }
    const result = { kind: 'listening', id: created[0].id, title: pkg.title, count: created.length };
    database().prepare('INSERT INTO market_imports (user_id,digest,result_json) VALUES (?,?,?)').run(userId, `listening:${shareId}`, JSON.stringify(result));
    return result;
  } catch (error) {
    // Each question owns only its own imported row; storage removes shared audio with the last row.
    for (const item of created.reverse()) deleteListeningQuestion(userId, item.id);
    throw error;
  }
}
export function listShares(userId) {
  return database()
    .prepare(
      "SELECT id,user_id,package_json,created_at FROM market_shares WHERE withdrawn = 0 ORDER BY created_at DESC LIMIT 200",
    )
    .all()
    .map((row) => {
      const pkg = JSON.parse(row.package_json);
      return {
        id: row.id,
        kind: pkg.kind,
        title: pkg.title,
        description: pkg.description,
        count: (pkg.items || pkg.questions).length,
        mine: row.user_id === userId,
        createdAt: row.created_at,
      };
    });
}
export function shareDetail(userId, id) {
  const row = database()
    .prepare("SELECT * FROM market_shares WHERE id = ? AND withdrawn = 0")
    .get(id);
  if (!row) {
    const error = new Error("分享不存在或已撤回");
    error.statusCode = 404;
    throw error;
  }
  return {
    id: row.id,
    mine: row.user_id === userId,
    createdAt: row.created_at,
    ...(row.user_id === userId ? { sourceId: row.source_id } : {}),
    package: JSON.parse(row.package_json),
  };
}
export function withdrawShare(userId, id) {
  if (
    !database()
      .prepare(
        "UPDATE market_shares SET withdrawn = 1 WHERE id = ? AND user_id = ? AND withdrawn = 0",
      )
      .run(id, userId).changes
  ) {
    const error = new Error("找不到自己的分享");
    error.statusCode = 404;
    throw error;
  }
  const audio = database().prepare('SELECT audio_path FROM market_listening_audio WHERE share_id=?').get(id);
  if (audio) {
    if (existsSync(audio.audio_path)) unlinkSync(audio.audio_path);
    database().prepare('DELETE FROM market_listening_audio WHERE share_id=?').run(id);
  }
  return { ok: true };
}
// Resolve the published snapshot on the server, never the browser's preview copy.
export function importShare(userId, shareId) {
  if (typeof shareId !== 'string' || !shareId.trim()) throw new Error('请选择分享内容');
  const share = shareDetail(userId, shareId);
  let pkg = share.package;
  // Older published practices contain only questions. Recover links from the original
  // practice when it still exists and the question sequence is unchanged.
  if (pkg.kind === 'practice' && !pkg.items?.length) {
    const row = database().prepare('SELECT user_id,source_id FROM market_shares WHERE id=?').get(shareId);
    try {
      const current = sourcePackage(row.user_id, { kind: 'practice', sourceId: row.source_id });
      if (current.questions.length === pkg.questions.length && current.questions.every((q, i) =>
        q.prompt === pkg.questions[i].prompt && q.answer === pkg.questions[i].answer && JSON.stringify(q.choices) === JSON.stringify(pkg.questions[i].choices))) {
        pkg = { ...pkg, items: current.items, questions: pkg.questions.map((q, i) => ({ ...q, sourceItemIndex: current.questions[i].sourceItemIndex })) };
      }
    } catch { /* The published snapshot remains importable after its source is removed. */ }
  }
  if (pkg.kind === 'practice' && pkg.items?.length && share.package !== pkg) {
    const db = database();
    const oldDigest = createHash('sha256').update(JSON.stringify(validatePackage(share.package))).digest('hex');
    const previous = db.prepare('SELECT result_json FROM market_imports WHERE user_id=? AND digest=?').get(userId, oldDigest);
    if (previous) {
      const result = JSON.parse(previous.result_json);
      const row = db.prepare('SELECT practice_json FROM daily_practices WHERE id=? AND user_id=?').get(result.id, userId);
      if (row) {
        const practice = JSON.parse(row.practice_json);
        const ownIds = new Set(userReviewData(userId).items.map((item) => item.id));
        const needsLinks = pkg.questions.some((question, index) => question.sourceItemIndex !== undefined &&
          !ownIds.has(practice.questions[index]?.itemId));
        if (practice.questions.length === pkg.questions.length && needsLinks) transaction(db, () => {
          const itemIds = pkg.items.map((source) => {
            const id = `import-${randomUUID()}`;
            const item = { ...source, id, date: new Date().toISOString().slice(0, 10), meaning_zh: source.meaning_zh || '',
              core_memory: source.core_memory || [], type: source.type || (source.deck === 'grammar_expression' ? 'grammar' : 'vocabulary') };
            db.prepare('INSERT INTO user_review_items VALUES (?,?,?)').run(id, userId, JSON.stringify(item));
            return id;
          });
          practice.questions = practice.questions.map((question, index) => ({ ...question,
            itemId: itemIds[pkg.questions[index].sourceItemIndex] ?? question.itemId }));
          db.prepare('UPDATE daily_practices SET practice_json=?, updated_at=? WHERE id=? AND user_id=?')
            .run(JSON.stringify(practice), new Date().toISOString(), result.id, userId);
        });
      }
      return { ...result, alreadyImported: true };
    }
  }
  return importPackage(userId, pkg);
}
export function importPackage(userId, input) {
  const pkg = validatePackage(input);
  const db = database();
  const digest = createHash("sha256").update(JSON.stringify(pkg)).digest("hex");
  const existing = db
    .prepare(
      "SELECT result_json FROM market_imports WHERE user_id=? AND digest=?",
    )
    .get(userId, digest);
  if (existing)
    return { ...JSON.parse(existing.result_json), alreadyImported: true };
  return transaction(db, () => {
    let result;
    if (pkg.kind === "wordbook") {
      let title = pkg.title;
      const titles = new Set(
        listWordbooks(userId).map((b) => b.title.toLowerCase()),
      );
      let i = 2;
      while (titles.has(title.toLowerCase()))
        title = `${pkg.title.slice(0, 90)} (${i++})`;
      const book = createWordbook(userId, { title, deck: pkg.items[0].deck });
      for (const source of pkg.items) {
        const id = `import-${randomUUID()}`;
        const item = {
          ...source,
          id,
          date: new Date().toISOString().slice(0, 10),
          wordbook_id: book.id,
          meaning_zh: source.meaning_zh || "",
          core_memory: source.core_memory || [],
          type: source.type || "vocabulary",
        };
        db.prepare("INSERT INTO user_review_items VALUES (?,?,?)").run(
          id,
          userId,
          JSON.stringify(item),
        );
      }
      result = { kind: pkg.kind, id: book.id, title: book.title };
    } else {
      const id = `shared-${randomUUID()}`;
      const now = new Date().toISOString();
      const date = now.slice(0, 10);
      const draft = createReviewPackDraft(userId, {
        title: pkg.title,
        status: "archived",
        content: { source: "market-import", sections: [] },
      });
      const importedItemIds = (pkg.items ?? []).map((source) => {
        const itemId = `import-${randomUUID()}`;
        const item = { ...source, id: itemId, date, meaning_zh: source.meaning_zh || '',
          core_memory: source.core_memory || [], type: source.type || (source.deck === 'grammar_expression' ? 'grammar' : 'vocabulary') };
        db.prepare('INSERT INTO user_review_items VALUES (?,?,?)').run(itemId, userId, JSON.stringify(item));
        return itemId;
      });
      const questions = pkg.questions.map((question, index) => ({
        ...question,
        id: `${id}-q${index + 1}`,
        itemId: importedItemIds[question.sourceItemIndex] ?? `${id}-item${index + 1}`,
        sourceItemIndex: undefined,
        context: question.context || question.prompt,
        correctReason: question.correctReason || "",
        memoryPoint: question.memoryPoint || "",
        choiceAnalysis: question.choiceAnalysis || [],
      }));
      const version = Number(
        db
          .prepare(
            "SELECT COALESCE(MAX(version),0)+1 AS v FROM daily_practices WHERE user_id=? AND practice_date=?",
          )
          .get(userId, date).v,
      );
      const practice = {
        id,
        date,
        version,
        title: pkg.title,
        minutes: 30,
        strategy: "shared_topic",
        sourceDraftId: draft.id,
        questions,
        generated_at: now,
        verification_status: "needs_review",
        content_origin: "user_provided",
        disclaimer: "用户分享内容，请结合解析自行核对。",
      };
      db.prepare(
        "INSERT INTO daily_practices (id,user_id,practice_date,version,title,minutes,practice_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
      ).run(
        id,
        userId,
        date,
        version,
        pkg.title,
        30,
        JSON.stringify(practice),
        now,
        now,
      );
      result = { kind: pkg.kind, id, title: pkg.title };
    }
    db.prepare("INSERT INTO market_imports VALUES (?,?,?)").run(
      userId,
      digest,
      JSON.stringify(result),
    );
    return result;
  });
}
