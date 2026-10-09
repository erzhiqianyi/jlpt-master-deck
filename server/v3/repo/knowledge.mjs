// 知识点：列表（含罗马音搜索）、详情（按说明语言取文字、回退、生成变形）、新建、整体替换、移动单词本、删除。
import { pickTexts, preferredLanguage, SUPPORTED_LANGUAGES } from '../i18n.mjs';
import { conjugate } from '../conjugation.mjs';
import { romajiColumns, romajiSearchKey } from '../romaji.mjs';
import { InputError, NotFoundError, nextCode, nowIso, setText, oneOf, text, list, bool, LEVELS } from './common.mjs';
import { wordbookRid } from './wordbooks.mjs';

export const KINDS = ['word', 'grammar', 'name'];
export const POS = ['verb_1', 'verb_2', 'verb_3_suru', 'verb_3_kuru', 'i_adjective', 'na_adjective', 'noun', 'adverb', 'conjunction', 'adnominal',
  'interjection', 'prefix', 'suffix', 'phrase', 'idiom'];
const PREFIX = { word: 'W', grammar: 'G', name: 'N' };
const NOTE_KINDS = ['register', 'exam_tip', 'key_point', 'other'];

function pointRid(db, userId, code) {
  const row = db.prepare('SELECT rid FROM knowledge_points WHERE user_id = ? AND code = ?').get(userId, String(code ?? '').toUpperCase());
  if (!row) throw new NotFoundError(`找不到知识点：${code}`);
  return row.rid;
}

const levelOf = (row) => (row.jlpt_level_min ? { min: row.jlpt_level_min, max: row.jlpt_level_max } : null);

// ---------- 列表 ----------
/**
 * 查询：wordbook（编号）、kind、level（N1–N5，落在等级范围内）、tag、status（new / learning / review / mastered / due）、
 * q（写法、读音、罗马音、编号、任意语言的释义）、limit、offset。
 */
