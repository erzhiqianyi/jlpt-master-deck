// 題庫：題組（大問）→ 小題 → 選項。全題型で同じ表・同じ入力形式。書き込み前に共有の校驗（src/domain/questionValidation.mjs）を通し、
// 必須・禁止に反するものは拒否、警告はシステムの審査記録（reviewer = system）に残す。
import { validateQuestionGroup } from '../../../src/domain/questionValidation.mjs';
import { pickTexts, preferredLanguage, SUPPORTED_LANGUAGES } from '../i18n.mjs';
import { ConflictError, InputError, NotFoundError, nextCode, nowIso, oneOf, text, list, LEVELS } from './common.mjs';
import { insertMaterial, materialRid, materialTexts, shapeMaterials, writeText } from './materials.mjs';
import { ownedMedia } from './media.mjs';

const PREFIX = { vocabulary: 'QV', grammar: 'QG', reading: 'QR', listening: 'QL' };
const STATUSES = ['draft', 'needs_review', 'needs_revision', 'ready', 'retired'];
const ROLES = ['main', 'passage_a', 'passage_b', 'notice', 'scene_image', 'audio'];
const RELATIONS = ['target', 'prerequisite', 'contrast'];
const SECTION_KINDS = ['basis', 'step', 'full_answer', 'tip', 'objective'];
const languageOf = (db, userId, requested) => (SUPPORTED_LANGUAGES.includes(requested) ? requested : preferredLanguage(db, userId));

// ---------- 題型 ----------
export function listQuestionTypes(db, language = 'zh-Hans') {
  const types = db.prepare('SELECT * FROM question_types ORDER BY sort_order').all();
  const levels = db.prepare('SELECT type_id, level FROM question_type_levels').all();
  const rules = db.prepare('SELECT type_id, rule, requirement, value FROM question_type_rules').all();
  const texts = pickTexts(db, types.map((t) => ['question_types', t.rid]), language);
  return types.map((t) => ({
    typeId: t.type_id, module: t.module, labelJa: t.label_ja, official: t.official === 1, targetMarking: t.target_marking, optionMedia: t.option_media,
    materialKinds: t.material_kinds, drawWholeGroup: t.draw_whole_group === 1, answerMode: t.answer_mode,
    levels: LEVELS.filter((l) => levels.some((x) => x.type_id === t.type_id && x.level === l)).reverse(),
    rules: Object.fromEntries(rules.filter((r) => r.type_id === t.type_id).map((r) => [r.rule, { requirement: r.requirement, value: r.value }])),
    task: texts.get(`question_types:${t.rid}`)?.task ?? null, tip: texts.get(`question_types:${t.rid}`)?.tip ?? null,
  }));
}

function typeFor(db, typeId) {
  return listQuestionTypes(db).find((t) => t.typeId === typeId) ?? null;
}

// ---------- 入力の整形 ----------
const str = (value) => (value && typeof value === 'object' && 'text' in value ? value : typeof value === 'string' ? value.trim() || null : value ?? null);

