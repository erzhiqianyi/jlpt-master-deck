// 題目の審査：AI agent が題組を審査し、結論で状態が決まる（pass → ready、revise → needs_revision、reject → retired）。
// 学習者の「問題を報告」も審査記録（reviewer = user）になり、題組は needs_review に戻る。
import { REVIEW_CHECKLISTS, COMMON_REVIEW_CONTRACT } from '../review-checklists.mjs';
import { preferredLanguage, SUPPORTED_LANGUAGES } from '../i18n.mjs';
import { InputError, NotFoundError, nowIso, oneOf, text, list } from './common.mjs';
import { getQuestionGroup, groupRid, listQuestionTypes, reviewSummary } from './questions.mjs';
import { writeText } from './materials.mjs';

const VERDICT_STATUS = { pass: 'ready', revise: 'needs_revision', reject: 'retired' };
const SEVERITIES = ['error', 'warning', 'info'];
const languageOf = (db, userId, requested) => (SUPPORTED_LANGUAGES.includes(requested) ? requested : preferredLanguage(db, userId));

/** 審査に必要なもの一式：題組の全内容、未解決の発見、題型の規則と審査清単。 */
export function reviewContext(db, userId, code, { language } = {}) {
  const group = getQuestionGroup(db, userId, code, { language: languageOf(db, userId, language) });
  const type = listQuestionTypes(db, group.language).find((t) => t.typeId === group.typeId);
  const history = db.prepare('SELECT reviewer, verdict, agent_label, created_at FROM question_reviews WHERE group_rid = ? ORDER BY rid').all(groupRid(db, userId, code))
    .map((r) => ({ reviewer: r.reviewer, verdict: r.verdict, agentLabel: r.agent_label, createdAt: r.created_at }));
  return {
    group,
    type: { typeId: type.typeId, labelJa: type.labelJa, module: type.module, answerMode: type.answerMode, levels: type.levels, rules: type.rules, task: type.task, tip: type.tip },
    checklist: { common: COMMON_REVIEW_CONTRACT, ...REVIEW_CHECKLISTS[group.typeId] },
    instructions: [
      '逐道小题、逐个选项判断：答案是否唯一；每个干扰项是否有迷惑性但确实错误；解析是否说明了每个选项为什么对或错；题干、选项是否自然；素材与题目是否一致。',
      '自动检查的发现（openFindings 中 reviewer 为 system）需要逐条确认：确实有问题就作为 finding 提交，不是问题就忽略。',
      'verdict：pass（可用）/ revise（需修改，附 findings）/ reject（不可用，停用）。不要审查自己刚出的题；agentLabel 写明审查方。',
    ],
    history,
  };
}

/**
 * 提交审查结论。findings：[{ question?: 小题编号, optionId?: 选项编号, check, severity, message }]。
 * pass 时未解决的旧发现全部关闭；revise 必须至少一条 error 或 warning。
 */
