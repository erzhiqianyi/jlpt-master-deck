// One canonical shape for vocabulary, grammar and name items. Every write, every read and the
// startup migration run items through canonicalizeItemFields(), so legacy JSON (older skills,
// market packages, backups) keeps importing while stored rows converge on the shared fields:
//
//   patterns[]    { pattern, connection_zh?, meaning_zh?, example?, example_zh? }
//                 ← grammar_forms, usage_patterns, collocations
//   points[]      { label, detail_zh? }
//                 ← grammar_features, transitivity, orthography, word_formation, ...
//   comparisons[] { target, difference_zh?, kind?: 'everyday' }
//                 ← comparisons, comparison_notes, everyday_alternatives
//   register      { level?, note_zh?, exam_tip_zh? }
//                 ← usage_register, usage_register_zh, exam_register_zh
//   explanation_zh ← explanation_zh + analysis + usage_notes (localizations[*].analysis → explanation)
//   source        { sentence?, chat_summary?, draft_ids?, draft_title?, capture_id? }
//   input_at      ← date (removed; it always equalled the day of input_at)
//   images[]      { id?, url?, caption? } — id is an uploaded item_images asset
//
// The function is pure and idempotent: canonical input comes back unchanged.

const usageRegisterLevels = new Set(['written', 'spoken', 'both', 'formal']);
export const MAX_ITEM_IMAGES = 6;

// Keys folded into the shared fields above, or bookkeeping no screen reads.
const legacyKeys = [
  'date', 'analysis', 'normalized', 'wordbook_ids', 'example_ja',
  'grammar_point', 'source_grammar_point', 'grammar_forms', 'grammar_features', 'usage_patterns', 'collocations', 'collocation_ruby',
  'comparison_notes', 'everyday_alternatives', 'usage_register', 'usage_register_zh', 'exam_register_zh',
  'formation', 'usage_notes', 'transitivity', 'orthography', 'word_formation', 'alternate_senses', 'reading_variants', 'jlpt_expansion',
  'dictionary_form', 'dictionary_reading',
  'source_original_sentence', 'source_normalized_sentence', 'source_chat_summary', 'source_draft_ids', 'source_draft_title', 'source_capture_id',
  'review_status', 'lesson', 'lesson_topic', 'source_groups', 'practice_generation_status', 'auto_question_reason', 'related_item_ids', 'correction_history',
  'targetWordbookId', 'targetWordbookTitle', 'targetDeck',
  'question', 'choices', 'correct_answer', 'distractor_notes',
];

const text = (value) => (typeof value === 'string' ? value.trim() : '');
const list = (value) => (Array.isArray(value) ? value : []);
const record = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});

function compact(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== '' && value !== undefined && value !== null
    && !(Array.isArray(value) && !value.length)));
}