/** API・MCP の入力を校驗と書き込みに使う形にそろえる（型の誤りはここで 400）。 */
function normalizeGroup(input, { partial = false } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new InputError('题组应为对象');
  const g = {};
  if (!partial || 'typeId' in input) g.typeId = text(input.typeId, 'typeId', { optional: false, max: 80 });
  // 書き込み後の状態：draft だけ指定できる。それ以外（読み取り結果の ready など）は審査待ちに戻る
  if (input.status != null) g.status = input.status === 'draft' ? 'draft' : oneOf(input.status, STATUSES, 'status') && 'needs_review';
  if ('level' in input) g.level = input.level == null ? null : oneOf(input.level, LEVELS, 'level');
  for (const key of ['official', 'shuffleOptions']) if (key in input) { if (typeof input[key] !== 'boolean') throw new InputError(`${key} 应为 true / false`); g[key] = input[key]; }
  for (const key of ['instruction', 'context', 'sourceReference']) if (key in input) g[key] = text(input[key], key, { max: 4000 });
  for (const key of ['instructionTranslation', 'contextTranslation']) if (key in input) g[key] = str(input[key]);
  if (!partial || 'materials' in input) g.materials = list(input.materials, 'materials', { max: 6 }).map((m, i) => {
    if (!m || typeof m !== 'object') throw new InputError(`materials[${i}] 应为对象`);
    const role = oneOf(m.role, ROLES, `materials[${i}].role`);
    if (typeof m.material === 'string' && m.material.trim()) return { role, material: m.material.trim().toUpperCase() };
    return { ...m, role, material: undefined, mediaId: m.mediaId == null ? undefined : Number(m.mediaId) };
  });
  if (!partial || 'questions' in input) g.questions = list(input.questions, 'questions', { max: 20 }).map((q, qi) => {
    if (!q || typeof q !== 'object') throw new InputError(`questions[${qi}] 应为对象`);
    return {
      prompt: text(q.prompt, `questions[${qi}].prompt`, { max: 8000 }), promptMediaId: q.promptMediaId == null ? null : Number(q.promptMediaId),
      expectedText: text(q.expectedText, `questions[${qi}].expectedText`, { max: 8000 }), translation: str(q.translation),
      marks: list(q.marks, `questions[${qi}].marks`, { max: 20 }).map((m) => ({ kind: m?.kind, start: m?.start, end: m?.end, label: m?.label ?? null, material: m?.material ?? null })),
      options: list(q.options, `questions[${qi}].options`, { max: 8 }).map((o) => ({
        id: o?.id == null ? null : Number(o.id), text: typeof o?.text === 'string' ? o.text.trim() || null : null, mediaId: o?.mediaId == null ? null : Number(o.mediaId),
        correct: o?.correct === true, distractorType: typeof o?.distractorType === 'string' ? o.distractorType.trim() || null : null, analysis: str(o?.analysis), translation: str(o?.translation),
      })),
      explanation: list(q.explanation, `questions[${qi}].explanation`, { max: 20 }).map((s) => ({ kind: s?.kind, title: str(s?.title), body: str(s?.body) })),
      evidence: list(q.evidence, `questions[${qi}].evidence`, { max: 20 }).map((e) => ({ option: e?.option ?? null, material: e?.material ?? null, source: e?.source, start: e?.start ?? null, end: e?.end ?? null, quote: e?.quote })),
      tags: [...new Set(list(q.tags, `questions[${qi}].tags`, { max: 30 }).map((t, i) => text(t, `questions[${qi}].tags[${i}]`, { optional: false, max: 80 })))],
      knowledge: list(q.knowledge, `questions[${qi}].knowledge`, { max: 20 }).map((k, i) => ({ code: text(k?.code, `questions[${qi}].knowledge[${i}].code`, { optional: false, max: 20 }).toUpperCase(),
        relation: oneOf(k?.relation ?? 'target', RELATIONS, `questions[${qi}].knowledge[${i}].relation`) })),
    };
  });
  return g;
}

/** 校驗用に翻訳オブジェクトを文字列へ。 */
const plain = (value) => (value && typeof value === 'object' ? value.text ?? null : value);
function forValidation(g) {
  return {
    ...g,
    questions: (g.questions ?? []).map((q) => ({ ...q, options: q.options.map((o) => ({ ...o, analysis: plain(o.analysis) })),
      explanation: q.explanation.map((s) => ({ ...s, title: plain(s.title), body: plain(s.body) })) })),
  };
}

