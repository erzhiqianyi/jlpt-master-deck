// AI の練習下書き：AI が問題（題庫の題組）を作り、学習目標・説明・節にまとめる → 学習者がコメント・確認 → 練習として公開。
// 公開できるのは、含まれる題組がすべて審査を通った（ready）ものだけ。
import { pickTexts, preferredLanguage, SUPPORTED_LANGUAGES } from '../i18n.mjs';
import { ConflictError, InputError, NotFoundError, nextCode, nowIso, oneOf, text, list, LEVELS } from './common.mjs';
import { writeText } from './materials.mjs';
import { createPracticeSet } from './practice.mjs';

const STATUSES = ['draft', 'needs_revision', 'approved', 'archived'];
const languageOf = (db, userId, requested) => (SUPPORTED_LANGUAGES.includes(requested) ? requested : preferredLanguage(db, userId));

function draftRow(db, userId, code) {
  const r = db.prepare('SELECT * FROM ai_drafts WHERE user_id = ? AND code = ?').get(userId, String(code ?? '').toUpperCase());
  if (!r) throw new NotFoundError(`找不到草稿：${code}`);
  return r;
}
function questionRid(db, userId, code) {
  const r = db.prepare('SELECT rid FROM questions WHERE user_id = ? AND code = ?').get(userId, String(code ?? '').toUpperCase());
  if (!r) throw new InputError(`找不到题目：${code}（先用 create_question_group 建题）`);
  return r.rid;
}

function writeContent(db, userId, rid, input, language) {
  for (const [key, field] of [['title', 'title'], ['description', 'description'], ['nextStep', 'next_step']]) writeText(db, 'ai_drafts', rid, field, input[key], language);
  if ('objectives' in input) {
    db.prepare('DELETE FROM ai_draft_objectives WHERE draft_rid = ?').run(rid);
    list(input.objectives, 'objectives', { max: 20 }).forEach((o, position) => {
      const id = Number(db.prepare('INSERT INTO ai_draft_objectives (draft_rid, position) VALUES (?, ?)').run(rid, position).lastInsertRowid);
      writeText(db, 'ai_draft_objectives', id, 'objective', o, language);
    });
  }
  if ('sections' in input || 'quiz' in input || 'generated' in input) {
    db.prepare('DELETE FROM ai_draft_questions WHERE draft_rid = ?').run(rid);
    db.prepare('DELETE FROM ai_draft_sections WHERE draft_rid = ?').run(rid);
    list(input.sections, 'sections', { max: 20 }).forEach((s, position) => {
      const sectionRid = Number(db.prepare('INSERT INTO ai_draft_sections (draft_rid, position, instruction) VALUES (?, ?, ?)').run(rid, position, text(s?.instruction, 'instruction', { max: 2000 })).lastInsertRowid);
      writeText(db, 'ai_draft_sections', sectionRid, 'title', s?.title, language);
      writeText(db, 'ai_draft_sections', sectionRid, 'body', s?.body, language);
      list(s?.questions, `sections[${position}].questions`, { max: 100 }).forEach((c, i) => db.prepare("INSERT INTO ai_draft_questions (draft_rid, section_rid, role, position, question_rid) VALUES (?, ?, 'section', ?, ?)").run(rid, sectionRid, i, questionRid(db, userId, c)));
    });
    for (const role of ['quiz', 'generated']) {
      list(input[role], role, { max: 200 }).forEach((c, i) => db.prepare('INSERT INTO ai_draft_questions (draft_rid, section_rid, role, position, question_rid) VALUES (?, NULL, ?, ?, ?)').run(rid, role, i, questionRid(db, userId, c)));
    }
  }
}

/**
 * 下書きを作る。input：{ title, description, nextStep, kind, strategy, targetLevel, date, minutes, objectives[],
 *   sections: [{ title, body, instruction, questions: [QV1…] }], quiz: [QV…], generated: [QV…], language }
 */
