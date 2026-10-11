// 練習（v3）：練習（practice_sets）、練習記録（practice_attempts）、解答（attempt_answers）。
// 解答すると最新の解答（question_answer_states）、学習イベント（learning_events、event_id で重複を除く）、関連する知識項目の復習予定（review_schedules）も更新する。
// 出題するときは、答えていない問題の正解・解説・訳・スクリプトを返さない。
import { createHash } from 'node:crypto';
import { scheduleAfterAnswer } from '../../../src/domain/reviewSchedule.mjs';
import { pickTexts, preferredLanguage, SUPPORTED_LANGUAGES } from '../i18n.mjs';
import { ConflictError, InputError, NotFoundError, nextCode, nowIso, oneOf, text, list, LEVELS } from './common.mjs';
import { getQuestionGroup } from './questions.mjs';
import { writeText } from './materials.mjs';

const SET_KINDS = ['daily', 'topic', 'mixed', 'mock'];
const ATTEMPT_KINDS = ['daily', 'vocabulary', 'grammar', 'reading', 'listening', 'mixed', 'mock'];
const SET_PREFIX = { daily: 'DP', topic: 'TP', mixed: 'TP', mock: 'MX' };
const SOURCES = ['ios', 'web', 'app', 'mcp'];
const languageOf = (db, userId, requested) => (SUPPORTED_LANGUAGES.includes(requested) ? requested : preferredLanguage(db, userId));
const iso = (value, label) => {
  if (value == null) return null;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) throw new InputError(`${label} 应为时间（ISO 8601）`);
  return new Date(time).toISOString();
};

function questionRidByCode(db, userId, code) {
  const row = db.prepare('SELECT rid FROM questions WHERE user_id = ? AND code = ?').get(userId, String(code ?? '').toUpperCase());
  if (!row) throw new NotFoundError(`找不到题目：${code}`);
  return row.rid;
}
function setRid(db, userId, code) {
  const row = db.prepare('SELECT rid FROM practice_sets WHERE user_id = ? AND code = ?').get(userId, String(code ?? '').toUpperCase());
  if (!row) throw new NotFoundError(`找不到练习：${code}`);
  return row.rid;
}
function attemptRow(db, userId, code) {
  const row = db.prepare('SELECT * FROM practice_attempts WHERE user_id = ? AND code = ?').get(userId, String(code ?? '').toUpperCase());
  if (!row) throw new NotFoundError(`找不到练习记录：${code}`);
  return row;
}

// ---------- 出題の形 ----------
/**
 * 題目の一覧（question rid の順）を出題用の形にする。reveal に入っている小題だけ正解と解説を付ける。
 * 返り値：{ groups: { QS1: 題組の共通部分 }, items: [{ question, result? }] }
 */
export function presentQuestions(db, userId, questionRids, { language, reveal = new Set() } = {}) {
  const rows = questionRids.length ? db.prepare(`SELECT q.rid, q.code, g.code AS group_code FROM questions q JOIN question_groups g ON g.rid = q.group_rid
    WHERE q.rid IN (SELECT value FROM json_each(?))`).all(JSON.stringify(questionRids)) : [];
  const byRid = new Map(rows.map((r) => [r.rid, r]));
  const groupCache = new Map();
  const groups = {};
  const answerModes = new Map(db.prepare('SELECT type_id, answer_mode FROM question_types').all().map((r) => [r.type_id, r.answer_mode]));
  const items = questionRids.map((rid) => {
    const row = byRid.get(rid);
    if (!row) return { question: null, result: null };
    if (!groupCache.has(row.group_code)) groupCache.set(row.group_code, getQuestionGroup(db, userId, row.group_code, { language }));
    const group = groupCache.get(row.group_code);
    const q = group.questions.find((x) => x.code === row.code);
    const revealed = reveal.has(rid);
    // 題組の共通部分：題組内の全小題を答えるまでスクリプトと訳は出さない
    const groupRevealed = group.questions.every((x) => reveal.has(db.prepare('SELECT rid FROM questions WHERE code = ? AND user_id = ?').get(x.code, userId)?.rid));
    groups[group.code] = {
      code: group.code, typeId: group.typeId, module: group.module, level: group.level, answerMode: answerModes.get(group.typeId), instruction: group.instruction, context: group.context, shuffleOptions: group.shuffleOptions,
      instructionTranslation: groupRevealed ? group.instructionTranslation : null, contextTranslation: groupRevealed ? group.contextTranslation : null,
      materials: group.materials.map((m) => ({
        role: m.role, material: m.material, kind: m.kind, body: m.body, mediaId: m.mediaId, mediaUrl: m.mediaUrl, clipStartMs: m.clipStartMs, clipEndMs: m.clipEndMs, title: m.title,
        ...(groupRevealed ? { transcript: m.transcript, bodyTranslation: m.bodyTranslation, transcriptTranslation: m.transcriptTranslation, summary: m.summary, structure: m.structure, sentences: m.sentences } : {}),
      })),
      questionCount: group.questions.length,
    };
    return {
      question: {
        code: q.code, group: group.code, position: q.position, prompt: q.prompt, promptMediaId: q.promptMediaId, marks: q.marks,
        options: q.options.map((o) => ({ id: o.id, text: o.text, mediaId: o.mediaId })),
        knowledge: q.knowledge.map((k) => ({ code: k.code, expression: k.expression })),
      },
      result: revealed ? {
        correctOptionId: q.options.find((o) => o.correct)?.id ?? null, correctText: q.options.find((o) => o.correct)?.text ?? null, expectedText: q.expectedText,
        translation: q.translation, explanation: q.explanation, evidence: q.evidence,
        options: q.options.map((o) => ({ id: o.id, correct: o.correct, analysis: o.analysis, translation: o.translation, distractorType: o.distractorType })),
      } : null,
    };
  });
  return { groups, items };
}