// ---------- データベースが要る自動檢查 ----------
function serverChecks(db, userId, g, type, { exceptGroupRid = null } = {}) {
  const warnings = [];
  const has = (rule) => type.rules?.[rule]?.requirement === 'warn';
  g.questions.forEach((q, qi) => {
    const options = q.options.map((o) => o.text).filter(Boolean);
    const distractors = q.options.filter((o) => !o.correct && o.text).map((o) => o.text);
    const points = q.knowledge.map((k) => db.prepare('SELECT rid, expression, reading FROM knowledge_points WHERE user_id = ? AND code = ?').get(userId, k.code)).filter(Boolean);
    if (has('distractor_in_knowledge') && points.length) {
      const related = new Set(points.flatMap((p) => [
        ...db.prepare('SELECT form AS v FROM knowledge_alternate_forms WHERE point_rid = ?').all(p.rid),
        ...db.prepare('SELECT word AS v FROM knowledge_related_words WHERE point_rid = ?').all(p.rid),
        ...db.prepare('SELECT target AS v FROM knowledge_comparisons WHERE point_rid = ?').all(p.rid),
      ].map((r) => r.v)));
      for (const d of distractors) if (related.has(d)) warnings.push({ path: `questions[${qi}].options`, code: 'distractor_in_knowledge', message: `干扰项「${d}」是相关知识点的其他写法、相关词或辨析对象，可能也是正确答案` });
    }
    if (has('distractor_also_reading')) {
      const target = q.marks.find((m) => m.kind === 'target' && !m.material);
      const word = target && q.prompt ? q.prompt.slice(target.start, target.end) : null;
      if (word) {
        const readings = new Set(db.prepare('SELECT reading FROM knowledge_points WHERE user_id = ? AND (expression = ? OR base_form = ?) AND reading IS NOT NULL').all(userId, word, word).map((r) => r.reading));
        for (const d of distractors) if (readings.has(d)) warnings.push({ path: `questions[${qi}].options`, code: 'distractor_also_reading', message: `干扰项「${d}」是「${word}」的另一个有效读音` });
      }
    }
    if (has('duplicate_options') && points.length && options.length) {
      const key = [...options].sort().join('\u0000');
      const others = db.prepare(`SELECT DISTINCT q.rid, q.code FROM knowledge_point_questions l JOIN questions q ON q.rid = l.question_rid
        WHERE l.point_rid IN (SELECT value FROM json_each(?)) AND q.group_rid IS NOT ?`).all(JSON.stringify(points.map((p) => p.rid)), exceptGroupRid);
      for (const other of others) {
        const texts = db.prepare('SELECT text FROM question_options WHERE question_rid = ? AND text IS NOT NULL').all(other.rid).map((r) => r.text).sort().join('\u0000');
        if (texts === key) warnings.push({ path: `questions[${qi}].options`, code: 'duplicate_options', message: `与同一知识点的题目 ${other.code} 选项完全相同` });
      }
    }
  });
  return warnings;
}

/** 書き込まずに校驗だけする（POST /api/v3/questions/validate、MCP validate_question）。 */
export function validateGroup(db, userId, input, { exceptGroupRid = null } = {}) {
  const g = normalizeGroup(input);
  const type = typeFor(db, g.typeId);
  const texts = materialTexts(db, userId, g.materials.map((m) => m.material));
  const result = validateQuestionGroup(forValidation(g), type, { materialTexts: texts });
  // 存在しない知識項目
  g.questions.forEach((q, qi) => q.knowledge.forEach((k, ki) => {
    if (!db.prepare('SELECT 1 FROM knowledge_points WHERE user_id = ? AND code = ?').get(userId, k.code)) result.errors.push({ path: `questions[${qi}].knowledge[${ki}]`, code: 'knowledge_not_found', message: `找不到知识点：${k.code}` });
  }));
  if (type && !result.errors.length) result.warnings.push(...serverChecks(db, userId, g, type, { exceptGroupRid }));
  return { ok: !result.errors.length, errors: result.errors, warnings: result.warnings, normalized: g, type };
}

// ---------- 書き込み ----------
function groupRid(db, userId, code) {
  const row = db.prepare('SELECT rid FROM question_groups WHERE user_id = ? AND code = ?').get(userId, String(code ?? '').toUpperCase());
  if (!row) throw new NotFoundError(`找不到题组：${code}`);
  return row.rid;
}

/** 子行を位置で置き換える（行を残すと他言語の訳が残る）。 */
function replaceRows(db, table, parentColumn, parentRid, rows, write) {
  const existing = db.prepare(`SELECT rid FROM ${table} WHERE ${parentColumn} = ? ORDER BY position`).all(parentRid).map((r) => r.rid);
  db.prepare(`UPDATE ${table} SET position = position + 100000 WHERE ${parentColumn} = ?`).run(parentRid);
  const kept = rows.map((row, position) => write(row, position, existing[position] ?? null));
  for (const extra of existing.slice(rows.length)) db.prepare(`DELETE FROM ${table} WHERE rid = ?`).run(extra);
  return kept;
}