export function submitReview(db, userId, code, input) {
  const rid = groupRid(db, userId, code);
  const language = languageOf(db, userId, input?.language);
  const verdict = oneOf(input?.verdict, Object.keys(VERDICT_STATUS), 'verdict');
  const summary = text(input?.summary, 'summary', { optional: false, max: 4000 });
  const agentLabel = text(input?.agentLabel, 'agentLabel', { max: 120 });
  const reviewer = oneOf(input?.reviewer ?? 'ai', ['ai', 'user'], 'reviewer');
  const findings = list(input?.findings, 'findings', { max: 60 }).map((f, i) => {
    const question = f?.question ? db.prepare('SELECT rid FROM questions WHERE user_id = ? AND code = ? AND group_rid = ?').get(userId, String(f.question).toUpperCase(), rid) : null;
    if (f?.question && !question) throw new InputError(`findings[${i}].question：${f.question} 不在题组 ${code} 里`);
    const option = f?.optionId != null ? db.prepare('SELECT o.rid FROM question_options o JOIN questions q ON q.rid = o.question_rid WHERE o.rid = ? AND q.group_rid = ?').get(Number(f.optionId), rid) : null;
    if (f?.optionId != null && !option) throw new InputError(`findings[${i}].optionId：选项 ${f.optionId} 不在题组 ${code} 里`);
    return { questionRid: question?.rid ?? null, optionRid: option?.rid ?? null, check: text(f?.check, `findings[${i}].check`, { optional: false, max: 80 }),
      severity: oneOf(f?.severity ?? 'warning', SEVERITIES, `findings[${i}].severity`), message: text(f?.message, `findings[${i}].message`, { optional: false, max: 4000 }) };
  });
  if (verdict === 'revise' && !findings.some((f) => f.severity !== 'info')) throw new InputError('revise 需要至少一条 error 或 warning 的 finding，说明要改什么');
  const now = nowIso();
  if (verdict === 'pass') db.prepare('UPDATE question_review_findings SET resolved = 1 WHERE review_rid IN (SELECT rid FROM question_reviews WHERE group_rid = ?)').run(rid);
  const review = Number(db.prepare('INSERT INTO question_reviews (group_rid, reviewer, verdict, agent_label, created_at) VALUES (?, ?, ?, ?, ?)').run(rid, reviewer, verdict, agentLabel, now).lastInsertRowid);
  writeText(db, 'question_reviews', review, 'summary', summary, language);
  findings.forEach((f, position) => {
    const finding = Number(db.prepare('INSERT INTO question_review_findings (review_rid, question_rid, option_rid, check_code, severity, resolved, position) VALUES (?, ?, ?, ?, ?, 0, ?)')
      .run(review, f.questionRid, f.optionRid, f.check, f.severity, position).lastInsertRowid);
    writeText(db, 'question_review_findings', finding, 'message', f.message, language);
  });
  const status = reviewer === 'user' ? 'needs_review' : VERDICT_STATUS[verdict];
  db.prepare('UPDATE question_groups SET status = ?, updated_at = ? WHERE rid = ?').run(status, now, rid);
  return { code: String(code).toUpperCase(), status, review: reviewSummary(db, rid, language) };
}

/** 学習者が練習中に「題目の問題を報告」する。 */
export function reportQuestionProblem(db, userId, questionCode, { message, optionId } = {}) {
  const row = db.prepare('SELECT q.code, g.code AS group_code FROM questions q JOIN question_groups g ON g.rid = q.group_rid WHERE q.user_id = ? AND q.code = ?').get(userId, String(questionCode ?? '').toUpperCase());
  if (!row) throw new NotFoundError(`找不到题目：${questionCode}`);
  return submitReview(db, userId, row.group_code, { verdict: 'revise', reviewer: 'user', summary: '学习者报告题目问题',
    findings: [{ question: row.code, optionId, check: 'learner_report', severity: 'warning', message }] });
}

/** 審査待ち（needs_review）または要修正（needs_revision）の題組。 */
export function listGroupsForReview(db, userId, { status = 'needs_review', limit = 20, offset = 0 } = {}) {
  oneOf(status, ['needs_review', 'needs_revision'], 'status');
  const rows = db.prepare(`SELECT g.rid, g.code, g.type_id, g.updated_at FROM question_groups g WHERE g.user_id = ? AND g.status = ? ORDER BY g.updated_at, g.rid LIMIT ? OFFSET ?`)
    .all(userId, status, Math.min(100, Math.max(1, Number(limit) || 20)), Math.max(0, Number(offset) || 0));
  const total = db.prepare('SELECT count(*) AS n FROM question_groups WHERE user_id = ? AND status = ?').get(userId, status).n;
  const language = preferredLanguage(db, userId);
  return { status, total, items: rows.map((r) => ({ code: r.code, typeId: r.type_id, updatedAt: r.updated_at, review: reviewSummary(db, r.rid, language) })) };
}
