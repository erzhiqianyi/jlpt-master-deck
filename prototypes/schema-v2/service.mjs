// 演示用服务层：每个写操作一个事务，编号在事务内分配。
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { kanaToRomaji, romajiColumns, romajiSearchKey, isKana } from './romaji.mjs';
import { validateRuby } from './ruby.mjs';

const here = (name) => new URL(name, import.meta.url);

export function openDatabase(path = ':memory:', { seed = true } = {}) {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(readFileSync(here('schema.sql'), 'utf8'));
  if (seed) db.exec(readFileSync(here('seed.sql'), 'utf8'));
  return db;
}

// 可嵌套：已在事务中时直接并入外层事务
function transaction(db, work) {
  if (db.isTransaction) return work();
  db.exec('BEGIN IMMEDIATE');
  try { const result = work(); db.exec('COMMIT'); return result; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}

const number = (value) => (/^\d+$/.test(value) ? Number(value) : value);

// ---------- 编号 ----------

export function nextCode(db, userId, prefix) {
  const { last_no: no } = db.prepare(`INSERT INTO id_sequences (user_id, prefix, last_no) VALUES (?, ?, 1)
    ON CONFLICT (user_id, prefix) DO UPDATE SET last_no = last_no + 1 RETURNING last_no`).get(userId, prefix);
  return { id: `${prefix}${no}`, no };
}

function logChange(db, userId, tableName, recordCode, operation, now) {
  const { seq } = db.prepare('SELECT coalesce(max(seq), 0) + 1 AS seq FROM sync_changes WHERE user_id = ?').get(userId);
  db.prepare('INSERT INTO sync_changes VALUES (?, ?, ?, ?, ?, ?)').run(userId, seq, tableName, recordCode, operation, now);
}

// 按编号查记录，旧编号（IT101）先经对照表转换
export function findByCode(db, userId, code) {
  const legacy = db.prepare('SELECT new_code FROM legacy_references WHERE user_id = ? AND legacy_code = ?').get(userId, code);
  const resolved = legacy?.new_code ?? code;
  const prefix = resolved.match(/^[A-Z]+/)?.[0];
  const type = prefix && db.prepare('SELECT table_name, label_key FROM business_types WHERE prefix = ?').get(prefix);
  if (!type) return null;
  const row = db.prepare(`SELECT * FROM ${type.table_name} WHERE user_id = ? AND id = ?`).get(userId, resolved);
  return row ? { code: resolved, legacyCode: legacy ? code : undefined, labelKey: type.label_key, table: type.table_name, row } : null;
}

// ---------- 多语言 ----------

// 回退顺序：请求语言 → 其 fallback 链 → 任意已有译文（标记为回退）
export function languageChain(db, language) {
  const chain = [];
  for (let code = language; code && !chain.includes(code);) {
    chain.push(code);
    code = db.prepare('SELECT fallback_code FROM languages WHERE code = ?').get(code)?.fallback_code;
  }
  return chain;
}

// rows：同一对象的各语言译文；返回最合适的一条及其语言
export function pickTranslation(db, rows, language) {
  if (!rows.length) return null;
  const chain = languageChain(db, language);
  const row = chain.map((code) => rows.find((r) => r.language === code)).find(Boolean)
    ?? rows.find((r) => r.language !== 'ja') ?? rows[0];
  return { ...row, requested: language, isFallback: row.language !== language };
}

// 可翻译字段登记：编号格式 → 翻译表与主键列
const TRANSLATABLE = [
  [/^([WGN]\d+)$/, 'knowledge_point_translations', ['knowledge_point_id'], ['explanation', 'usage_note', 'exam_tip']],
  [/^([WGN]\d+)\.m(\d+)$/, 'knowledge_meaning_translations', ['knowledge_point_id', 'meaning_no'], ['meaning']],
  [/^([WGN]\d+)\.ex(\d+)$/, 'knowledge_example_translations', ['knowledge_point_id', 'example_no'], ['translation']],
  [/^([WGN]\d+)\.note(\d+)$/, 'knowledge_note_translations', ['knowledge_point_id', 'note_no'], ['body']],
  [/^(Q[VGRL]\d+)r(\d+)$/, 'question_revision_translations', ['question_id', 'revision'], ['explanation', 'memory_point']],
  [/^(Q[VGRL]\d+)r(\d+)\.opt(\d+)$/, 'question_option_translations', ['question_id', 'revision', 'option_no'], ['analysis']],
  [/^(M\d+)r(\d+)$/, 'question_material_translations', ['material_id', 'revision'], ['title', 'translation']],
];
// 日语原文字段登记（language 固定为 ja）
const SOURCE = [
  [/^([WGN]\d+)$/, 'knowledge_points', ['id'], ['expression']],
  [/^([WGN]\d+)\.ex(\d+)$/, 'knowledge_examples', ['knowledge_point_id', 'example_no'], ['sentence']],
  [/^([WGN]\d+)\.note(\d+)$/, 'knowledge_notes', ['knowledge_point_id', 'note_no'], ['label']],
  [/^(Q[VGRL]\d+)r(\d+)$/, 'question_revisions', ['question_id', 'revision'], ['instruction', 'prompt']],
  [/^(Q[VGRL]\d+)r(\d+)\.opt(\d+)$/, 'question_options', ['question_id', 'revision', 'option_no'], ['option_text']],
  [/^(M\d+)r(\d+)$/, 'question_materials', ['id', 'revision'], ['title', 'body']],
];

function resolveField(registry, targetCode, field) {
  for (const [pattern, table, keys, fields] of registry) {
    const match = targetCode.match(pattern);
    if (match && fields.includes(field)) return { table, keys, values: match.slice(1).map(number) };
  }
  return null;
}

// 读取某个字段在某种语言下的当前文字
export function currentText(db, userId, targetCode, field, language) {
  const source = resolveField(SOURCE, targetCode, field);
  const target = source ?? resolveField(TRANSLATABLE, targetCode, field);
  if (!target) throw new Error(`${targetCode} 没有字段 ${field}`);
  if (source && language !== 'ja') throw new Error(`${field} 是日语原文，language 必须是 ja`);
  const where = target.keys.map((k) => `${k} = ?`).join(' AND ') + (source ? '' : ' AND language = ?');
  const row = db.prepare(`SELECT ${field} AS text FROM ${target.table} WHERE user_id = ? AND ${where}`)
    .get(userId, ...target.values, ...(source ? [] : [language]));
  if (!row || row.text == null) throw new Error(`找不到 ${targetCode} 的 ${field}（${language}）`);
  return row.text;
}

// MCP 工具 set_translation：给任意可翻译字段写入一种语言
export function setTranslation(db, userId, { targetCode, field, language, text, origin = 'ai', now }) {
  const target = resolveField(TRANSLATABLE, targetCode, field);
  if (!target) throw new Error(`${targetCode} 的 ${field} 不是可翻译字段`);
  if (!db.prepare('SELECT 1 FROM languages WHERE code = ? AND enabled = 1').get(language)) throw new Error(`不支持的语言：${language}`);
  const columns = ['user_id', ...target.keys, 'language', 'origin', 'verified', 'updated_at', field];
  db.prepare(`INSERT INTO ${target.table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})
    ON CONFLICT (user_id, ${target.keys.join(',')}, language) DO UPDATE SET ${field} = excluded.${field},
      origin = excluded.origin, verified = 0, updated_at = excluded.updated_at`)
    .run(userId, ...target.values, language, origin, 0, now, text);
  logChange(db, userId, target.table, `${targetCode}/${language}`, 'upsert', now);
}

// ---------- 语言设置与待翻译清单（供 MCP 暴露给用户自己的 AI） ----------

export const listLanguages = (db) => db.prepare('SELECT code, native_name, fallback_code FROM languages WHERE enabled = 1 ORDER BY rowid').all();

export function getLanguageSettings(db, userId) {
  const settings = db.prepare('SELECT ui_language, explanation_language FROM user_settings WHERE user_id = ?').get(userId);
  return { ...settings, fallbackChain: languageChain(db, settings.explanation_language) };
}

export function setLanguageSettings(db, userId, { uiLanguage, explanationLanguage, now }) {
  for (const code of [uiLanguage, explanationLanguage].filter(Boolean)) {
    if (!db.prepare('SELECT 1 FROM languages WHERE code = ? AND enabled = 1').get(code)) throw new Error(`不支持的语言：${code}`);
  }
  db.prepare(`UPDATE user_settings SET ui_language = coalesce(?, ui_language), explanation_language = coalesce(?, explanation_language),
    updated_at = ? WHERE user_id = ?`).run(uiLanguage ?? null, explanationLanguage ?? null, now, userId);
  const settings = db.prepare('SELECT ui_language, explanation_language FROM user_settings WHERE user_id = ?').get(userId);
  return { ...settings, fallbackChain: languageChain(db, settings.explanation_language) };
}

// 列出某语言缺少的译文：每项给出编号、字段、日语原文和其他语言的已有译文，AI 据此翻译后调用 set_translation
// 只列当前修订的题目（旧修订只用于历史记录，不需要补译）
const MISSING = [
  { field: 'meaning', sql: `SELECT p.id || '.m' || m.meaning_no AS target_code, p.expression || '（' || coalesce(p.reading, '') || '）' AS source,
      m.knowledge_point_id AS k1, m.meaning_no AS k2 FROM knowledge_meanings m
      JOIN knowledge_points p ON p.user_id = m.user_id AND p.id = m.knowledge_point_id
      WHERE m.user_id = ? AND p.status <> 'archived' AND NOT EXISTS (SELECT 1 FROM knowledge_meaning_translations t
        WHERE t.user_id = m.user_id AND t.knowledge_point_id = m.knowledge_point_id AND t.meaning_no = m.meaning_no AND t.language = ?)`,
    refs: 'SELECT language, meaning AS text FROM knowledge_meaning_translations WHERE user_id = ? AND knowledge_point_id = ? AND meaning_no = ?' },
  { field: 'translation', sql: `SELECT e.knowledge_point_id || '.ex' || e.example_no AS target_code, e.sentence AS source,
      e.knowledge_point_id AS k1, e.example_no AS k2 FROM knowledge_examples e
      WHERE e.user_id = ? AND NOT EXISTS (SELECT 1 FROM knowledge_example_translations t
        WHERE t.user_id = e.user_id AND t.knowledge_point_id = e.knowledge_point_id AND t.example_no = e.example_no AND t.language = ?)`,
    refs: 'SELECT language, translation AS text FROM knowledge_example_translations WHERE user_id = ? AND knowledge_point_id = ? AND example_no = ?' },
  { field: 'body', sql: `SELECT n.knowledge_point_id || '.note' || n.note_no AS target_code, coalesce(n.label, '') AS source,
      n.knowledge_point_id AS k1, n.note_no AS k2 FROM knowledge_notes n
      WHERE n.user_id = ? AND NOT EXISTS (SELECT 1 FROM knowledge_note_translations t
        WHERE t.user_id = n.user_id AND t.knowledge_point_id = n.knowledge_point_id AND t.note_no = n.note_no AND t.language = ?)`,
    refs: 'SELECT language, body AS text FROM knowledge_note_translations WHERE user_id = ? AND knowledge_point_id = ? AND note_no = ?' },
  { field: 'explanation', sql: `SELECT q.id || 'r' || q.current_revision AS target_code, r.prompt AS source,
      q.id AS k1, q.current_revision AS k2 FROM questions q
      JOIN question_revisions r ON r.user_id = q.user_id AND r.question_id = q.id AND r.revision = q.current_revision
      WHERE q.user_id = ? AND q.status <> 'archived' AND NOT EXISTS (SELECT 1 FROM question_revision_translations t
        WHERE t.user_id = q.user_id AND t.question_id = q.id AND t.revision = q.current_revision AND t.language = ?)`,
    refs: 'SELECT language, explanation AS text FROM question_revision_translations WHERE user_id = ? AND question_id = ? AND revision = ? AND explanation IS NOT NULL' },
];

export function listMissingTranslations(db, userId, { language, limit = 50 }) {
  if (!db.prepare('SELECT 1 FROM languages WHERE code = ? AND enabled = 1').get(language)) throw new Error(`不支持的语言：${language}`);
  const items = [];
  for (const kind of MISSING) {
    for (const row of db.prepare(kind.sql).all(userId, language)) {
      const references = Object.fromEntries(db.prepare(kind.refs).all(userId, row.k1, row.k2).map((r) => [r.language, r.text]));
      if (!Object.keys(references).length) continue;     // 没有任何语言可参照的（如没写解析的题）不列
      items.push({ targetCode: row.target_code, field: kind.field, source: row.source, references });
    }
  }
  return { language, total: items.length, items: items.slice(0, limit) };
}

// ---------- 知识点 ----------

const KIND_PREFIX = { word: 'W', grammar: 'G', name: 'N' };
const insertTranslation = (db, table, keys, values, language, origin, now, field, text) => {
  const columns = ['user_id', ...keys, 'language', 'origin', 'verified', 'updated_at', field];
  db.prepare(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`)
    .run(...values, language, origin, origin === 'manual' ? 1 : 0, now, text);
};

// meanings: [{ partOfSpeech, translations: { 'zh-Hans': '吃', en: 'to eat' } }]，每个义项至少一种语言
export function createKnowledgePoint(db, userId, input) {
  return transaction(db, () => {
    const { id, no } = nextCode(db, userId, KIND_PREFIX[input.kind]);
    const romaji = romajiColumns(input.reading ?? null, input.customRomaji);
    db.prepare(`INSERT INTO knowledge_points (user_id,id,no,kind,wordbook_id,expression,reading,romaji,romaji_key,romaji_custom,
      jlpt_level,status,origin,verified,ai_draft_batch_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(userId, id, no, input.kind, input.wordbookId, input.expression, input.reading ?? null, romaji.romaji, romaji.romaji_key,
        romaji.romaji_custom, input.jlptLevel ?? null, input.status ?? 'active', input.origin, input.verified ?? 0, input.batchId ?? null, input.now, input.now);
    const textOrigin = input.origin === 'manual' ? 'manual' : input.origin === 'ai' ? 'ai' : 'import';
    (input.meanings ?? []).forEach((meaning, index) => {
      const entries = Object.entries(meaning.translations ?? {});
      if (!entries.length) throw new Error(`${id} 的第 ${index + 1} 个义项没有任何语言的释义`);
      db.prepare('INSERT INTO knowledge_meanings VALUES (?,?,?,?)').run(userId, id, index + 1, meaning.partOfSpeech ?? null);
      for (const [language, text] of entries) insertTranslation(db, 'knowledge_meaning_translations', ['knowledge_point_id', 'meaning_no'],
        [userId, id, index + 1], language, textOrigin, input.now, 'meaning', text);
    });
    db.prepare(`INSERT INTO review_schedules (user_id, knowledge_point_id, algorithm, state) VALUES (?, ?, 'sm2-v1', 'new')`).run(userId, id);
    logChange(db, userId, 'knowledge_points', id, 'upsert', input.now);
    return id;
  });
}

// 按语言取词条；每段说明都带上实际使用的语言、是否回退、是否 AI 未核对
export function getKnowledgePoint(db, userId, id, language) {
  const point = db.prepare('SELECT * FROM knowledge_points WHERE user_id = ? AND id = ?').get(userId, id);
  if (!point) return null;
  const all = (sql, ...keys) => db.prepare(sql).all(userId, id, ...keys);
  const pick = (rows) => pickTranslation(db, rows, language);
  return {
    ...point,
    texts: pick(all('SELECT * FROM knowledge_point_translations WHERE user_id=? AND knowledge_point_id=?')),
    meanings: all('SELECT meaning_no, part_of_speech FROM knowledge_meanings WHERE user_id=? AND knowledge_point_id=? ORDER BY meaning_no')
      .map((m) => ({ ...m, text: pick(all('SELECT * FROM knowledge_meaning_translations WHERE user_id=? AND knowledge_point_id=? AND meaning_no=?', m.meaning_no)),
        japaneseDefinition: all("SELECT meaning FROM knowledge_meaning_translations WHERE user_id=? AND knowledge_point_id=? AND meaning_no=? AND language='ja'", m.meaning_no)[0]?.meaning })),
    examples: all('SELECT example_no, sentence FROM knowledge_examples WHERE user_id=? AND knowledge_point_id=? ORDER BY example_no')
      .map((e) => ({ ...e, ruby: validAnnotation(db, userId, `${id}.ex${e.example_no}`, 'sentence', 'ja'),
        translation: pick(all('SELECT * FROM knowledge_example_translations WHERE user_id=? AND knowledge_point_id=? AND example_no=?', e.example_no)) })),
    forms: all('SELECT form_code, expression, reading, romaji FROM knowledge_forms WHERE user_id=? AND knowledge_point_id=? ORDER BY rowid'),
    notes: all('SELECT note_no, kind, label FROM knowledge_notes WHERE user_id=? AND knowledge_point_id=? ORDER BY note_no')
      .map((n) => ({ ...n, body: pick(all('SELECT * FROM knowledge_note_translations WHERE user_id=? AND knowledge_point_id=? AND note_no=?', n.note_no)) })),
    tags: all('SELECT tag FROM knowledge_tags WHERE user_id=? AND knowledge_point_id=? ORDER BY tag').map((t) => t.tag),
  };
}

// 搜索：编号、假名、罗马音、日语表达、任意语言的释义
export function searchKnowledge(db, userId, query) {
  const q = query.trim();
  if (/^[A-Z]{1,3}\d+$/.test(q)) { const hit = findByCode(db, userId, q); return hit ? [hit.row] : []; }
  const select = "SELECT DISTINCT k.id, k.expression, k.reading, k.romaji FROM knowledge_points k WHERE k.user_id = ? AND k.status <> 'archived'";
  if (isKana(q)) return db.prepare(`${select} AND k.romaji_key LIKE ? ORDER BY k.id`).all(userId, `${romajiSearchKey(kanaToRomaji(q))}%`);
  const byRomaji = /^[\p{Script=Latin}\s'\-~]+$/u.test(q)
    ? db.prepare(`${select} AND k.romaji_key LIKE ? ORDER BY k.id`).all(userId, `${romajiSearchKey(q)}%`) : [];
  if (byRomaji.length) return byRomaji;
  return db.prepare(`${select} AND (k.expression LIKE ? OR EXISTS (SELECT 1 FROM knowledge_meaning_translations t
    WHERE t.user_id = k.user_id AND t.knowledge_point_id = k.id AND t.meaning LIKE ?)) ORDER BY k.id`).all(userId, `%${q}%`, `%${q}%`);
}

export function editExampleSentence(db, userId, knowledgePointId, exampleNo, sentence, now) {
  transaction(db, () => {
    db.prepare('UPDATE knowledge_examples SET sentence = ? WHERE user_id = ? AND knowledge_point_id = ? AND example_no = ?')
      .run(sentence, userId, knowledgePointId, exampleNo);
    // 原文变了，各语言译文保留但改为待核对
    db.prepare('UPDATE knowledge_example_translations SET verified = 0, updated_at = ? WHERE user_id = ? AND knowledge_point_id = ? AND example_no = ?')
      .run(now, userId, knowledgePointId, exampleNo);
    db.prepare('UPDATE knowledge_points SET updated_at = ? WHERE user_id = ? AND id = ?').run(now, userId, knowledgePointId);
    logChange(db, userId, 'knowledge_points', knowledgePointId, 'upsert', now);
  });
}

// ---------- 按需注音 ----------

// 注音有效才返回；原文已改则视为过期，返回 null（界面显示原文）
export function validAnnotation(db, userId, targetCode, field, language) {
  const row = db.prepare('SELECT annotated_text FROM ruby_annotations WHERE user_id=? AND target_code=? AND field=? AND language=?')
    .get(userId, targetCode, field, language);
  if (!row) return null;
  let text;
  try { text = currentText(db, userId, targetCode, field, language); } catch { return null; }
  return validateRuby(row.annotated_text, text).length === 0 ? row.annotated_text : null;
}

// MCP 工具 set_ruby_annotation 的实现
export function setRubyAnnotation(db, userId, { targetCode, field, language = 'ja', annotatedText, createdBy = 'ai', now }) {
  const errors = validateRuby(annotatedText, currentText(db, userId, targetCode, field, language));
  if (errors.length) return { ok: false, errors };
  db.prepare(`INSERT INTO ruby_annotations VALUES (?,?,?,?,?,?,?)
    ON CONFLICT (user_id, target_code, field, language) DO UPDATE SET annotated_text = excluded.annotated_text,
      created_by = excluded.created_by, created_at = excluded.created_at`).run(userId, targetCode, field, language, annotatedText, createdBy, now);
  return { ok: true };
}

// ---------- 练习 ----------

export function startAttempt(db, userId, { practiceSetId, mode = 'practice', source, now, shuffle = (list) => [...list].reverse() }) {
  return transaction(db, () => {
    const set = db.prepare("SELECT * FROM practice_sets WHERE user_id = ? AND id = ? AND status = 'ready'").get(userId, practiceSetId);
    if (!set) throw new Error(`练习 ${practiceSetId} 不存在或未就绪`);
    const entries = db.prepare('SELECT * FROM practice_set_questions WHERE user_id = ? AND practice_set_id = ? ORDER BY ordinal').all(userId, practiceSetId);
    const { id, no } = nextCode(db, userId, 'AT');
    const deadline = set.time_limit_minutes ? new Date(Date.parse(now) + set.time_limit_minutes * 60000).toISOString() : null;
    db.prepare(`INSERT INTO practice_attempts (user_id,id,no,practice_set_id,mode,status,started_at,deadline_at,question_count,source)
      VALUES (?,?,?,?,?,'active',?,?,?,?)`).run(userId, id, no, practiceSetId, mode, now, deadline, entries.length, source);
    for (const entry of entries) {
      const optionNos = db.prepare('SELECT option_no FROM question_options WHERE user_id=? AND question_id=? AND revision=? ORDER BY option_no')
        .all(userId, entry.question_id, entry.question_revision).map((o) => o.option_no);
      db.prepare('INSERT INTO practice_attempt_questions VALUES (?,?,?,?,?,?)')
        .run(userId, id, entry.ordinal, entry.question_id, entry.question_revision, shuffle(optionNos).join(','));
    }
    logChange(db, userId, 'practice_attempts', id, 'upsert', now);
    return id;
  });
}

// 作答前只给日语题面；作答后才按用户语言给解析、选项分析、听力原文和译文、注音
export function deliverQuestion(db, userId, attemptId, ordinal, language) {
  const slot = db.prepare('SELECT * FROM practice_attempt_questions WHERE user_id=? AND attempt_id=? AND ordinal=?').get(userId, attemptId, ordinal);
  const key = [userId, slot.question_id, slot.question_revision];
  const revision = db.prepare('SELECT * FROM question_revisions WHERE user_id=? AND question_id=? AND revision=?').get(...key);
  const question = db.prepare('SELECT type_id FROM questions WHERE user_id=? AND id=?').get(userId, slot.question_id);
  const answer = db.prepare('SELECT * FROM question_answers WHERE user_id=? AND attempt_id=? AND attempt_ordinal=?').get(userId, attemptId, ordinal);
  const options = slot.option_order.split(',').map(Number).map((optionNo, index) => {
    const o = db.prepare('SELECT * FROM question_options WHERE user_id=? AND question_id=? AND revision=? AND option_no=?').get(...key, optionNo);
    const shown = { label: index + 1, optionNo, text: o.option_text };
    if (answer) Object.assign(shown, { isCorrect: Boolean(o.is_correct), correctPosition: o.correct_position,
      analysis: pickTranslation(db, db.prepare('SELECT * FROM question_option_translations WHERE user_id=? AND question_id=? AND revision=? AND option_no=?').all(...key, optionNo), language) });
    return shown;
  });
  const code = `${slot.question_id}r${slot.question_revision}`;
  const delivery = { code, typeId: question.type_id, answerMode: revision.answer_mode, instruction: revision.instruction,
    prompt: revision.prompt, promptTarget: revision.prompt_target, starPosition: revision.star_position, options };
  if (revision.material_id) {
    const material = db.prepare('SELECT * FROM question_materials WHERE user_id=? AND id=? AND revision=?').get(userId, revision.material_id, revision.material_revision);
    delivery.material = { code: `${material.id}r${material.revision}`, kind: material.kind, audioMediaId: material.audio_media_id };
    // 听力原文作答后才显示；阅读文章作答前就要显示
    if (answer || material.kind === 'reading_passage') Object.assign(delivery.material, { body: material.body,
      translation: pickTranslation(db, db.prepare('SELECT * FROM question_material_translations WHERE user_id=? AND material_id=? AND revision=?').all(userId, material.id, material.revision), language) });
  }
  if (answer) {
    delivery.result = { answerCode: answer.id, selectedOptionNo: answer.selected_option_no, isCorrect: Boolean(answer.is_correct) };
    delivery.texts = pickTranslation(db, db.prepare('SELECT * FROM question_revision_translations WHERE user_id=? AND question_id=? AND revision=?').all(...key), language);
    delivery.ruby = {};
    const prompt = validAnnotation(db, userId, code, 'prompt', 'ja');
    if (prompt) delivery.ruby.prompt = prompt;
    const explanation = delivery.texts && validAnnotation(db, userId, code, 'explanation', delivery.texts.language);
    if (explanation) delivery.ruby.explanation = explanation;
  }
  return delivery;
}

// 提交一题；clientEventId 用于离线重传去重
export function submitAnswer(db, userId, { attemptId, ordinal, clientEventId, selectedOptionNo, arrangement, elapsedMs, source, now }) {
  return transaction(db, () => {
    const replay = db.prepare('SELECT id, is_correct FROM question_answers WHERE user_id=? AND client_event_id=?').get(userId, clientEventId);
    if (replay) return { answerCode: replay.id, isCorrect: Boolean(replay.is_correct), replayed: true };
    const attempt = db.prepare("SELECT * FROM practice_attempts WHERE user_id=? AND id=? AND status='active'").get(userId, attemptId);
    if (!attempt) throw new Error(`${attemptId} 不是进行中的练习`);
    const slot = db.prepare('SELECT * FROM practice_attempt_questions WHERE user_id=? AND attempt_id=? AND ordinal=?').get(userId, attemptId, ordinal);
    const revision = db.prepare('SELECT * FROM question_revisions WHERE user_id=? AND question_id=? AND revision=?').get(userId, slot.question_id, slot.question_revision);
    const option = (no) => db.prepare('SELECT * FROM question_options WHERE user_id=? AND question_id=? AND revision=? AND option_no=?')
      .get(userId, slot.question_id, slot.question_revision, no);
    let chosen = selectedOptionNo, isCorrect = null;
    if (revision.answer_mode === 'single') {
      if (!option(chosen)) throw new Error('选项不存在');
      isCorrect = option(chosen).is_correct;
    }
    if (revision.answer_mode === 'arrangement') {
      chosen = arrangement[revision.star_position - 1];
      isCorrect = option(chosen).correct_position === revision.star_position ? 1 : 0;   // JLPT 只按 ★ 位置评分
    }
    const { id, no } = nextCode(db, userId, 'AN');
    db.prepare(`INSERT INTO question_answers (user_id,id,no,client_event_id,attempt_id,attempt_ordinal,question_id,question_revision,
      selected_option_no,is_correct,elapsed_ms,answered_at,source) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(userId, id, no, clientEventId, attemptId, ordinal, slot.question_id, slot.question_revision, chosen ?? null, isCorrect, elapsedMs ?? null, now, source);
    (arrangement ?? []).forEach((optionNo, index) => db.prepare('INSERT INTO question_answer_selections VALUES (?,?,?,?)').run(userId, id, index + 1, optionNo));
    db.prepare('UPDATE practice_attempts SET answered_count = answered_count + 1, correct_count = correct_count + ? WHERE user_id=? AND id=?')
      .run(isCorrect ? 1 : 0, userId, attemptId);
    logChange(db, userId, 'question_answers', id, 'upsert', now);
    return { answerCode: id, isCorrect: Boolean(isCorrect), replayed: false };
  });
}

export function completeAttempt(db, userId, attemptId, now, localDate) {
  return transaction(db, () => {
    const attempt = db.prepare('SELECT * FROM practice_attempts WHERE user_id=? AND id=?').get(userId, attemptId);
    db.prepare("UPDATE practice_attempts SET status='completed', completed_at=? WHERE user_id=? AND id=?").run(now, userId, attemptId);
    // 计划任务进度：同一练习、当天、未完成的任务
    for (const task of db.prepare("SELECT * FROM study_plan_tasks WHERE user_id=? AND practice_set_id=? AND scheduled_date=? AND status='planned'").all(userId, attempt.practice_set_id, localDate)) {
      const done = Math.min(task.target_count, attempt.answered_count);
      const finished = done >= task.target_count;
      db.prepare('UPDATE study_plan_tasks SET completed_count=?, status=?, completed_at=? WHERE user_id=? AND id=?')
        .run(done, finished ? 'completed' : 'planned', finished ? now : null, userId, task.id);
    }
    logChange(db, userId, 'practice_attempts', attemptId, 'upsert', now);
    return db.prepare('SELECT * FROM practice_attempts WHERE user_id=? AND id=?').get(userId, attemptId);
  });
}

// ---------- 记忆复习（简化 SM-2） ----------

export function dueReviews(db, userId, now) {
  return db.prepare(`SELECT k.id, k.expression, k.reading, k.romaji, s.due_at, s.state FROM review_schedules s
    JOIN knowledge_points k ON k.user_id = s.user_id AND k.id = s.knowledge_point_id
    WHERE s.user_id = ? AND s.due_at <= ? AND k.status = 'active' ORDER BY s.due_at`).all(userId, now);
}

export function nextSchedule(previous, rating) {
  let { interval_days: interval, ease, lapses } = previous;
  if (rating === 'forgot') { lapses += 1; ease = Math.max(1.3, ease - 0.2); interval = 0; }
  if (rating === 'hard') { ease = Math.max(1.3, ease - 0.15); interval = Math.max(1, interval * 1.2); }
  if (rating === 'remembered') interval = interval < 1 ? 1 : interval * ease;
  if (rating === 'easy') { ease += 0.15; interval = interval < 1 ? 4 : interval * ease * 1.3; }
  return { interval: Math.round(interval * 10) / 10, ease: Math.round(ease * 100) / 100, lapses };
}

export function rateMemory(db, userId, { knowledgePointId, rating, clientEventId, source, now, localDate }) {
  return transaction(db, () => {
    const replay = db.prepare('SELECT id FROM memory_ratings WHERE user_id=? AND client_event_id=?').get(userId, clientEventId);
    if (replay) return { ratingCode: replay.id, replayed: true };
    const { id, no } = nextCode(db, userId, 'MR');
    db.prepare('INSERT INTO memory_ratings VALUES (?,?,?,?,?,?,?,?)').run(userId, id, no, clientEventId, knowledgePointId, rating, now, source);
    const previous = db.prepare('SELECT * FROM review_schedules WHERE user_id=? AND knowledge_point_id=?').get(userId, knowledgePointId);
    const next = nextSchedule(previous, rating);
    const due = new Date(Date.parse(now) + (next.interval === 0 ? 10 * 60000 : next.interval * 86400000)).toISOString();
    db.prepare(`UPDATE review_schedules SET state=?, due_at=?, interval_days=?, ease=?, lapses=?, review_count=review_count+1, last_reviewed_at=?
      WHERE user_id=? AND knowledge_point_id=?`).run(next.interval === 0 ? 'learning' : 'review', due, next.interval, next.ease, next.lapses, now, userId, knowledgePointId);
    // 当天的记忆复习任务 +1
    const book = db.prepare('SELECT wordbook_id FROM knowledge_points WHERE user_id=? AND id=?').get(userId, knowledgePointId).wordbook_id;
    const task = db.prepare("SELECT * FROM study_plan_tasks WHERE user_id=? AND kind='memory_review' AND wordbook_id=? AND scheduled_date=? AND status='planned'").get(userId, book, localDate);
    if (task) {
      const done = task.completed_count + 1;
      db.prepare('UPDATE study_plan_tasks SET completed_count=?, status=?, completed_at=? WHERE user_id=? AND id=?')
        .run(done, done >= task.target_count ? 'completed' : 'planned', done >= task.target_count ? now : null, userId, task.id);
    }
    logChange(db, userId, 'memory_ratings', id, 'upsert', now);
    return { ratingCode: id, dueAt: due, intervalDays: next.interval, replayed: false };
  });
}

// ---------- 计划与总结 ----------

export const todayTasks = (db, userId, localDate) => db.prepare(`SELECT id, title, kind, target_count, completed_count, status, practice_set_id
  FROM study_plan_tasks WHERE user_id=? AND scheduled_date=? ORDER BY no`).all(userId, localDate);

// 总结用用户的说明语言生成（实际由 AI 写，这里用模板代替）
const SUMMARY_TEMPLATES = {
  'zh-Hans': { summary: (a, c, r) => `答题 ${a} 道，答对 ${c} 道；复习卡片 ${r} 张。`, wrong: (q) => `${q} 答错` },
  en: { summary: (a, c, r) => `Answered ${a}, correct ${c}; reviewed ${r} cards.`, wrong: (q) => `Missed ${q}` },
};

export function buildDailySummary(db, userId, localDate, now) {
  return transaction(db, () => {
    const preferred = db.prepare('SELECT explanation_language FROM user_settings WHERE user_id=?').get(userId).explanation_language;
    const language = languageChain(db, preferred).find((code) => SUMMARY_TEMPLATES[code]) ?? 'en';
    const template = SUMMARY_TEMPLATES[language];
    const start = new Date(`${localDate}T00:00:00+09:00`).toISOString(), end = new Date(Date.parse(start) + 86400000).toISOString();
    const answers = db.prepare('SELECT count(*) AS answered, coalesce(sum(is_correct), 0) AS correct FROM question_answers WHERE user_id=? AND answered_at>=? AND answered_at<?').get(userId, start, end);
    const reviews = db.prepare('SELECT count(*) AS n FROM memory_ratings WHERE user_id=? AND reviewed_at>=? AND reviewed_at<?').get(userId, start, end).n;
    const wrong = db.prepare(`SELECT a.question_id, q.type_id, l.knowledge_point_id FROM question_answers a
      JOIN questions q ON q.user_id=a.user_id AND q.id=a.question_id
      LEFT JOIN question_knowledge_points l ON l.user_id=a.user_id AND l.question_id=a.question_id AND l.revision=a.question_revision AND l.role='target'
      WHERE a.user_id=? AND a.answered_at>=? AND a.answered_at<? AND a.is_correct=0`).all(userId, start, end);
    db.prepare('DELETE FROM daily_summaries WHERE user_id=? AND summary_date=?').run(userId, localDate);
    db.prepare(`INSERT INTO daily_summaries (user_id, summary_date, time_zone, answered_count, correct_count, memory_review_count, language, summary, generated_at)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(userId, localDate, 'Asia/Tokyo', answers.answered, answers.correct, reviews, language,
      template.summary(answers.answered, answers.correct, reviews), now);
    wrong.forEach((w, index) => db.prepare('INSERT INTO daily_summary_points VALUES (?,?,?,?,?,?,?)')
      .run(userId, localDate, index + 1, 'weakness', template.wrong(w.question_id), w.knowledge_point_id, w.type_id));
    return { answered: answers.answered, correct: answers.correct, reviews, weaknesses: wrong.map((w) => w.question_id), language };
  });
}

// ---------- AI 草稿、收集箱 ----------

export function approveDraftBatch(db, userId, batchId, now) {
  transaction(db, () => {
    db.prepare("UPDATE ai_draft_batches SET status='approved', decided_at=? WHERE user_id=? AND id=? AND status='reviewing'").run(now, userId, batchId);
    db.prepare("UPDATE knowledge_points SET status='active', verified=1, updated_at=? WHERE user_id=? AND ai_draft_batch_id=? AND status='draft'").run(now, userId, batchId);
    db.prepare("UPDATE questions SET status='active', verified=1, updated_at=? WHERE user_id=? AND ai_draft_batch_id=? AND status='draft'").run(now, userId, batchId);
    db.prepare('UPDATE ai_draft_comments SET resolved_at=? WHERE user_id=? AND batch_id=? AND resolved_at IS NULL').run(now, userId, batchId);
    logChange(db, userId, 'ai_draft_batches', batchId, 'upsert', now);
  });
}

export function processCapture(db, userId, captureId, knowledgeInput) {
  return transaction(db, () => {
    const id = createKnowledgePoint(db, userId, knowledgeInput);
    db.prepare("UPDATE learning_captures SET status='processed', result_knowledge_point_id=?, updated_at=? WHERE user_id=? AND id=?")
      .run(id, knowledgeInput.now, userId, captureId);
    return id;
  });
}

// ---------- 题目修订 ----------

// 已被练习使用的修订不可改：新建修订，复制选项、译文和知识点关联，再切换 current_revision
// changes: { revision: {列: 值}, translations: { 'zh-Hans': { explanation } } }
export function reviseQuestion(db, userId, questionId, changes, now) {
  return transaction(db, () => {
    const question = db.prepare('SELECT * FROM questions WHERE user_id=? AND id=?').get(userId, questionId);
    const from = question.current_revision, to = from + 1;
    const old = db.prepare('SELECT * FROM question_revisions WHERE user_id=? AND question_id=? AND revision=?').get(userId, questionId, from);
    const next = { ...old, ...(changes.revision ?? {}), revision: to, created_at: now };
    const columns = Object.keys(next);
    db.prepare(`INSERT INTO question_revisions (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`).run(...columns.map((c) => next[c]));
    const copy = (table, cols) => db.prepare(`INSERT INTO ${table} SELECT user_id, question_id, ?, ${cols} FROM ${table} WHERE user_id=? AND question_id=? AND revision=?`).run(to, userId, questionId, from);
    copy('question_options', 'option_no, option_text, is_correct, correct_position');
    copy('question_option_translations', 'option_no, language, origin, verified, updated_at, analysis');
    copy('question_revision_translations', 'language, origin, verified, updated_at, explanation, memory_point');
    copy('question_knowledge_points', 'knowledge_point_id, role');
    for (const [language, fields] of Object.entries(changes.translations ?? {})) {
      for (const [field, text] of Object.entries(fields)) setTranslation(db, userId, { targetCode: `${questionId}r${to}`, field, language, text, origin: 'manual', now });
    }
    db.prepare('UPDATE questions SET current_revision=?, updated_at=? WHERE user_id=? AND id=?').run(to, now, userId, questionId);
    logChange(db, userId, 'questions', `${questionId}r${to}`, 'upsert', now);
    return `${questionId}r${to}`;
  });
}

// ---------- 市场 ----------

export function importMarketShare(db, userId, { shareId, wordbookId, now }) {
  const existing = db.prepare('SELECT id FROM market_imports WHERE user_id=? AND share_id=?').get(userId, shareId);
  if (existing) return { importCode: existing.id, created: [], alreadyImported: true };
  const share = db.prepare('SELECT * FROM market_shares WHERE id=? AND withdrawn_at IS NULL').get(shareId);
  if (!share) throw new Error(`分享 ${shareId} 不存在或已撤回`);
  return transaction(db, () => {
    const { id: importCode, no } = nextCode(db, userId, 'MI');
    db.prepare('INSERT INTO market_imports VALUES (?,?,?,?,?,?,?)').run(userId, importCode, no, shareId, share.title, wordbookId, now);
    const created = JSON.parse(share.package_json).items.map((item) => {
      const knowledgeId = createKnowledgePoint(db, userId, { kind: item.kind, wordbookId, expression: item.expression, reading: item.reading,
        origin: 'market', verified: 0, meanings: item.meanings, now });
      db.prepare('INSERT INTO market_import_items VALUES (?,?,?,?,NULL)').run(userId, importCode, item.key, knowledgeId);
      return knowledgeId;
    });
    return { importCode, created, alreadyImported: false };
  });
}

// ---------- 账号 ----------

export const deleteAccount = (db, userId) => db.prepare('DELETE FROM users WHERE id = ?').run(userId);

// 校验库里所有罗马音都与读音一致（自定义写法按规则校验）
export function checkStoredRomaji(db) {
  const problems = [];
  for (const k of db.prepare('SELECT user_id, id, reading, romaji, romaji_key, romaji_custom FROM knowledge_points WHERE reading IS NOT NULL').all()) {
    try {
      const expected = romajiColumns(k.reading, k.romaji_custom ? k.romaji : undefined);
      if (expected.romaji !== k.romaji || expected.romaji_key !== k.romaji_key) problems.push(`${k.user_id}/${k.id}`);
    } catch (error) { problems.push(`${k.user_id}/${k.id}: ${error.message}`); }
  }
  for (const f of db.prepare('SELECT user_id, knowledge_point_id, form_code, reading, romaji FROM knowledge_forms').all()) {
    if (kanaToRomaji(f.reading) !== f.romaji) problems.push(`${f.user_id}/${f.knowledge_point_id}/${f.form_code}`);
  }
  return problems;
}

// 每个义项至少要有一种语言的释义
export const meaningsWithoutText = (db) => db.prepare(`SELECT m.user_id, m.knowledge_point_id, m.meaning_no FROM knowledge_meanings m
  WHERE NOT EXISTS (SELECT 1 FROM knowledge_meaning_translations t WHERE t.user_id=m.user_id AND t.knowledge_point_id=m.knowledge_point_id AND t.meaning_no=m.meaning_no)`).all();

export function tableCounts(db) {
  return Object.fromEntries(db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all()
    .map(({ name }) => [name, db.prepare(`SELECT count(*) AS n FROM ${name}`).get().n]));
}