function writeQuestion(db, userId, group, q, position, existingRid, ctx) {
  const now = ctx.now;
  // 題干がなく自分の音声もない聴解の小題は、題組の音声を題干の音声にする（移行と同じ）
  const promptMedia = q.promptMediaId ? ownedMedia(db, userId, q.promptMediaId) : q.prompt ? null : ctx.audioMediaRid ?? null;
  if (!q.prompt && !promptMedia) throw new InputError(`questions[${position}] 需要题干，或题组里的音频`);
  let rid = existingRid;
  if (rid) {
    db.prepare('UPDATE questions SET position = ?, prompt = ?, prompt_media_rid = ?, expected_text = ?, updated_at = ? WHERE rid = ?').run(position, q.prompt, promptMedia, q.expectedText, now, rid);
  } else {
    const { code } = nextCode(db, userId, PREFIX[ctx.type.module]);
    rid = Number(db.prepare(`INSERT INTO questions (user_id, code, group_rid, position, prompt, prompt_media_rid, expected_text, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(userId, code, group, position, q.prompt, promptMedia, q.expectedText, now, now).lastInsertRowid);
  }
  writeText(db, 'questions', rid, 'translation', q.translation, ctx.language);

  // 選項：id があればその選項（固定番号）を、なければ同じ位置の選項を更新する
  const current = db.prepare('SELECT rid, position FROM question_options WHERE question_rid = ? ORDER BY position').all(rid);
  const ids = new Set(current.map((o) => o.rid));
  for (const o of q.options) if (o.id != null && !ids.has(o.id)) throw new InputError(`选项 ${o.id} 不属于这道题`);
  const claimed = new Set(q.options.map((o) => o.id).filter((id) => id != null));
  const free = current.map((o) => o.rid).filter((id) => !claimed.has(id));
  db.prepare('UPDATE question_options SET position = position + 100000, is_correct = 0 WHERE question_rid = ?').run(rid);
  const optionRids = q.options.map((o, i) => {
    const media = o.mediaId ? ownedMedia(db, userId, o.mediaId) : null;
    const target = o.id ?? (o.id === null && existingRid ? free.shift() : null) ?? null;
    if (target) {
      db.prepare('UPDATE question_options SET position = ?, text = ?, media_rid = ?, distractor_type = ? WHERE rid = ?').run(i, o.text, media, o.distractorType, target);
      return target;
    }
    return Number(db.prepare('INSERT INTO question_options (question_rid, position, text, media_rid, is_correct, distractor_type) VALUES (?, ?, ?, ?, 0, ?)').run(rid, i, o.text, media, o.distractorType).lastInsertRowid);
  });
  const used = new Set(optionRids);
  for (const o of current) if (!used.has(o.rid)) db.prepare('DELETE FROM question_options WHERE rid = ?').run(o.rid);
  q.options.forEach((o, i) => {
    if (o.correct) db.prepare('UPDATE question_options SET is_correct = 1 WHERE rid = ?').run(optionRids[i]);
    writeText(db, 'question_options', optionRids[i], 'analysis', o.analysis, ctx.language);
    writeText(db, 'question_options', optionRids[i], 'translation', o.translation, ctx.language);
  });

  // 標記・証拠・タグ・知識項目は丸ごと置き換え（訳を持たない）
  db.prepare('DELETE FROM question_marks WHERE question_rid = ?').run(rid);
  q.marks.forEach((m, i) => db.prepare('INSERT INTO question_marks (question_rid, position, kind, material_rid, start_offset, end_offset, label) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(rid, i, m.kind, m.material ? ctx.roles.get(m.material) : null, m.start, m.end, m.label));
  replaceRows(db, 'question_explanation_sections', 'question_rid', rid, q.explanation, (s, i, sectionRid) => {
    let id = sectionRid;
    if (id) db.prepare('UPDATE question_explanation_sections SET position = ?, kind = ? WHERE rid = ?').run(i, s.kind, id);
    else id = Number(db.prepare('INSERT INTO question_explanation_sections (question_rid, position, kind) VALUES (?, ?, ?)').run(rid, i, s.kind).lastInsertRowid);
    writeText(db, 'question_explanation_sections', id, 'title', s.title, ctx.language);
    writeText(db, 'question_explanation_sections', id, 'body', s.body, ctx.language);
    return id;
  });
  db.prepare('DELETE FROM question_evidence WHERE question_rid = ?').run(rid);
  q.evidence.forEach((e, i) => db.prepare('INSERT INTO question_evidence (question_rid, option_rid, position, material_rid, source, start_offset, end_offset, quote) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(rid, e.option != null ? optionRids[e.option] : null, i, e.source === 'prompt' ? null : ctx.roles.get(e.material ?? ctx.firstRole) ?? null, e.source, e.start, e.end, e.quote));
  db.prepare('DELETE FROM question_tags WHERE question_rid = ?').run(rid);
  for (const tag of q.tags) db.prepare('INSERT INTO question_tags (question_rid, tag) VALUES (?, ?)').run(rid, tag);
  db.prepare('DELETE FROM knowledge_point_questions WHERE question_rid = ?').run(rid);
  for (const k of q.knowledge) {
    const point = db.prepare('SELECT rid FROM knowledge_points WHERE user_id = ? AND code = ?').get(userId, k.code).rid;
    const next = db.prepare('SELECT coalesce(max(position) + 1, 0) AS n FROM knowledge_point_questions WHERE point_rid = ?').get(point).n;
    db.prepare('INSERT INTO knowledge_point_questions (point_rid, question_rid, relation, position) VALUES (?, ?, ?, ?)').run(point, rid, k.relation, next);
  }
  return rid;
}

function writeMaterials(db, userId, group, materials, language) {
  db.prepare('DELETE FROM question_group_materials WHERE group_rid = ?').run(group);
  const roles = new Map();
  materials.forEach((m, position) => {
    const rid = m.material ? materialRid(db, userId, m.material) : insertMaterial(db, userId, m, language).rid;
    db.prepare('INSERT INTO question_group_materials (group_rid, position, material_rid, role) VALUES (?, ?, ?, ?)').run(group, position, rid, m.role);
    roles.set(m.role, rid);
  });
  return roles;
}

/** システムの自動檢查を審査記録にする。前回までの発見は修正済みとして閉じる。 */
function recordSystemReview(db, group, warnings, now) {
  db.prepare('UPDATE question_review_findings SET resolved = 1 WHERE review_rid IN (SELECT rid FROM question_reviews WHERE group_rid = ?)').run(group);
  const review = Number(db.prepare("INSERT INTO question_reviews (group_rid, reviewer, verdict, agent_label, created_at) VALUES (?, 'system', ?, NULL, ?)")
    .run(group, warnings.length ? 'revise' : 'pass', now).lastInsertRowid);
  warnings.forEach((w, position) => {
    const qi = /^questions\[(\d+)\]/.exec(w.path)?.[1];
    const questionRid = qi != null ? db.prepare('SELECT rid FROM questions WHERE group_rid = ? AND position = ?').get(group, Number(qi))?.rid ?? null : null;
    const finding = Number(db.prepare("INSERT INTO question_review_findings (review_rid, question_rid, option_rid, check_code, severity, resolved, position) VALUES (?, ?, NULL, ?, ?, 0, ?)")
      .run(review, questionRid, w.code, w.severity ?? 'warning', position).lastInsertRowid);
    writeText(db, 'question_review_findings', finding, 'message', w.message, 'zh-Hans');
  });
}

function writeGroup(db, userId, input, { rid = null, allowInvalid = false } = {}) {
  const language = languageOf(db, userId, input?.language);
  const result = validateGroup(db, userId, input, { exceptGroupRid: rid });
  // 取り込み（市場）だけは規則に反しても保存し、要修正として違反を審査の発見に残す
  if (!result.ok && allowInvalid && result.type) {
    result.normalized.status = 'needs_revision';
    result.warnings.unshift(...result.errors.map((e) => ({ ...e, severity: 'error' })));
  } else if (!result.ok) throw new InputError(`题目不符合 ${result.normalized.typeId} 的规则：${result.errors.map((e) => `${e.path} ${e.message}`).join('；')}`, { errors: result.errors, warnings: result.warnings });
  const g = result.normalized;
  const now = nowIso();
  const status = g.status ?? 'needs_review';
  const shuffle = g.shuffleOptions ?? !(g.official ?? false);
  let group = rid;
  if (group) {
    const current = db.prepare('SELECT type_id FROM question_groups WHERE rid = ?').get(group);
    if (current.type_id !== g.typeId) throw new InputError('题型（typeId）不能修改；请新建题组');
    db.prepare(`UPDATE question_groups SET status = ?, official = ?, level = ?, instruction = ?, context = ?, shuffle_options = ?, source_reference = ?, updated_at = ? WHERE rid = ?`)
      .run(status, g.official ? 1 : 0, g.level ?? null, g.instruction ?? null, g.context ?? null, shuffle ? 1 : 0, g.sourceReference ?? null, now, group);
  } else {
    const { code } = nextCode(db, userId, 'QS');
    group = Number(db.prepare(`INSERT INTO question_groups (user_id, code, type_id, status, official, level, instruction, context, shuffle_options, source_reference, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(userId, code, g.typeId, status, g.official ? 1 : 0, g.level ?? null, g.instruction ?? null, g.context ?? null, shuffle ? 1 : 0, g.sourceReference ?? null, now, now).lastInsertRowid);
  }
  writeText(db, 'question_groups', group, 'instruction_translation', g.instructionTranslation, language);
  writeText(db, 'question_groups', group, 'context_translation', g.contextTranslation, language);
  const roles = writeMaterials(db, userId, group, g.materials, language);
  const audio = roles.get('audio');
  const ctx = { now, language, type: result.type, roles, firstRole: g.materials[0]?.role ?? null,
    audioMediaRid: audio ? db.prepare('SELECT media_rid FROM materials WHERE rid = ?').get(audio)?.media_rid : null };
  const existing = db.prepare('SELECT rid FROM questions WHERE group_rid = ? ORDER BY position').all(group).map((r) => r.rid);
  db.prepare('UPDATE questions SET position = position + 100000 WHERE group_rid = ?').run(group);
  g.questions.forEach((q, position) => writeQuestion(db, userId, group, q, position, existing[position] ?? null, ctx));
  for (const extra of existing.slice(g.questions.length)) deleteQuestionRow(db, extra);
  recordSystemReview(db, group, result.warnings, now);
  const code = db.prepare('SELECT code FROM question_groups WHERE rid = ?').get(group).code;
  return { ...getQuestionGroup(db, userId, code, { language }), warnings: result.warnings };
}

function deleteQuestionRow(db, rid) {
  const usedBy = db.prepare(`SELECT 'practice' AS kind FROM practice_set_entries WHERE question_rid = ? UNION ALL SELECT 'draft' FROM ai_draft_questions WHERE question_rid = ? LIMIT 1`).get(rid, rid);
  if (usedBy) {
    const code = db.prepare('SELECT code FROM questions WHERE rid = ?').get(rid).code;
    throw new ConflictError(`小题 ${code} 已被${usedBy.kind === 'practice' ? '练习' : '草稿'}使用，不能删除；可以把题组停用（retired）`);
  }
  db.prepare('DELETE FROM questions WHERE rid = ?').run(rid);
}

export function createQuestionGroup(db, userId, input, { allowInvalid = false } = {}) {
  return writeGroup(db, userId, input, { allowInvalid });
}

/** 題組を丸ごと書き直す（get_question_group の返り値を直して渡す）。小題は位置、選項は id で同じ行を保つ。 */
export function updateQuestionGroup(db, userId, code, input) {
  return writeGroup(db, userId, input, { rid: groupRid(db, userId, code) });
}

export function deleteQuestionGroup(db, userId, code) {
  const rid = groupRid(db, userId, code);
  for (const q of db.prepare('SELECT rid FROM questions WHERE group_rid = ?').all(rid)) deleteQuestionRow(db, q.rid);
  db.prepare('DELETE FROM question_groups WHERE rid = ?').run(rid);
  return { deleted: String(code).toUpperCase() };
}

/** 状態だけ変える（停用・再開）。ready にはできない：審査を通すこと。 */
export function setGroupStatus(db, userId, code, status) {
  const rid = groupRid(db, userId, code);
  oneOf(status, ['draft', 'needs_review', 'retired'], 'status');
  db.prepare('UPDATE question_groups SET status = ?, updated_at = ? WHERE rid = ?').run(status, nowIso(), rid);
  return { code: String(code).toUpperCase(), status };
}

// ---------- 読み取り ----------
export function getQuestionGroup(db, userId, code, { language: requested } = {}) {
  const rid = groupRid(db, userId, code);
  const language = languageOf(db, userId, requested);
  const g = db.prepare('SELECT g.*, t.module FROM question_groups g JOIN question_types t ON t.type_id = g.type_id WHERE g.rid = ?').get(rid);
  const links = db.prepare('SELECT m.position, m.role, x.* FROM question_group_materials m JOIN materials x ON x.rid = m.material_rid WHERE m.group_rid = ? ORDER BY m.position').all(rid);
  const roleOf = new Map(links.map((l) => [l.rid, l.role]));
  const materials = shapeMaterials(db, links, language).map((m, i) => ({ role: links[i].role, ...m }));
  const questions = db.prepare('SELECT * FROM questions WHERE group_rid = ? ORDER BY position').all(rid);
  const ids = JSON.stringify(questions.map((q) => q.rid));
  const options = db.prepare('SELECT * FROM question_options WHERE question_rid IN (SELECT value FROM json_each(?)) ORDER BY question_rid, position').all(ids);
  const sections = db.prepare('SELECT * FROM question_explanation_sections WHERE question_rid IN (SELECT value FROM json_each(?)) ORDER BY question_rid, position').all(ids);
  const marks = db.prepare('SELECT * FROM question_marks WHERE question_rid IN (SELECT value FROM json_each(?)) ORDER BY question_rid, position').all(ids);
  const evidence = db.prepare('SELECT * FROM question_evidence WHERE question_rid IN (SELECT value FROM json_each(?)) ORDER BY question_rid, position').all(ids);
  const tags = db.prepare('SELECT * FROM question_tags WHERE question_rid IN (SELECT value FROM json_each(?)) ORDER BY tag').all(ids);
  const knowledge = db.prepare(`SELECT l.question_rid, l.relation, k.code, k.expression FROM knowledge_point_questions l JOIN knowledge_points k ON k.rid = l.point_rid
    WHERE l.question_rid IN (SELECT value FROM json_each(?)) ORDER BY k.rid`).all(ids);
  const texts = pickTexts(db, [['question_groups', rid], ...questions.map((q) => ['questions', q.rid]), ...options.map((o) => ['question_options', o.rid]),
    ...sections.map((s) => ['question_explanation_sections', s.rid])], language);
  const own = (table, id) => texts.get(`${table}:${id}`) ?? {};
  return {
    code: g.code, typeId: g.type_id, module: g.module, status: g.status, level: g.level, official: g.official === 1, shuffleOptions: g.shuffle_options === 1,
    instruction: g.instruction, instructionTranslation: own('question_groups', rid).instruction_translation ?? null,
    context: g.context, contextTranslation: own('question_groups', rid).context_translation ?? null, sourceReference: g.source_reference, language,
    materials,
    questions: questions.map((q) => {
      const qOptions = options.filter((o) => o.question_rid === q.rid);
      return {
        code: q.code, position: q.position, prompt: q.prompt, promptMediaId: q.prompt_media_rid, expectedText: q.expected_text,
        translation: own('questions', q.rid).translation ?? null,
        marks: marks.filter((m) => m.question_rid === q.rid).map((m) => ({ kind: m.kind, start: m.start_offset, end: m.end_offset, label: m.label, material: m.material_rid ? roleOf.get(m.material_rid) ?? null : null })),
        options: qOptions.map((o) => ({ id: o.rid, position: o.position, text: o.text, mediaId: o.media_rid, correct: o.is_correct === 1, distractorType: o.distractor_type,
          analysis: own('question_options', o.rid).analysis ?? null, translation: own('question_options', o.rid).translation ?? null })),
        explanation: sections.filter((s) => s.question_rid === q.rid).map((s) => ({ kind: s.kind, title: own('question_explanation_sections', s.rid).title ?? null, body: own('question_explanation_sections', s.rid).body ?? null })),
        evidence: evidence.filter((e) => e.question_rid === q.rid).map((e) => ({ option: e.option_rid ? qOptions.findIndex((o) => o.rid === e.option_rid) : null,
          material: e.material_rid ? roleOf.get(e.material_rid) ?? null : null, source: e.source, start: e.start_offset, end: e.end_offset, quote: e.quote })),
        tags: tags.filter((t) => t.question_rid === q.rid).map((t) => t.tag),
        knowledge: knowledge.filter((k) => k.question_rid === q.rid).map((k) => ({ code: k.code, relation: k.relation, expression: k.expression })),
      };
    }),
    review: reviewSummary(db, rid, language),
    createdAt: g.created_at, updatedAt: g.updated_at,
  };
}

/** 最新の審査と未解決の発見。 */
export function reviewSummary(db, group, language) {
  const latest = db.prepare('SELECT * FROM question_reviews WHERE group_rid = ? ORDER BY created_at DESC, rid DESC LIMIT 1').get(group);
  const findings = db.prepare(`SELECT f.*, r.reviewer, q.code AS question_code FROM question_review_findings f JOIN question_reviews r ON r.rid = f.review_rid
    LEFT JOIN questions q ON q.rid = f.question_rid WHERE r.group_rid = ? AND f.resolved = 0 ORDER BY r.rid, f.position`).all(group);
  const texts = pickTexts(db, [...(latest ? [['question_reviews', latest.rid]] : []), ...findings.map((f) => ['question_review_findings', f.rid])], language);
  return {
    latest: latest ? { reviewer: latest.reviewer, verdict: latest.verdict, agentLabel: latest.agent_label, summary: texts.get(`question_reviews:${latest.rid}`)?.summary ?? null, createdAt: latest.created_at } : null,
    openFindings: findings.map((f) => ({ id: f.rid, reviewer: f.reviewer, question: f.question_code, optionId: f.option_rid, check: f.check_code, severity: f.severity,
      message: texts.get(`question_review_findings:${f.rid}`)?.message ?? null })),
  };
}

/**
 * 題組の一覧：module / typeId / status / level / knowledge（知識項目の番号）/ q（題干・選項・番号）で絞る。
 * 一覧では小題の題干と選項数だけ返す（詳細は getQuestionGroup）。
 */
export function listQuestionGroups(db, userId, query = {}) {
  const where = ['g.user_id = :user'];
  const params = { user: userId };
  if (query.module) { where.push('t.module = :module'); params.module = oneOf(query.module, Object.keys(PREFIX), 'module'); }
  if (query.typeId) { where.push('g.type_id = :type'); params.type = String(query.typeId); }
  if (query.status) { where.push('g.status = :status'); params.status = oneOf(query.status, STATUSES, 'status'); }
  if (query.level) { where.push('g.level = :level'); params.level = oneOf(query.level, LEVELS, 'level'); }
  if (query.knowledge) {
    where.push(`EXISTS (SELECT 1 FROM questions q JOIN knowledge_point_questions l ON l.question_rid = q.rid JOIN knowledge_points k ON k.rid = l.point_rid WHERE q.group_rid = g.rid AND k.code = :knowledge)`);
    params.knowledge = String(query.knowledge).toUpperCase();
  }
  const q = String(query.q ?? '').trim();
  if (q) {
    params.like = `%${q.replace(/[%_]/g, (c) => `\\${c}`)}%`;
    params.code = q.toUpperCase();
    where.push(`(g.code = :code OR EXISTS (SELECT 1 FROM questions x WHERE x.group_rid = g.rid AND (x.code = :code OR x.prompt LIKE :like ESCAPE '\\'
      OR EXISTS (SELECT 1 FROM question_options o WHERE o.question_rid = x.rid AND o.text LIKE :like ESCAPE '\\'))))`);
  }
  const from = `FROM question_groups g JOIN question_types t ON t.type_id = g.type_id WHERE ${where.join(' AND ')}`;
  const total = db.prepare(`SELECT count(*) AS n ${from}`).get(params).n;
  const limit = Math.min(200, Math.max(1, Number(query.limit) || 50));
  const offset = Math.max(0, Number(query.offset) || 0);
  const rows = db.prepare(`SELECT g.rid, g.code, g.type_id, t.module, t.label_ja, g.status, g.level, g.official, g.updated_at ${from} ORDER BY g.rid DESC LIMIT :limit OFFSET :offset`).all({ ...params, limit, offset });
  const questions = rows.length ? db.prepare(`SELECT q.group_rid, q.code, q.prompt, (SELECT count(*) FROM question_options o WHERE o.question_rid = q.rid) AS options
    FROM questions q WHERE q.group_rid IN (SELECT value FROM json_each(?)) ORDER BY q.group_rid, q.position`).all(JSON.stringify(rows.map((r) => r.rid))) : [];
  const materials = rows.length ? db.prepare(`SELECT m.group_rid, x.code, x.kind, m.role FROM question_group_materials m JOIN materials x ON x.rid = m.material_rid
    WHERE m.group_rid IN (SELECT value FROM json_each(?)) ORDER BY m.group_rid, m.position`).all(JSON.stringify(rows.map((r) => r.rid))) : [];
  return {
    total, limit, offset,
    items: rows.map((r) => ({
      code: r.code, typeId: r.type_id, module: r.module, labelJa: r.label_ja, status: r.status, level: r.level, official: r.official === 1, updatedAt: r.updated_at,
      materials: materials.filter((m) => m.group_rid === r.rid).map((m) => ({ material: m.code, kind: m.kind, role: m.role })),
      questions: questions.filter((x) => x.group_rid === r.rid).map((x) => ({ code: x.code, prompt: x.prompt?.slice(0, 120) ?? null, options: x.options })),
    })),
  };
}

/** 小題の番号（QV12）から題組の番号を引く。 */
export function groupOfQuestion(db, userId, questionCode) {
  const row = db.prepare('SELECT g.code FROM questions q JOIN question_groups g ON g.rid = q.group_rid WHERE q.user_id = ? AND q.code = ?').get(userId, String(questionCode ?? '').toUpperCase());
  if (!row) throw new NotFoundError(`找不到题目：${questionCode}`);
  return row.code;
}
export { groupRid };