function uniqueBy(entries, key) {
  const seen = new Set();
  return entries.filter((entry) => {
    const id = key(entry);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function joinDistinct(parts, separator) {
  const kept = [];
  for (const part of parts.map(text).filter(Boolean)) {
    if (kept.some((existing) => existing.includes(part))) continue;
    for (let index = kept.length - 1; index >= 0; index -= 1) if (part.includes(kept[index])) kept.splice(index, 1);
    kept.push(part);
  }
  return kept.join(separator);
}

function canonicalPatterns(item, exampleSentences) {
  const collocation = (entry) => {
    const value = typeof entry === 'string' ? entry : record(entry).text;
    const raw = text(value);
    const separator = raw.search(/[：:]/u);
    return separator < 0 ? { pattern: raw } : { pattern: raw.slice(0, separator).trim(), meaning_zh: raw.slice(separator + 1).trim() };
  };
  const entries = [
    ...list(item.patterns).map(record),
    ...list(item.grammar_forms).map(record).map((form) => (text(form.example)
      // grammar_forms[].meaning_zh translated the example sentence, not the pattern.
      ? { pattern: form.form, connection_zh: form.connection_zh, example: form.example, example_zh: form.meaning_zh }
      : { pattern: form.form, connection_zh: form.connection_zh, meaning_zh: form.meaning_zh })),
    ...list(item.usage_patterns).map(record),
    ...list(item.collocations).map(collocation),
    ...(text(item.formation) ? [{ pattern: '', connection_zh: item.formation }] : []),
  ].map((entry) => {
    const pattern = compact({
      pattern: text(entry.pattern),
      connection_zh: text(entry.connection_zh),
      meaning_zh: text(entry.meaning_zh),
      example: text(entry.example),
      example_zh: text(entry.example_zh),
    });
    // The item's examples[] already carry this sentence and its translation.
    if (pattern.example && exampleSentences.has(pattern.example)) {
      delete pattern.example;
      delete pattern.example_zh;
    }
    return pattern;
  }).filter((entry) => entry.pattern || entry.connection_zh || entry.example);
  return uniqueBy(entries, (entry) => `${entry.pattern ?? ''}\u0000${entry.connection_zh ?? ''}\u0000${entry.example ?? ''}`);
}

function canonicalPoints(item) {
  const point = (label, detail) => ({ label: text(label), detail_zh: text(detail) });
  const formation = record(item.word_formation);
  const expansion = record(item.jlpt_expansion);
  const entries = [
    ...list(item.points).map(record).map((entry) => point(entry.label, entry.detail_zh)),
    ...list(item.grammar_features).map(record).map((entry) => point(entry.feature, entry.detail_zh)),
    ...(text(item.transitivity) ? [point('自他', item.transitivity)] : []),
    ...(text(item.orthography) ? [point('汉字写法', item.orthography)] : []),
    ...(text(formation.pattern) ? [point('构词', joinDistinct([formation.pattern, formation.meaning_zh], '；'))] : []),
    ...list(item.alternate_senses).map(record).map((sense) => point(
      `${text(sense.form)}${text(sense.reading) ? `（${text(sense.reading)}）` : ''}`,
      joinDistinct([sense.part_of_speech, sense.meaning_zh], ' · '),
    )),
    ...list(item.reading_variants).map(record).map((variant) => point(
      `${text(variant.base_form)}${text(variant.reading) ? `（${text(variant.reading)}）` : ''}`,
      joinDistinct([variant.transitivity, variant.particle_hint, variant.meaning_zh], ' · '),
    )),
    ...list(expansion.test_points).map((detail) => point('考点', detail)),
    ...list(expansion.common_traps).map((detail) => point('易错', detail)),
  ].map(compact).filter((entry) => entry.label || entry.detail_zh);
  return uniqueBy(entries, (entry) => `${entry.label ?? ''}\u0000${entry.detail_zh ?? ''}`);
}

function canonicalComparisons(item) {
  const entries = [
    ...list(item.comparisons).map(record),
    ...list(item.comparison_notes).map(record),
    ...list(item.everyday_alternatives).map(record).map((entry) => ({ target: entry.ja, difference_zh: entry.zh, kind: 'everyday' })),
  ].map((entry) => compact({
    target: text(entry.target),
    difference_zh: text(entry.difference_zh),
    kind: entry.kind === 'everyday' ? 'everyday' : undefined,
  })).filter((entry) => entry.target || entry.difference_zh);
  return uniqueBy(entries, (entry) => `${entry.kind ?? ''}\u0000${entry.target ?? ''}\u0000${entry.difference_zh ?? ''}`);
}

function canonicalRegister(item) {
  const current = record(item.register);
  const level = text(current.level) || text(item.usage_register);
  return compact({
    level: usageRegisterLevels.has(level) ? level : undefined,
    note_zh: text(current.note_zh) || text(item.usage_register_zh),
    exam_tip_zh: text(current.exam_tip_zh) || text(item.exam_register_zh),
  });
}

function canonicalSource(item, exampleSentences) {
  const current = record(item.source);
  const sentence = text(current.sentence) || text(item.source_original_sentence) || text(item.source_normalized_sentence);
  const draftIds = [...new Set([...list(current.draft_ids), ...list(item.source_draft_ids)].map(text).filter(Boolean))];
  return compact({
    sentence: exampleSentences.has(sentence) ? '' : sentence,
    chat_summary: text(current.chat_summary) || text(item.source_chat_summary),
    draft_ids: draftIds,
    draft_title: text(current.draft_title) || text(item.source_draft_title),
    capture_id: text(current.capture_id) || text(item.source_capture_id),
  });
}

function canonicalLocalizations(value) {
  const localizations = record(value);
  const entries = Object.entries(localizations).map(([locale, localizedValue]) => {
    const localized = record(localizedValue);
    const { analysis, ...rest } = localized;
    return [locale, compact({ ...rest, explanation: joinDistinct([localized.explanation, analysis], '\n\n') })];
  }).filter(([, localized]) => Object.keys(localized).length);
  return entries.length ? Object.fromEntries(entries) : undefined;
}

export function normalizeItemImages(value) {
  const images = list(value).map(record).map((image) => {
    const id = text(image.id);
    const url = text(image.url);
    return compact({
      id: /^[A-Za-z0-9_-]{8,64}$/.test(id) ? id : '',
      url: !id && /^https:\/\/\S+$/i.test(url) ? url.slice(0, 2000) : '',
      caption: text(image.caption).slice(0, 120),
    });
  }).filter((image) => image.id || image.url);
  return uniqueBy(images, (image) => image.id ?? image.url).slice(0, MAX_ITEM_IMAGES);
}

function inputAt(item) {
  const current = text(item.input_at);
  if (current) return current;
  const date = text(item.date);
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return `${date}T00:00:00+09:00`;
  return new Date().toISOString();
}

// Older items stored one question in flat fields; practice_questions[] replaced them.
function practiceQuestions(item) {
  const current = list(item.practice_questions);
  if (current.length) return current;
  const prompt = text(item.question);
  const choices = list(item.choices).map(text).filter(Boolean);
  const answer = text(item.correct_answer);
  if (!prompt || choices.length < 2 || !choices.includes(answer)) return [];
  const kind = list(item.question_kinds)[0];
  return [compact({ kind: typeof kind === 'string' ? kind : undefined, prompt, choices, answer, distractor_notes: record(item.distractor_notes) })];
}

export function canonicalizeItemFields(raw) {
  const item = record(raw);
  const examples = list(item.examples);
  const exampleSentences = new Set(examples.map((example) => text(record(example).ja)).filter(Boolean));
  const original = text(item.original);
  const baseForm = text(item.base_form) || (text(item.dictionary_form) !== original ? text(item.dictionary_form) : '');
  const lessonTopic = text(item.lesson_topic);
  const tags = list(item.tags);

  const canonical = { ...item };
  for (const key of legacyKeys) delete canonical[key];
  Object.assign(canonical, {
    input_at: inputAt(item),
    explanation_zh: joinDistinct([item.explanation_zh, item.analysis, item.usage_notes], '\n\n'),
    patterns: canonicalPatterns(item, exampleSentences),
    points: canonicalPoints(item),
    comparisons: canonicalComparisons(item),
    register: canonicalRegister(item),
    source: canonicalSource(item, exampleSentences),
    localizations: canonicalLocalizations(item.localizations),
    base_form: baseForm && baseForm !== original ? baseForm : '',
    images: normalizeItemImages(item.images),
    practice_questions: practiceQuestions(item),
    tags: lessonTopic && !tags.includes(lessonTopic) ? [...tags, lessonTopic] : tags,
  });
  for (const key of ['register', 'source']) if (!Object.keys(canonical[key]).length) delete canonical[key];
  for (const key of ['explanation_zh', 'base_form', 'localizations', 'patterns', 'points', 'comparisons', 'conjugations', 'notes', 'images', 'practice_questions']) {
    if (canonical[key] === '' || canonical[key] === undefined || (Array.isArray(canonical[key]) && !canonical[key].length)) delete canonical[key];
  }
  return canonical;
}

const itemTables = ['review_items', 'owned_review_items', 'user_review_items'];

/**
 * Create the image registry and rewrite stored items into the canonical shape once.
 * `beforeMigrate` runs only when the rewrite is still pending (local builds back up the file).
 */
export function ensureItemSchema(db, { beforeMigrate, inTransaction = (run) => run() } = {}) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS item_images (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      mime TEXT NOT NULL,
      size INTEGER NOT NULL,
      sha256 TEXT NOT NULL,
      image_path TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(user_id, sha256)
    );
    CREATE TABLE IF NOT EXISTS review_item_migrations (name TEXT PRIMARY KEY);
  `);
  if (db.prepare('SELECT name FROM review_item_migrations WHERE name = ?').get('unified-fields-v1')) return;
  beforeMigrate?.();
  inTransaction(() => rewriteStoredItems(db));
}

function rewriteStoredItems(db) {
  const existing = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name));
  for (const table of itemTables.filter((name) => existing.has(name))) {
    const key = table === 'review_items' ? 'id' : 'user_id, id';
    const rows = db.prepare(`SELECT ${key}, item_json FROM ${table}`).all();
    const update = db.prepare(`UPDATE ${table} SET item_json = ? WHERE ${table === 'review_items' ? 'id = ?' : 'user_id = ? AND id = ?'}`);
    for (const row of rows) {
      const next = JSON.stringify(canonicalizeItemFields(JSON.parse(row.item_json)));
      if (next === row.item_json) continue;
      if (table === 'review_items') update.run(next, row.id);
      else update.run(next, row.user_id, row.id);
    }
  }
  db.prepare('INSERT INTO review_item_migrations (name) VALUES (?)').run('unified-fields-v1');
}

/** Plain text of every pattern, for search and question contexts. */
export function patternTexts(item) {
  return list(item?.patterns).flatMap((entry) => [text(entry?.pattern), text(entry?.example)]).filter(Boolean);
}