// ---------- 抽題 ----------
/**
 * 条件に合う使用可（ready）の題目を選ぶ。整組で出す題型は題組ごと入れる。
 * filters：{ module, typeIds, level, wordbook, onlyDue, statuses, knowledge, count, excludeAnsweredCorrectly }
 */
export function pickQuestions(db, userId, filters = {}) {
  const where = ["g.user_id = :user", "g.status = 'ready'"];
  const params = { user: userId };
  if (filters.module) { where.push('t.module = :module'); params.module = oneOf(filters.module, ['vocabulary', 'grammar', 'reading', 'listening'], 'module'); }
  const typeIds = list(filters.typeIds, 'typeIds', { max: 30 });
  if (typeIds.length) { where.push('g.type_id IN (SELECT value FROM json_each(:types))'); params.types = JSON.stringify(typeIds); }
  if (filters.level) { where.push('(g.level = :level OR g.level IS NULL)'); params.level = oneOf(filters.level, LEVELS, 'level'); }
  const knowledgeWhere = [];
  if (filters.wordbook) {
    knowledgeWhere.push('k.wordbook_rid = (SELECT rid FROM wordbooks WHERE user_id = :user AND code = :wordbook)');
    params.wordbook = String(filters.wordbook).toUpperCase();
  }
  if (filters.knowledge?.length) { knowledgeWhere.push('k.code IN (SELECT value FROM json_each(:points))'); params.points = JSON.stringify(filters.knowledge.map((c) => String(c).toUpperCase())); }
  if (filters.onlyDue) { knowledgeWhere.push('(r.due_at IS NULL OR r.due_at <= :now)'); params.now = nowIso(); }
  const statuses = list(filters.statuses, 'statuses', { max: 4 });
  if (statuses.length) {
    knowledgeWhere.push(`coalesce(r.status, 'new') IN (SELECT value FROM json_each(:statuses))`);
    params.statuses = JSON.stringify(statuses.map((s) => oneOf(s, ['new', 'learning', 'review', 'mastered'], 'statuses')));
  }
  if (knowledgeWhere.length) {
    where.push(`EXISTS (SELECT 1 FROM knowledge_point_questions l JOIN knowledge_points k ON k.rid = l.point_rid
      LEFT JOIN review_schedules r ON r.user_id = k.user_id AND r.point_rid = k.rid WHERE l.question_rid = q.rid AND ${knowledgeWhere.join(' AND ')})`);
  }
  if (filters.excludeAnsweredCorrectly) where.push('NOT EXISTS (SELECT 1 FROM question_answer_states s WHERE s.user_id = :user AND s.question_rid = q.rid AND s.correct = 1)');
  const rows = db.prepare(`SELECT q.rid, q.group_rid, t.draw_whole_group FROM questions q JOIN question_groups g ON g.rid = q.group_rid JOIN question_types t ON t.type_id = g.type_id
    WHERE ${where.join(' AND ')}`).all(params);
  const count = Math.min(100, Math.max(1, Number(filters.count) || 10));
  // 題組単位で混ぜてから、整組の題型は題組の全小題を順に入れる
  const groups = new Map();
  for (const r of rows) {
    if (!groups.has(r.group_rid)) groups.set(r.group_rid, { whole: r.draw_whole_group === 1, rids: [] });
    groups.get(r.group_rid).rids.push(r.rid);
  }
  const order = [...groups.entries()].sort(() => Math.random() - 0.5);
  const picked = [];
  for (const [groupRid, g] of order) {
    if (picked.length >= count) break;
    const rids = g.whole ? db.prepare('SELECT rid FROM questions WHERE group_rid = ? ORDER BY position').all(groupRid).map((r) => r.rid) : g.rids;
    picked.push(...rids);
  }
  return picked;
}