export function listKnowledge(db, userId, query = {}) {
  const language = SUPPORTED_LANGUAGES.includes(query.language) ? query.language : preferredLanguage(db, userId);
  const where = ['k.user_id = :user'];
  const params = { user: userId };
  if (query.wordbook) { where.push('k.wordbook_rid = :wordbook'); params.wordbook = wordbookRid(db, userId, query.wordbook); }
  if (query.kind) {
    // 複数指定可（word,name）
    const kinds = [...new Set(String(query.kind).split(',').map((k) => oneOf(k.trim(), KINDS, 'kind')))];
    where.push(`k.kind IN (SELECT value FROM json_each(:kinds))`);
    params.kinds = JSON.stringify(kinds);
  }
  if (query.level) {
    const n = Number(oneOf(query.level, LEVELS, 'level').slice(1));
    where.push(`k.jlpt_level_min IS NOT NULL AND CAST(substr(k.jlpt_level_max, 2) AS INTEGER) <= :level AND CAST(substr(k.jlpt_level_min, 2) AS INTEGER) >= :level`);
    params.level = n;
  }
  if (query.tag) { where.push('EXISTS (SELECT 1 FROM knowledge_tags t WHERE t.point_rid = k.rid AND t.tag = :tag)'); params.tag = String(query.tag); }
  if (query.status === 'new') where.push('r.point_rid IS NULL');
  else if (query.status === 'due') { where.push("r.due_at IS NOT NULL AND r.due_at <= :now"); params.now = nowIso(); }
  else if (query.status) { where.push('r.status = :status'); params.status = oneOf(query.status, ['learning', 'review', 'mastered'], 'status'); }
  const q = String(query.q ?? '').trim();
  if (q) {
    params.like = `%${q.replace(/[%_]/g, (c) => `\\${c}`)}%`;
    params.code = q.toUpperCase();
    params.romaji = `%${romajiSearchKey(q)}%`;
    where.push(`(k.code = :code OR k.expression LIKE :like ESCAPE '\\' OR k.reading LIKE :like ESCAPE '\\' OR k.base_form LIKE :like ESCAPE '\\'
      OR (length(:romaji) > 2 AND k.romaji_key LIKE :romaji)
      OR EXISTS (SELECT 1 FROM content_translations t WHERE t.owner_table = 'knowledge_points' AND t.owner_rid = k.rid AND t.field = 'meaning' AND t.text LIKE :like ESCAPE '\\'))`);
  }
  const from = `FROM knowledge_points k JOIN wordbooks w ON w.rid = k.wordbook_rid
    LEFT JOIN review_schedules r ON r.user_id = k.user_id AND r.point_rid = k.rid WHERE ${where.join(' AND ')}`;
  const total = db.prepare(`SELECT count(*) AS n ${from}`).get(params).n;
  const limit = Math.min(500, Math.max(1, Number(query.limit) || 100));
  const offset = Math.max(0, Number(query.offset) || 0);
  const order = query.sort === 'code' ? 'k.kind, k.rid' : query.sort === 'expression' ? 'k.reading, k.expression' : query.sort === 'due' ? 'r.due_at IS NULL, r.due_at, k.rid' : 'k.captured_at DESC, k.rid DESC';
  const rows = db.prepare(`SELECT k.*, w.code AS wordbook_code, r.status AS review_status, r.due_at ${from} ORDER BY ${order} LIMIT :limit OFFSET :offset`)
    .all({ ...params, limit, offset });
  const texts = pickTexts(db, rows.map((r) => ['knowledge_points', r.rid]), language);
  const tags = new Map();
  if (rows.length) {
    for (const t of db.prepare('SELECT point_rid, tag FROM knowledge_tags WHERE point_rid IN (SELECT value FROM json_each(?)) ORDER BY tag').all(JSON.stringify(rows.map((r) => r.rid)))) {
      if (!tags.has(t.point_rid)) tags.set(t.point_rid, []);
      tags.get(t.point_rid).push(t.tag);
    }
  }
  return {
    total, limit, offset, language,
    items: rows.map((r) => ({
      code: r.code, kind: r.kind, wordbook: r.wordbook_code, expression: r.expression, reading: r.reading, romaji: r.romaji, pos: r.pos,
      jlptLevel: levelOf(r), meaning: texts.get(`knowledge_points:${r.rid}`)?.meaning ?? null, tags: tags.get(r.rid) ?? [],
      review: r.review_status ? { status: r.review_status, dueAt: r.due_at } : { status: 'new', dueAt: null },
      capturedAt: r.captured_at, updatedAt: r.updated_at,
    })),
  };
}