export function createDraft(db, userId, input = {}) {
  const language = languageOf(db, userId, input.language);
  text(input.title, 'title', { optional: false, max: 200 });
  const { code } = nextCode(db, userId, 'DR');
  const now = nowIso();
  const rid = Number(db.prepare(`INSERT INTO ai_drafts (user_id, code, status, kind, strategy, target_level, practice_date, minutes, generated_at, created_at, updated_at)
    VALUES (?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?)`).run(userId, code,
    input.kind ? oneOf(input.kind, ['daily_review_pack', 'grammar_practice'], 'kind') : null, input.strategy ? oneOf(input.strategy, ['targeted_by_history', 'agent_topic'], 'strategy') : null,
    input.targetLevel ? oneOf(input.targetLevel, LEVELS, 'targetLevel') : null, input.date ?? null, input.minutes ?? null, now, now, now).lastInsertRowid);
  writeContent(db, userId, rid, input, language);
  return getDraft(db, userId, code, { language });
}

/** 部分更新。節・小テスト・生成問題を渡すとまとめて置き換える。内容が変わると確認待ち（draft）に戻る。 */
export function updateDraft(db, userId, code, input = {}) {
  const r = draftRow(db, userId, code);
  const language = languageOf(db, userId, input.language);
  const columns = {};
  if ('kind' in input) columns.kind = input.kind ? oneOf(input.kind, ['daily_review_pack', 'grammar_practice'], 'kind') : null;
  if ('targetLevel' in input) columns.target_level = input.targetLevel ? oneOf(input.targetLevel, LEVELS, 'targetLevel') : null;
  if ('date' in input) columns.practice_date = input.date ?? null;
  if ('minutes' in input) columns.minutes = input.minutes ?? null;
  columns.status = r.status === 'archived' ? 'archived' : 'draft';
  db.prepare(`UPDATE ai_drafts SET ${Object.keys(columns).map((c) => `${c} = ?`).join(', ')}, updated_at = ? WHERE rid = ?`).run(...Object.values(columns), nowIso(), r.rid);
  writeContent(db, userId, r.rid, input, language);
  return getDraft(db, userId, code, { language });
}

export function setDraftStatus(db, userId, code, status) {
  const r = draftRow(db, userId, code);
  db.prepare('UPDATE ai_drafts SET status = ?, updated_at = ? WHERE rid = ?').run(oneOf(status, STATUSES, 'status'), nowIso(), r.rid);
  return getDraft(db, userId, code);
}