// ---------- 練習（practice_sets） ----------
/**
 * 練習を作る（AI の毎日練習・模擬試験、または条件で抽題）。
 * input：{ kind, title, description?, disclaimer?, sourceSummary?, date?, minutes?, level?, strategy?,
 *          sections?: [{ title?, description?, instruction?, durationMinutes?, scheduledDate?, questions: [QV1…] }] | questions?: [QV1…] | filters? }
 */
export function createPracticeSet(db, userId, input) {
  if (!input || typeof input !== 'object') throw new InputError('练习应为对象');
  const kind = oneOf(input.kind ?? 'topic', SET_KINDS, 'kind');
  const language = languageOf(db, userId, input.language);
  const filters = input.filters ?? null;
  let sections = list(input.sections, 'sections', { max: 20 });
  if (!sections.length) {
    const codes = input.questions ? list(input.questions, 'questions', { max: 200 }) : null;
    const rids = codes ? codes.map((c) => questionRidByCode(db, userId, c)) : pickQuestions(db, userId, filters ?? {});
    if (!rids.length) throw new InputError('没有符合条件的可用题目（只抽审查通过的题目）');
    sections = [{ rids }];
  } else {
    sections = sections.map((s, i) => ({ ...s, rids: list(s.questions, `sections[${i}].questions`, { max: 200 }).map((c) => questionRidByCode(db, userId, c)) }));
  }
  const now = nowIso();
  const date = input.date ? text(input.date, 'date', { max: 10 }) : kind === 'daily' ? now.slice(0, 10) : null;
  const version = kind === 'daily' ? (db.prepare("SELECT coalesce(max(version), 0) + 1 AS v FROM practice_sets WHERE user_id = ? AND kind = 'daily' AND practice_date = ?").get(userId, date).v) : 1;
  const { code } = nextCode(db, userId, SET_PREFIX[kind]);
  const rid = Number(db.prepare(`INSERT INTO practice_sets (user_id, code, kind, practice_date, version, minutes, strategy, level, source_draft_rid, generated_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`).run(userId, code, kind, date, version, input.minutes ?? null,
    input.strategy ? oneOf(input.strategy, ['approved_draft_full_set', 'agent_topic', 'targeted_by_history'], 'strategy') : null,
    input.level ? oneOf(input.level, LEVELS, 'level') : null, input.generatedAt ? iso(input.generatedAt, 'generatedAt') : null, now, now).lastInsertRowid);
  for (const field of ['title', 'description', 'disclaimer', 'sourceSummary']) {
    writeText(db, 'practice_sets', rid, field === 'sourceSummary' ? 'source_summary' : field, input[field], language);
  }
  let position = 0;
  sections.forEach((s, i) => {
    let sectionRid = null;
    if (input.sections?.length) {
      sectionRid = Number(db.prepare('INSERT INTO practice_sections (set_rid, position, instruction, scheduled_date, duration_minutes) VALUES (?, ?, ?, ?, ?)')
        .run(rid, i, s.instruction ?? null, s.scheduledDate ?? null, s.durationMinutes ?? null).lastInsertRowid);
      writeText(db, 'practice_sections', sectionRid, 'title', s.title, language);
      writeText(db, 'practice_sections', sectionRid, 'description', s.description, language);
    }
    for (const questionRid of s.rids) db.prepare('INSERT INTO practice_set_entries (set_rid, section_rid, position, question_rid) VALUES (?, ?, ?, ?)').run(rid, sectionRid, position++, questionRid);
  });
  if (filters) {
    db.prepare('INSERT INTO practice_set_filters (set_rid, wordbook_rid, jlpt_level, only_due, question_count) VALUES (?, (SELECT rid FROM wordbooks WHERE user_id = ? AND code = ?), ?, ?, ?)')
      .run(rid, userId, filters.wordbook ? String(filters.wordbook).toUpperCase() : null, filters.level ?? null, filters.onlyDue ? 1 : 0, filters.count ?? null);
    for (const typeId of filters.typeIds ?? []) db.prepare('INSERT INTO practice_set_filter_types (set_rid, type_id) VALUES (?, ?)').run(rid, typeId);
    for (const status of filters.statuses ?? []) db.prepare('INSERT INTO practice_set_filter_statuses (set_rid, status) VALUES (?, ?)').run(rid, status);
  }
  return getPracticeSet(db, userId, code, { language });
}