// ---------- 详情 ----------
export function getKnowledge(db, userId, code, { language: requested } = {}) {
  const rid = pointRid(db, userId, code);
  const language = SUPPORTED_LANGUAGES.includes(requested) ? requested : preferredLanguage(db, userId);
  const k = db.prepare('SELECT k.*, w.code AS wordbook_code FROM knowledge_points k JOIN wordbooks w ON w.rid = k.wordbook_rid WHERE k.rid = ?').get(rid);
  const child = (table, columns = '*') => db.prepare(`SELECT ${columns} FROM ${table} WHERE point_rid = ? ORDER BY position`).all(rid);
  const examples = child('knowledge_examples');
  const memory = child('knowledge_memory_points');
  const patterns = child('knowledge_patterns');
  const notes = child('knowledge_notes');
  const comparisons = child('knowledge_comparisons');
  const owners = [['knowledge_points', rid],
    ...examples.map((r) => ['knowledge_examples', r.rid]), ...memory.map((r) => ['knowledge_memory_points', r.rid]),
    ...patterns.map((r) => ['knowledge_patterns', r.rid]), ...notes.map((r) => ['knowledge_notes', r.rid]), ...comparisons.map((r) => ['knowledge_comparisons', r.rid])];
  const texts = pickTexts(db, owners, language);
  const own = (table, rowRid) => texts.get(`${table}:${rowRid}`) ?? {};
  const meaningJa = db.prepare("SELECT text FROM content_translations WHERE owner_table = 'knowledge_points' AND owner_rid = ? AND field = 'meaning' AND language = 'ja'").get(rid)?.text ?? null;
  const pointTexts = own('knowledge_points', rid);
  // 释义：请求日语以外的语言时，日语行只作为最后手段
  const meaning = pointTexts.meaning?.language === 'ja' && language !== 'ja' ? { ...pointTexts.meaning, isFallback: true } : pointTexts.meaning ?? null;
  const images = db.prepare('SELECT * FROM knowledge_memory_images WHERE point_rid = ?').all(rid);
  const image = images.find((i) => i.language === language) ?? images.find((i) => i.language === 'zh-Hans') ?? images[0] ?? null;
  const conjugations = conjugate(db, { pos: k.pos, isSuruNoun: k.is_suru_noun === 1, expression: k.expression, reading: k.reading, baseForm: k.base_form });
  const steps = pickTexts(db, conjugations.map((c) => ['conjugation_rules', c.ruleRid]), language);
  const review = db.prepare('SELECT status, review_count, ease, interval_days, due_at, first_seen_at, last_reviewed_at FROM review_schedules WHERE user_id = ? AND point_rid = ?').get(userId, rid);
  const distractors = {};
  for (const d of db.prepare('SELECT type_id, choice FROM knowledge_distractors WHERE point_rid = ? ORDER BY type_id, position').all(rid)) (distractors[d.type_id] ??= []).push(d.choice);
  return {
    code: k.code, kind: k.kind, wordbook: k.wordbook_code, language,
    expression: k.expression, reading: k.reading, romaji: k.romaji, pos: k.pos, transitivity: k.transitivity, isSuruNoun: k.is_suru_noun === 1,
    baseForm: k.base_form, jlptLevel: levelOf(k), register: k.register_level, paraphrase: k.paraphrase,
    meaning, meaningJa, explanation: pointTexts.explanation ?? null,
    examples: examples.map((e) => {
      const t = own('knowledge_examples', e.rid);
      return { sentence: e.sentence, reading: e.sentence_reading, spokenSentence: e.spoken_sentence, targetReading: e.target_reading,
        translation: t.translation ?? null, spokenTranslation: t.spoken_translation ?? null, analysis: t.analysis ?? null, formAnalysis: t.form_analysis ?? null };
    }),
    memoryPoints: memory.map((m) => own('knowledge_memory_points', m.rid).content ?? null).filter(Boolean),
    patterns: patterns.map((p) => {
      const t = own('knowledge_patterns', p.rid);
      return { pattern: p.pattern, example: p.example, connection: t.connection ?? null, meaning: t.meaning ?? null, exampleTranslation: t.example_translation ?? null };
    }),
    notes: notes.map((n) => {
      const t = own('knowledge_notes', n.rid);
      return { kind: n.kind, title: t.title ?? null, body: t.body ?? null };
    }),
    comparisons: comparisons.map((c) => ({ target: c.target, kind: c.kind, difference: own('knowledge_comparisons', c.rid).difference ?? null })),
    alternateForms: child('knowledge_alternate_forms', 'form').map((r) => r.form),
    relatedWords: child('knowledge_related_words', 'word').map((r) => r.word),
    sources: child('knowledge_sources', 'title, url').map((r) => ({ title: r.title, url: r.url })),
    tags: db.prepare('SELECT tag FROM knowledge_tags WHERE point_rid = ? ORDER BY tag').all(rid).map((r) => r.tag),
    questionKinds: db.prepare('SELECT type_id FROM knowledge_question_kinds WHERE point_rid = ? ORDER BY type_id').all(rid).map((r) => r.type_id),
    distractors,
    memoryImage: image ? { language: image.language, isFallback: image.language !== language, concept: image.concept, prompt: image.prompt, status: image.status,
      media: image.media_rid, url: image.url, caption: image.caption } : null,
    conjugations: conjugations.map((c) => ({ form: c.form, label: c.label, written: c.written, reading: c.reading, exception: c.exception,
      step: steps.get(`conjugation_rules:${c.ruleRid}`)?.step ?? null })),
    questions: db.prepare(`SELECT q.code, g.type_id, g.status, l.relation FROM knowledge_point_questions l JOIN questions q ON q.rid = l.question_rid
      JOIN question_groups g ON g.rid = q.group_rid WHERE l.point_rid = ? ORDER BY l.position`).all(rid).map((r) => ({ code: r.code, typeId: r.type_id, status: r.status, relation: r.relation })),
    sourceSentence: k.source_sentence, compileNote: k.compile_note,
    review: review ? { status: review.status, reviewCount: review.review_count, ease: review.ease, intervalDays: review.interval_days, dueAt: review.due_at,
      firstSeenAt: review.first_seen_at, lastReviewedAt: review.last_reviewed_at } : { status: 'new' },
    capturedAt: k.captured_at, createdAt: k.created_at, updatedAt: k.updated_at,
  };
}