export function addDraftComment(db, userId, code, body) {
  const r = draftRow(db, userId, code);
  const { code: commentCode } = nextCode(db, userId, 'DC');
  const now = nowIso();
  db.prepare('INSERT INTO ai_draft_comments (draft_rid, code, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(r.rid, commentCode, text(body, 'body', { optional: false, max: 8000 }), now, now);
  if (r.status === 'approved') db.prepare("UPDATE ai_drafts SET status = 'needs_revision', updated_at = ? WHERE rid = ?").run(now, r.rid);
  return getDraft(db, userId, code);
}

export function deleteDraft(db, userId, code) {
  const r = draftRow(db, userId, code);
  db.prepare('DELETE FROM ai_drafts WHERE rid = ?').run(r.rid);
  return { deleted: r.code };
}

export function getDraft(db, userId, code, { language } = {}) {
  const r = draftRow(db, userId, code);
  const lang = languageOf(db, userId, language);
  const objectives = db.prepare('SELECT rid FROM ai_draft_objectives WHERE draft_rid = ? ORDER BY position').all(r.rid);
  const sections = db.prepare('SELECT rid, position, instruction FROM ai_draft_sections WHERE draft_rid = ? ORDER BY position').all(r.rid);
  const questions = db.prepare(`SELECT x.section_rid, x.role, x.position, q.code, g.code AS group_code, g.type_id, g.status, q.prompt FROM ai_draft_questions x JOIN questions q ON q.rid = x.question_rid
    JOIN question_groups g ON g.rid = q.group_rid WHERE x.draft_rid = ? ORDER BY x.role, x.section_rid, x.position`).all(r.rid);
  const texts = pickTexts(db, [['ai_drafts', r.rid], ...objectives.map((o) => ['ai_draft_objectives', o.rid]), ...sections.map((s) => ['ai_draft_sections', s.rid])], lang);
  const own = (table, rid) => texts.get(`${table}:${rid}`) ?? {};
  const shape = (q) => ({ question: q.code, group: q.group_code, typeId: q.type_id, groupStatus: q.status, prompt: q.prompt?.slice(0, 160) ?? null });
  const practice = db.prepare('SELECT code FROM practice_sets WHERE source_draft_rid = ? ORDER BY rid DESC').all(r.rid).map((p) => p.code);
  return {
    code: r.code, status: r.status, kind: r.kind, strategy: r.strategy, targetLevel: r.target_level, date: r.practice_date, minutes: r.minutes, language: lang,
    title: own('ai_drafts', r.rid).title ?? null, description: own('ai_drafts', r.rid).description ?? null, nextStep: own('ai_drafts', r.rid).next_step ?? null,
    objectives: objectives.map((o) => own('ai_draft_objectives', o.rid).objective ?? null).filter(Boolean),
    sections: sections.map((s) => ({ position: s.position, instruction: s.instruction, title: own('ai_draft_sections', s.rid).title ?? null, body: own('ai_draft_sections', s.rid).body ?? null,
      questions: questions.filter((q) => q.role === 'section' && q.section_rid === s.rid).map(shape) })),
    quiz: questions.filter((q) => q.role === 'quiz').map(shape), generated: questions.filter((q) => q.role === 'generated').map(shape),
    comments: db.prepare('SELECT code, body, created_at FROM ai_draft_comments WHERE draft_rid = ? ORDER BY rid').all(r.rid).map((c) => ({ code: c.code, body: c.body, createdAt: c.created_at })),
    published: practice, createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

export function listDrafts(db, userId, { status, limit = 50, language } = {}) {
  const lang = languageOf(db, userId, language);
  const where = ['user_id = :user'];
  const params = { user: userId };
  if (status) { where.push('status = :status'); params.status = oneOf(status, STATUSES, 'status'); }
  const rows = db.prepare(`SELECT rid, code, status, kind, practice_date, created_at, updated_at, (SELECT count(*) FROM ai_draft_questions x WHERE x.draft_rid = ai_drafts.rid) AS questions,
      (SELECT count(*) FROM ai_draft_comments c WHERE c.draft_rid = ai_drafts.rid) AS comments FROM ai_drafts WHERE ${where.join(' AND ')} ORDER BY rid DESC LIMIT :limit`)
    .all({ ...params, limit: Math.min(200, Math.max(1, Number(limit) || 50)) });
  const texts = pickTexts(db, rows.map((r) => ['ai_drafts', r.rid]), lang);
  return rows.map((r) => ({ code: r.code, status: r.status, kind: r.kind, date: r.practice_date, questionCount: r.questions, commentCount: r.comments,
    title: texts.get(`ai_drafts:${r.rid}`)?.title ?? null, createdAt: r.created_at, updatedAt: r.updated_at }));
}

/** 下書きを毎日の練習として公開する。題組がすべて審査を通っていること。 */
export function publishDraft(db, userId, code, { date, title } = {}) {
  const r = draftRow(db, userId, code);
  const draft = getDraft(db, userId, code);
  const all = [...draft.sections.flatMap((s) => s.questions), ...draft.quiz, ...draft.generated];
  if (!all.length) throw new InputError('草稿里没有题目');
  const notReady = [...new Set(all.filter((q) => q.groupStatus !== 'ready').map((q) => q.group))];
  if (notReady.length) throw new ConflictError(`这些题组还没有通过审查，不能发布：${notReady.join('、')}`);
  const sections = [
    ...draft.sections.filter((s) => s.questions.length).map((s) => ({ title: s.title?.text ?? undefined, description: s.body?.text ?? undefined, instruction: s.instruction ?? undefined, questions: s.questions.map((q) => q.question) })),
    ...(draft.quiz.length ? [{ title: '小测', questions: draft.quiz.map((q) => q.question) }] : []),
    ...(draft.generated.length ? [{ title: '练习', questions: draft.generated.map((q) => q.question) }] : []),
  ];
  const set = createPracticeSet(db, userId, { kind: 'daily', title: title ?? draft.title?.text ?? r.code, description: draft.description?.text, date: date ?? draft.date ?? undefined,
    minutes: draft.minutes ?? undefined, level: draft.targetLevel ?? undefined, strategy: 'approved_draft_full_set', sections });
  db.prepare("UPDATE practice_sets SET source_draft_rid = ? WHERE user_id = ? AND code = ?").run(r.rid, userId, set.code);
  db.prepare("UPDATE ai_drafts SET status = 'approved', updated_at = ? WHERE rid = ?").run(nowIso(), r.rid);
  return { draft: r.code, practice: set.code };
}