export function listPracticeSets(db, userId, { kind, date, limit = 50, offset = 0, language } = {}) {
  const lang = languageOf(db, userId, language);
  const where = ['s.user_id = :user'];
  const params = { user: userId };
  if (kind) { where.push('s.kind = :kind'); params.kind = oneOf(kind, SET_KINDS, 'kind'); }
  if (date) { where.push('s.practice_date = :date'); params.date = String(date); }
  const total = db.prepare(`SELECT count(*) AS n FROM practice_sets s WHERE ${where.join(' AND ')}`).get(params).n;
  const rows = db.prepare(`SELECT s.*, (SELECT count(*) FROM practice_set_entries e WHERE e.set_rid = s.rid) AS question_count,
      (SELECT count(*) FROM practice_attempts a WHERE a.set_rid = s.rid AND a.completed_at IS NOT NULL) AS completed_count
    FROM practice_sets s WHERE ${where.join(' AND ')} ORDER BY coalesce(s.practice_date, s.created_at) DESC, s.rid DESC LIMIT :limit OFFSET :offset`)
    .all({ ...params, limit: Math.min(200, Math.max(1, Number(limit) || 50)), offset: Math.max(0, Number(offset) || 0) });
  const texts = pickTexts(db, rows.map((r) => ['practice_sets', r.rid]), lang);
  return {
    total,
    items: rows.map((r) => ({ code: r.code, kind: r.kind, date: r.practice_date, version: r.version, minutes: r.minutes, level: r.level, questionCount: r.question_count,
      completedCount: r.completed_count, title: texts.get(`practice_sets:${r.rid}`)?.title ?? null, createdAt: r.created_at })),
  };
}

export function getPracticeSet(db, userId, code, { language } = {}) {
  const rid = setRid(db, userId, code);
  const lang = languageOf(db, userId, language);
  const s = db.prepare('SELECT * FROM practice_sets WHERE rid = ?').get(rid);
  const sections = db.prepare('SELECT * FROM practice_sections WHERE set_rid = ? ORDER BY position').all(rid);
  const entries = db.prepare(`SELECT e.position, e.section_rid, q.code, g.code AS group_code, g.type_id, g.status FROM practice_set_entries e JOIN questions q ON q.rid = e.question_rid
    JOIN question_groups g ON g.rid = q.group_rid WHERE e.set_rid = ? ORDER BY e.position`).all(rid);
  const texts = pickTexts(db, [['practice_sets', rid], ...sections.map((x) => ['practice_sections', x.rid])], lang);
  const own = texts.get(`practice_sets:${rid}`) ?? {};
  const shape = (e) => ({ position: e.position, question: e.code, group: e.group_code, typeId: e.type_id, groupStatus: e.status });
  return {
    code: s.code, kind: s.kind, date: s.practice_date, version: s.version, minutes: s.minutes, strategy: s.strategy, level: s.level,
    title: own.title ?? null, description: own.description ?? null, disclaimer: own.disclaimer ?? null, sourceSummary: own.source_summary ?? null,
    sections: sections.map((x) => ({ position: x.position, instruction: x.instruction, scheduledDate: x.scheduled_date, durationMinutes: x.duration_minutes,
      title: texts.get(`practice_sections:${x.rid}`)?.title ?? null, description: texts.get(`practice_sections:${x.rid}`)?.description ?? null,
      entries: entries.filter((e) => e.section_rid === x.rid).map(shape) })),
    entries: entries.filter((e) => e.section_rid == null).map(shape),
    attempts: db.prepare('SELECT code, started_at, completed_at FROM practice_attempts WHERE set_rid = ? ORDER BY rid DESC').all(rid)
      .map((a) => ({ code: a.code, startedAt: a.started_at, completedAt: a.completed_at })),
    createdAt: s.created_at, updatedAt: s.updated_at,
  };
}

export function deletePracticeSet(db, userId, code) {
  const rid = setRid(db, userId, code);
  db.prepare('DELETE FROM practice_sets WHERE rid = ?').run(rid);
  return { deleted: String(code).toUpperCase() };
}