// ---------- 写入 ----------
function normalizeInput(db, input, { partial = false } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new InputError('知识点应为对象');
  const out = {};
  const has = (key) => key in input;
  if (!partial || has('kind')) out.kind = oneOf(input.kind, KINDS, 'kind');
  if (!partial || has('expression')) out.expression = text(input.expression, 'expression', { optional: false, max: 200 });
  if (has('reading')) out.reading = text(input.reading, 'reading', { max: 200 });
  if (has('pos')) out.pos = oneOf(input.pos, POS, 'pos', { optional: true });
  if (has('transitivity')) out.transitivity = oneOf(input.transitivity, ['transitive', 'intransitive', 'both'], 'transitivity', { optional: true });
  if (has('isSuruNoun')) out.isSuruNoun = bool(input.isSuruNoun, 'isSuruNoun', false);
  if (has('baseForm')) out.baseForm = text(input.baseForm, 'baseForm', { max: 200 });
  if (has('jlptLevel')) {
    const level = input.jlptLevel;
    if (level === null) out.jlptLevel = null;
    else if (typeof level === 'string') out.jlptLevel = { min: oneOf(level, LEVELS, 'jlptLevel'), max: level };
    else out.jlptLevel = { min: oneOf(level?.min, LEVELS, 'jlptLevel.min'), max: oneOf(level?.max, LEVELS, 'jlptLevel.max') };
  }
  if (has('register')) out.register = oneOf(input.register, ['written', 'spoken', 'formal', 'both'], 'register', { optional: true });
  for (const key of ['paraphrase', 'sourceSentence', 'compileNote']) if (has(key)) out[key] = text(input[key], key, { max: 4000 });
  for (const key of ['meaning', 'meaningJa', 'explanation']) if (has(key)) out[key] = text(input[key], key);
  if (has('examples')) out.examples = list(input.examples, 'examples').map((e, i) => ({
    sentence: text(e?.sentence, `examples[${i}].sentence`, { optional: false, max: 1000 }), reading: text(e?.reading, 'reading', { max: 2000 }),
    spokenSentence: text(e?.spokenSentence, 'spokenSentence', { max: 1000 }), targetReading: text(e?.targetReading, 'targetReading', { max: 200 }),
    translation: text(e?.translation, 'translation'), spokenTranslation: text(e?.spokenTranslation, 'spokenTranslation'), analysis: text(e?.analysis, 'analysis'), formAnalysis: text(e?.formAnalysis, 'formAnalysis'),
  }));
  if (has('memoryPoints')) out.memoryPoints = list(input.memoryPoints, 'memoryPoints').map((m, i) => text(m, `memoryPoints[${i}]`, { optional: false, max: 2000 }));
  if (has('patterns')) out.patterns = list(input.patterns, 'patterns').map((p, i) => ({
    pattern: text(p?.pattern, `patterns[${i}].pattern`, { optional: false, max: 500 }), example: text(p?.example, 'example', { max: 1000 }),
    connection: text(p?.connection, 'connection'), meaning: text(p?.meaning, 'meaning'), exampleTranslation: text(p?.exampleTranslation, 'exampleTranslation'),
  }));
  if (has('notes')) out.notes = list(input.notes, 'notes').map((n, i) => ({ kind: oneOf(n?.kind ?? 'other', NOTE_KINDS, `notes[${i}].kind`), title: text(n?.title, 'title', { max: 200 }), body: text(n?.body, `notes[${i}].body`, { optional: false }) }));
  if (has('comparisons')) out.comparisons = list(input.comparisons, 'comparisons').map((c, i) => ({ target: text(c?.target, `comparisons[${i}].target`, { optional: false, max: 200 }), kind: oneOf(c?.kind ?? 'synonym', ['synonym', 'everyday'], 'kind'), difference: text(c?.difference, 'difference') }));
  for (const key of ['alternateForms', 'relatedWords', 'tags']) if (has(key)) out[key] = [...new Set(list(input[key], key).map((v, i) => text(v, `${key}[${i}]`, { optional: false, max: 200 })))];
  if (has('sources')) out.sources = list(input.sources, 'sources').map((s, i) => ({ title: text(s?.title, `sources[${i}].title`, { optional: false, max: 500 }), url: text(s?.url, 'url', { max: 2000 }) }));
  if (has('questionKinds') || has('distractors')) {
    const known = new Set(db.prepare('SELECT type_id FROM question_types').all().map((r) => r.type_id));
    const check = (typeId) => { if (!known.has(typeId)) throw new InputError(`未知题型：${typeId}`); return typeId; };
    if (has('questionKinds')) out.questionKinds = [...new Set(list(input.questionKinds, 'questionKinds').map(check))];
    if (has('distractors')) out.distractors = Object.fromEntries(Object.entries(input.distractors ?? {}).map(([typeId, choices]) => [check(typeId), list(choices, `distractors.${typeId}`).map((c) => text(c, 'distractor', { optional: false, max: 200 }))]));
  }
  if (out.pos && out.kind && out.kind !== 'word' && !partial) throw new InputError('只有单词类知识点有词性（pos）');
  if (out.transitivity && out.pos && !out.pos.startsWith('verb_')) throw new InputError('自他（transitivity）只用于动词');
  return out;
}