// ---------- 練習記録 ----------
/**
 * 練習を始める：practice（DP3 など）の題目、または questions（題目番号の一覧）、または filters で抽題。
 * 進行中の練習は一人一つ（前のものは進行中でなくなる）。
 */
export function startAttempt(db, userId, input = {}) {
  const language = languageOf(db, userId, input.language);
  // オフラインで始めた練習：同じ clientKey は同じ記録（再送しても一つだけ）
  const clientKey = text(input.clientKey, 'clientKey', { max: 120 });
  if (clientKey) {
    const existing = db.prepare('SELECT code FROM practice_attempts WHERE user_id = ? AND client_key = ?').get(userId, clientKey);
    if (existing) return getAttempt(db, userId, existing.code, { language });
  }
  let set = null;
  let rids;
  if (input.practice) {
    set = db.prepare('SELECT * FROM practice_sets WHERE rid = ?').get(setRid(db, userId, input.practice));
    rids = db.prepare('SELECT question_rid FROM practice_set_entries WHERE set_rid = ? ORDER BY position').all(set.rid).map((r) => r.question_rid);
  } else if (input.questions) {
    rids = list(input.questions, 'questions', { max: 200 }).map((c) => questionRidByCode(db, userId, c));
  } else {
    rids = pickQuestions(db, userId, input.filters ?? {});
  }
  if (!rids.length) throw new InputError('没有可以练习的题目（只抽审查通过的题目）');
  const kind = oneOf(input.kind ?? (set ? (set.kind === 'daily' ? 'daily' : set.kind === 'mock' ? 'mock' : 'mixed') : input.filters?.module ?? 'mixed'), ATTEMPT_KINDS, 'kind');
  const now = nowIso();
  const startedAt = iso(input.startedAt, 'startedAt') ?? now;
  db.prepare('UPDATE practice_attempts SET is_active = 0 WHERE user_id = ? AND is_active = 1').run(userId);
  const { code } = nextCode(db, userId, 'AT');
  const rid = Number(db.prepare(`INSERT INTO practice_attempts (user_id, code, set_rid, kind, is_active, started_at, client_key, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?)`)
    .run(userId, code, set?.rid ?? null, kind, startedAt, clientKey, now, now).lastInsertRowid);
  writeText(db, 'practice_attempts', rid, 'title', input.title, language);
  const entries = set ? db.prepare('SELECT rid, position FROM practice_set_entries WHERE set_rid = ? ORDER BY position').all(set.rid) : [];
  rids.forEach((questionRid, position) => db.prepare(`INSERT INTO attempt_answers (attempt_rid, position, entry_rid, question_rid, status) VALUES (?, ?, ?, ?, 'presented')`)
    .run(rid, position, entries[position]?.rid ?? null, questionRid));
  return getAttempt(db, userId, code, { language });
}

/** 練習記録：出題順の題目と、答えたものの結果。 */
export function getAttempt(db, userId, code, { language } = {}) {
  const lang = languageOf(db, userId, language);
  const a = attemptRow(db, userId, code);
  const answers = db.prepare('SELECT * FROM attempt_answers WHERE attempt_rid = ? ORDER BY position').all(a.rid);
  const reveal = new Set(answers.filter((x) => x.status === 'answered' && x.question_rid).map((x) => x.question_rid));
  const presented = presentQuestions(db, userId, answers.map((x) => x.question_rid).filter(Boolean), { language: lang, reveal });
  let index = 0;
  const items = answers.map((x) => {
    const shown = x.question_rid ? presented.items[index++] : { question: null, result: null };
    return {
      position: x.position, status: x.status, ...shown,
      answer: x.status === 'answered' || (x.status === 'missing_original' && (x.selected_text ?? x.answer_text) != null) ? { selectedOptionId: x.selected_option_rid, selectedText: x.selected_text, correct: x.correct == null ? null : x.correct === 1,
        answerText: x.answer_text, recordingId: x.recording_rid, startedAt: x.started_at, answeredAt: x.answered_at, elapsedMs: x.elapsed_ms } : null,
    };
  });
  const scored = items.filter((i) => i.answer?.correct != null);
  const set = a.set_rid ? db.prepare('SELECT code FROM practice_sets WHERE rid = ?').get(a.set_rid)?.code : null;
  return {
    code: a.code, kind: a.kind, practice: set, active: a.is_active === 1, startedAt: a.started_at, completedAt: a.completed_at,
    title: pickTexts(db, [['practice_attempts', a.rid]], lang).get(`practice_attempts:${a.rid}`)?.title ?? null,
    analysisStatus: a.analysis_status, language: lang,
    summary: { total: items.length, answered: items.filter((i) => i.answer).length, scored: scored.length, correct: scored.filter((i) => i.answer.correct).length },
    groups: presented.groups, items,
  };
}

function answerText(value) {
  return String(value ?? '').normalize('NFKC').replace(/[\s、。，．,.！？!?「」『』（）()・…ー〜~]/g, '');
}

/**
 * 1 問答える。input：{ question（QV1）または position, selectedOptionId | answerText | recordingId, eventId, startedAt, answeredAt, elapsedMs, source }。
 * 同じ eventId は一度だけ数える（二度目は保存済みの結果を返す）。答え直しは最新の解答で上書きする。
 */
export function submitAnswer(db, userId, attemptCode, input = {}) {
  const a = attemptRow(db, userId, attemptCode);
  const row = input.question != null
    ? db.prepare('SELECT x.* FROM attempt_answers x JOIN questions q ON q.rid = x.question_rid WHERE x.attempt_rid = ? AND q.code = ?').get(a.rid, String(input.question).toUpperCase())
    : db.prepare('SELECT * FROM attempt_answers WHERE attempt_rid = ? AND position = ?').get(a.rid, Number(input.position));
  if (!row) throw new NotFoundError(`练习 ${a.code} 里没有这道题：${input.question ?? input.position}`);
  if (a.completed_at) {
    // 結束後に届いた再送（同じ事件）は重複として返す
    const sent = input.eventId && db.prepare("SELECT 1 FROM learning_events WHERE user_id = ? AND event_id = ? AND event_type = 'AnswerSubmitted' AND question_rid = ?").get(userId, String(input.eventId), row.question_rid);
    if (sent) return { duplicate: true, ...answerResult(db, userId, a.code, row.position) };
    throw new ConflictError(`练习 ${a.code} 已结束`);
  }
  if (!row.question_rid) throw new ConflictError('这道题的原题已找不到，不能作答');
  const eventId = input.eventId ? text(input.eventId, 'eventId', { max: 120 }) : `${a.code}:${row.position}:${Date.now()}`;
  const source = oneOf(input.source ?? 'web', SOURCES, 'source');
  const answeredAt = iso(input.answeredAt, 'answeredAt') ?? nowIso();
  const q = db.prepare(`SELECT q.rid, q.expected_text, g.type_id, t.answer_mode FROM questions q JOIN question_groups g ON g.rid = q.group_rid JOIN question_types t ON t.type_id = g.type_id WHERE q.rid = ?`).get(row.question_rid);
  // 作答内容と判定
  let selected = null;
  let correct = null;
  let typed = null;
  let recording = null;
  if (q.answer_mode === 'choice') {
    selected = db.prepare('SELECT rid, text, is_correct FROM question_options WHERE rid = ? AND question_rid = ?').get(Number(input.selectedOptionId), q.rid);
    if (!selected) throw new InputError('selectedOptionId 应为这道题的选项编号');
    correct = selected.is_correct === 1;
  } else if (q.answer_mode === 'text_input') {
    typed = text(input.answerText, 'answerText', { optional: false, max: 4000 });
    correct = answerText(typed) === answerText(q.expected_text);
  } else if (q.answer_mode === 'recording') {
    recording = input.recordingId != null ? Number(input.recordingId) : null;
    if (recording && !db.prepare('SELECT 1 FROM speaking_recordings WHERE rid = ? AND user_id = ?').get(recording, userId)) throw new InputError('recordingId 应为自己的录音');
  } else {
    typed = text(input.answerText, 'answerText', { max: 4000 });
  }
  const payload = JSON.stringify({ attempt: a.code, position: row.position, option: selected?.rid ?? null, text: typed, recording });
  const hash = createHash('sha256').update(payload).digest('hex');
  const seen = db.prepare('SELECT payload_hash FROM learning_events WHERE user_id = ? AND event_id = ?').get(userId, eventId);
  if (seen) {
    if (seen.payload_hash !== hash) throw new ConflictError(`事件 ${eventId} 已用于另一次作答`);
    return { duplicate: true, ...answerResult(db, userId, a.code, row.position) };
  }
  const correctOption = q.answer_mode === 'choice' ? db.prepare('SELECT text FROM question_options WHERE question_rid = ? AND is_correct = 1').get(q.rid) : null;
  db.prepare(`UPDATE attempt_answers SET status = 'answered', selected_option_rid = ?, selected_text = ?, correct_text = ?, correct = ?, answer_text = ?, recording_rid = ?,
    started_at = ?, answered_at = ?, elapsed_ms = ? WHERE rid = ?`).run(selected?.rid ?? null, selected?.text ?? null, correctOption?.text ?? (q.answer_mode === 'text_input' ? q.expected_text : null),
    correct == null ? null : correct ? 1 : 0, typed, recording, iso(input.startedAt, 'startedAt'), answeredAt,
    input.elapsedMs == null ? null : Math.max(0, Math.round(Number(input.elapsedMs) || 0)), row.rid);
  db.prepare(`INSERT INTO question_answer_states (user_id, question_rid, selected_option_rid, selected_text, correct, answered_at, submission_state, event_id) VALUES (?, ?, ?, ?, ?, ?, 'submitted', ?)
    ON CONFLICT (user_id, question_rid) DO UPDATE SET selected_option_rid = excluded.selected_option_rid, selected_text = excluded.selected_text, correct = excluded.correct,
      answered_at = excluded.answered_at, submission_state = 'submitted', event_id = excluded.event_id`)
    .run(userId, q.rid, selected?.rid ?? null, selected?.text ?? typed, correct == null ? null : correct ? 1 : 0, answeredAt, eventId);
  const points = db.prepare("SELECT point_rid FROM knowledge_point_questions WHERE question_rid = ? AND relation = 'target'").all(q.rid).map((r) => r.point_rid);
  db.prepare(`INSERT INTO learning_events (user_id, event_id, event_type, occurred_at, received_at, payload_hash, question_rid, point_rid, selected_option_rid, selected_text, correct, type_id, rating, source, count_outcome)
    VALUES (?, ?, 'AnswerSubmitted', ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`).run(userId, eventId, answeredAt, nowIso(), hash, q.rid, points[0] ?? null, selected?.rid ?? null,
    selected?.text ?? typed, correct == null ? null : correct ? 1 : 0, q.type_id, source, correct == null ? 'not_scored' : 'counted');
  // 採点できる解答だけ、考查対象の知識項目の復習予定を進める
  if (correct != null) for (const point of points) updateSchedule(db, userId, point, (current) => scheduleAfterAnswer(current, correct, new Date(answeredAt)), a.rid);
  db.prepare('UPDATE practice_attempts SET updated_at = ? WHERE rid = ?').run(nowIso(), a.rid);
  return { duplicate: false, ...answerResult(db, userId, a.code, row.position) };
}