/** 按位置替换子表行：保留原有行（及其其他语言的译文），多出的删除，不足的新增。 */
function replaceChildren(db, table, rid, rows, columns, translated, language, now) {
  const existing = db.prepare(`SELECT rid FROM ${table} WHERE point_rid = ? ORDER BY position`).all(rid).map((r) => r.rid);
  const hasTimes = db.prepare(`SELECT count(*) AS n FROM pragma_table_info('${table}') WHERE name = 'updated_at'`).get().n > 0;
  // 先把位置移开，避免 (point_rid, position) 唯一约束冲突
  db.prepare(`UPDATE ${table} SET position = position + 100000 WHERE point_rid = ?`).run(rid);
  rows.forEach((row, position) => {
    const values = Object.fromEntries(Object.entries(columns).map(([column, key]) => [column, row[key] ?? null]));
    let childRid = existing[position];
    if (childRid) {
      db.prepare(`UPDATE ${table} SET position = ?${Object.keys(values).map((c) => `, ${c} = ?`).join('')}${hasTimes ? ', updated_at = ?' : ''} WHERE rid = ?`)
        .run(position, ...Object.values(values), ...(hasTimes ? [now] : []), childRid);
    } else {
      const cols = ['point_rid', 'position', ...Object.keys(values), 'created_at', ...(hasTimes ? ['updated_at'] : [])];
      childRid = Number(db.prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
        .run(rid, position, ...Object.values(values), now, ...(hasTimes ? [now] : [])).lastInsertRowid);
    }
    for (const [field, key] of Object.entries(translated)) setText(db, table, childRid, field, language, row[key]);
  });
  for (const extra of existing.slice(rows.length)) db.prepare(`DELETE FROM ${table} WHERE rid = ?`).run(extra);
}