function answerResult(db, userId, attemptCode, position) {
  const attempt = getAttempt(db, userId, attemptCode);
  const item = attempt.items.find((i) => i.position === position);
  return { attempt: attempt.code, summary: attempt.summary, item, groups: item?.question ? { [item.question.group]: attempt.groups[item.question.group] } : {} };
}

/** 復習予定を読み、計算して保存する。 */
export function updateSchedule(db, userId, pointRid, next, attemptRid = null) {
  const row = db.prepare('SELECT * FROM review_schedules WHERE user_id = ? AND point_rid = ?').get(userId, pointRid);
  const current = row ? { status: row.status, reviewCount: row.review_count, ease: row.ease, intervalDays: row.interval_days, dueAt: row.due_at,
    firstSeenAt: row.first_seen_at, lastReviewedAt: row.last_reviewed_at } : null;
  const s = next(current);
  db.prepare(`INSERT INTO review_schedules (user_id, point_rid, status, review_count, ease, interval_days, due_at, first_seen_at, last_reviewed_at, last_attempt_rid, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (user_id, point_rid) DO UPDATE SET status = excluded.status, review_count = excluded.review_count, ease = excluded.ease, interval_days = excluded.interval_days,
      due_at = excluded.due_at, first_seen_at = excluded.first_seen_at, last_reviewed_at = excluded.last_reviewed_at,
      last_attempt_rid = coalesce(excluded.last_attempt_rid, review_schedules.last_attempt_rid), updated_at = excluded.updated_at`)
    .run(userId, pointRid, s.status, s.reviewCount, s.ease, s.intervalDays, s.dueAt, s.firstSeenAt, s.lastReviewedAt, attemptRid, nowIso());
  return s;
}

export function completeAttempt(db, userId, code, { completedAt } = {}) {
  const a = attemptRow(db, userId, code);
  if (!a.completed_at) db.prepare('UPDATE practice_attempts SET completed_at = ?, is_active = 0, updated_at = ? WHERE rid = ?').run(iso(completedAt, 'completedAt') ?? nowIso(), nowIso(), a.rid);
  return getAttempt(db, userId, code);
}

export function activeAttempt(db, userId, { language } = {}) {
  const row = db.prepare('SELECT code FROM practice_attempts WHERE user_id = ? AND is_active = 1').get(userId);
  return row ? getAttempt(db, userId, row.code, { language }) : null;
}

/** 練習の履歴（新しい順）。正答数などは解答から数える。 */
export function listAttempts(db, userId, { kind, practice, completed, limit = 30, offset = 0, language } = {}) {
  const lang = languageOf(db, userId, language);
  const where = ['a.user_id = :user'];
  const params = { user: userId };
  if (kind) { where.push('a.kind = :kind'); params.kind = oneOf(kind, ATTEMPT_KINDS, 'kind'); }
  if (practice) { where.push('a.set_rid = :set'); params.set = setRid(db, userId, practice); }
  if (completed === true) where.push('a.completed_at IS NOT NULL');
  if (completed === false) where.push('a.completed_at IS NULL');
  const total = db.prepare(`SELECT count(*) AS n FROM practice_attempts a WHERE ${where.join(' AND ')}`).get(params).n;
  const rows = db.prepare(`SELECT a.*, s.code AS set_code,
      (SELECT count(*) FROM attempt_answers x WHERE x.attempt_rid = a.rid) AS total,
      (SELECT count(*) FROM attempt_answers x WHERE x.attempt_rid = a.rid AND (x.status = 'answered' OR (x.status = 'missing_original' AND coalesce(x.selected_text, x.answer_text) IS NOT NULL))) AS answered,
      (SELECT count(*) FROM attempt_answers x WHERE x.attempt_rid = a.rid AND x.correct IS NOT NULL) AS scored,
      (SELECT count(*) FROM attempt_answers x WHERE x.attempt_rid = a.rid AND x.correct = 1) AS correct,
      (SELECT sum(elapsed_ms) FROM attempt_answers x WHERE x.attempt_rid = a.rid) AS elapsed
    FROM practice_attempts a LEFT JOIN practice_sets s ON s.rid = a.set_rid WHERE ${where.join(' AND ')} ORDER BY a.started_at DESC, a.rid DESC LIMIT :limit OFFSET :offset`)
    .all({ ...params, limit: Math.min(200, Math.max(1, Number(limit) || 30)), offset: Math.max(0, Number(offset) || 0) });
  const texts = pickTexts(db, [...rows.map((r) => ['practice_attempts', r.rid]), ...rows.filter((r) => r.set_rid).map((r) => ['practice_sets', r.set_rid])], lang);
  return {
    total,
    items: rows.map((r) => ({ code: r.code, kind: r.kind, practice: r.set_code, active: r.is_active === 1, startedAt: r.started_at, completedAt: r.completed_at,
      title: texts.get(`practice_attempts:${r.rid}`)?.title ?? (r.set_rid ? texts.get(`practice_sets:${r.set_rid}`)?.title ?? null : null),
      summary: { total: r.total, answered: r.answered, scored: r.scored, correct: r.correct, elapsedMs: r.elapsed ?? 0 } })),
  };
}

/** 間違えた問題（最新の解答が不正解のもの）。 */
export function listMistakes(db, userId, { module, limit = 50, offset = 0 } = {}) {
  const where = ['s.user_id = :user', 's.correct = 0'];
  const params = { user: userId };
  if (module) { where.push('t.module = :module'); params.module = oneOf(module, ['vocabulary', 'grammar', 'reading', 'listening'], 'module'); }
  const from = `FROM question_answer_states s JOIN questions q ON q.rid = s.question_rid JOIN question_groups g ON g.rid = q.group_rid JOIN question_types t ON t.type_id = g.type_id WHERE ${where.join(' AND ')}`;
  const total = db.prepare(`SELECT count(*) AS n ${from}`).get(params).n;
  const rows = db.prepare(`SELECT q.code, g.code AS group_code, g.type_id, t.module, q.prompt, s.selected_text, s.answered_at,
      (SELECT o.text FROM question_options o WHERE o.question_rid = q.rid AND o.is_correct = 1) AS correct_text ${from} ORDER BY s.answered_at DESC LIMIT :limit OFFSET :offset`)
    .all({ ...params, limit: Math.min(200, Math.max(1, Number(limit) || 50)), offset: Math.max(0, Number(offset) || 0) });
  return { total, items: rows.map((r) => ({ question: r.code, group: r.group_code, typeId: r.type_id, module: r.module, prompt: r.prompt, selectedText: r.selected_text, correctText: r.correct_text, answeredAt: r.answered_at })) };
}