function writeContent(db, rid, data, language, now) {
  if ('meaning' in data) setText(db, 'knowledge_points', rid, 'meaning', language, data.meaning);
  if ('meaningJa' in data) setText(db, 'knowledge_points', rid, 'meaning', 'ja', data.meaningJa);
  if ('explanation' in data) setText(db, 'knowledge_points', rid, 'explanation', language, data.explanation);
  if (data.examples) replaceChildren(db, 'knowledge_examples', rid, data.examples, { sentence: 'sentence', sentence_reading: 'reading', spoken_sentence: 'spokenSentence', target_reading: 'targetReading' },
    { translation: 'translation', spoken_translation: 'spokenTranslation', analysis: 'analysis', form_analysis: 'formAnalysis' }, language, now);
  if (data.memoryPoints) replaceChildren(db, 'knowledge_memory_points', rid, data.memoryPoints.map((content) => ({ content })), {}, { content: 'content' }, language, now);
  if (data.patterns) replaceChildren(db, 'knowledge_patterns', rid, data.patterns, { pattern: 'pattern', example: 'example' },
    { connection: 'connection', meaning: 'meaning', example_translation: 'exampleTranslation' }, language, now);
  if (data.notes) replaceChildren(db, 'knowledge_notes', rid, data.notes, { kind: 'kind' }, { title: 'title', body: 'body' }, language, now);
  if (data.comparisons) replaceChildren(db, 'knowledge_comparisons', rid, data.comparisons, { target: 'target', kind: 'kind' }, { difference: 'difference' }, language, now);
  if (data.alternateForms) replaceChildren(db, 'knowledge_alternate_forms', rid, data.alternateForms.map((form) => ({ form })), { form: 'form' }, {}, language, now);
  if (data.relatedWords) replaceChildren(db, 'knowledge_related_words', rid, data.relatedWords.map((word) => ({ word })), { word: 'word' }, {}, language, now);
  if (data.sources) replaceChildren(db, 'knowledge_sources', rid, data.sources, { title: 'title', url: 'url' }, {}, language, now);
  if (data.tags) {
    db.prepare('DELETE FROM knowledge_tags WHERE point_rid = ?').run(rid);
    for (const tag of data.tags) db.prepare('INSERT INTO knowledge_tags (point_rid, tag, created_at) VALUES (?, ?, ?)').run(rid, tag, now);
  }
  if (data.questionKinds) {
    db.prepare('DELETE FROM knowledge_question_kinds WHERE point_rid = ?').run(rid);
    for (const typeId of data.questionKinds) db.prepare('INSERT INTO knowledge_question_kinds (point_rid, type_id) VALUES (?, ?)').run(rid, typeId);
  }
  if (data.distractors) {
    db.prepare('DELETE FROM knowledge_distractors WHERE point_rid = ?').run(rid);
    for (const [typeId, choices] of Object.entries(data.distractors)) choices.forEach((choice, position) => db.prepare('INSERT INTO knowledge_distractors (point_rid, type_id, position, choice) VALUES (?, ?, ?, ?)').run(rid, typeId, position, choice));
  }
}

function romajiFor(reading) {
  if (!reading) return { romaji: null, romaji_key: null };
  try { const r = romajiColumns(reading); return { romaji: r.romaji, romaji_key: r.romaji_key }; } catch { return { romaji: null, romaji_key: null }; }
}

/** 新建知识点。input.language：文字的语言（默认用户的说明语言）。 */
export function createKnowledge(db, userId, input) {
  const data = normalizeInput(db, input);
  const language = input.language ? oneOf(input.language, SUPPORTED_LANGUAGES, 'language') : preferredLanguage(db, userId);
  const wordbook = wordbookRid(db, userId, input.wordbook);
  const now = nowIso();
  const { code } = nextCode(db, userId, PREFIX[data.kind]);
  const romaji = romajiFor(data.reading);
  const rid = Number(db.prepare(`INSERT INTO knowledge_points (user_id, code, wordbook_rid, kind, expression, reading, romaji, romaji_key, pos, transitivity, is_suru_noun,
    base_form, jlpt_level_min, jlpt_level_max, register_level, paraphrase, source_sentence, compile_note, captured_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(userId, code, wordbook, data.kind, data.expression, data.reading ?? null,
    romaji.romaji, romaji.romaji_key, data.kind === 'word' ? data.pos ?? null : null, data.transitivity ?? null, data.isSuruNoun ? 1 : 0, data.baseForm ?? null,
    data.jlptLevel?.min ?? null, data.jlptLevel?.max ?? null, data.register ?? null, data.paraphrase ?? null, data.sourceSentence ?? null, data.compileNote ?? null,
    now, now, now).lastInsertRowid);
  writeContent(db, rid, data, language, now);
  return getKnowledge(db, userId, code, { language });
}

/** 修改：只改传入的字段；列表类字段整体替换（按位置保留原行和其他语言的译文）。 */
export function updateKnowledge(db, userId, code, input) {
  const rid = pointRid(db, userId, code);
  const data = normalizeInput(db, input, { partial: true });
  const language = input.language ? oneOf(input.language, SUPPORTED_LANGUAGES, 'language') : preferredLanguage(db, userId);
  const now = nowIso();
  const columns = {};
  if ('expression' in data) columns.expression = data.expression;
  if ('reading' in data) Object.assign(columns, { reading: data.reading, ...romajiFor(data.reading) });
  if ('pos' in data) columns.pos = data.pos;
  if ('transitivity' in data) columns.transitivity = data.transitivity;
  if ('isSuruNoun' in data) columns.is_suru_noun = data.isSuruNoun ? 1 : 0;
  if ('baseForm' in data) columns.base_form = data.baseForm;
  if ('jlptLevel' in data) Object.assign(columns, { jlpt_level_min: data.jlptLevel?.min ?? null, jlpt_level_max: data.jlptLevel?.max ?? null });
  if ('register' in data) columns.register_level = data.register;
  if ('paraphrase' in data) columns.paraphrase = data.paraphrase;
  if ('sourceSentence' in data) columns.source_sentence = data.sourceSentence;
  if ('compileNote' in data) columns.compile_note = data.compileNote;
  if (input.wordbook) columns.wordbook_rid = wordbookRid(db, userId, input.wordbook);
  if ('kind' in data) {
    const current = db.prepare('SELECT kind FROM knowledge_points WHERE rid = ?').get(rid).kind;
    if (data.kind !== current) throw new InputError('不能修改知识点的大类（kind）：编号前缀随大类而定，请新建知识点');
  }
  db.prepare(`UPDATE knowledge_points SET ${[...Object.keys(columns).map((c) => `${c} = ?`), 'updated_at = ?'].join(', ')} WHERE rid = ?`).run(...Object.values(columns), now, rid);
  writeContent(db, rid, data, language, now);
  return getKnowledge(db, userId, code, { language });
}

/** 删除知识点：子表随之删除；关联的题目保留（只删除关联）。 */
export function deleteKnowledge(db, userId, code) {
  const rid = pointRid(db, userId, code);
  db.prepare('DELETE FROM knowledge_points WHERE rid = ?').run(rid);
  return { deleted: String(code).toUpperCase() };
}

/** 精确查词：写法、读音、辞书形、其他写法、生成的变形。 */
export function lookupKnowledge(db, userId, word, options = {}) {
  const query = String(word ?? '').normalize('NFKC').trim();
  if (!query) return [];
  const rows = db.prepare(`SELECT rid, code, expression, reading, base_form, pos, is_suru_noun FROM knowledge_points k WHERE user_id = ?
    AND (expression = ? OR reading = ? OR base_form = ? OR EXISTS (SELECT 1 FROM knowledge_alternate_forms a WHERE a.point_rid = k.rid AND a.form = ?)
      OR pos IS NOT NULL OR is_suru_noun = 1)`).all(userId, query, query, query, query);
  const hits = rows.filter((r) => [r.expression, r.reading, r.base_form].includes(query)
    || db.prepare('SELECT 1 FROM knowledge_alternate_forms WHERE point_rid = ? AND form = ?').get(r.rid, query)
    || conjugate(db, { pos: r.pos, isSuruNoun: r.is_suru_noun === 1, expression: r.expression, reading: r.reading, baseForm: r.base_form })
      .some((c) => c.written === query || c.reading === query));
  return hits.map((h) => getKnowledge(db, userId, h.code, options));
}
