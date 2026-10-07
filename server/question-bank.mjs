import { createHash } from 'node:crypto';
import { questionStrategy, resolveLegacyAnswer } from '../src/domain/questionContract.mjs';

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const assertOwner = owner => { if (!Number.isSafeInteger(owner) || owner < 1) throw new Error('Authenticated owner required'); };
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => [key, stable(value[key])])) : value;
export function ensureQuestionBankSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS bank_questions (
      owner INTEGER NOT NULL, id TEXT NOT NULL, latest_revision INTEGER NOT NULL,
      status TEXT NOT NULL, PRIMARY KEY(owner,id)
    );
    CREATE TABLE IF NOT EXISTS bank_question_versions (
      owner INTEGER NOT NULL, question_id TEXT NOT NULL, revision INTEGER NOT NULL,
      fingerprint TEXT NOT NULL, payload_json TEXT NOT NULL,
      PRIMARY KEY(owner,question_id,revision), UNIQUE(owner,question_id,fingerprint)
    );
    CREATE TABLE IF NOT EXISTS bank_question_aliases (
      owner INTEGER NOT NULL, source_kind TEXT NOT NULL, source_id TEXT NOT NULL, source_question_id TEXT NOT NULL,
      question_id TEXT NOT NULL, revision INTEGER NOT NULL,
      PRIMARY KEY(owner,source_kind,source_id,source_question_id)
    );
  `);
}

// Pure dry-run adaptation: no SQL, identity comes from owner + explicit source, never stem.
export function adaptQuestionSource(owner, source, question, { numericAnswerBase, status = 'needs_review' } = {}) {
  assertOwner(owner);
  if (!['draft','needs_review','ready','retired'].includes(status)) throw new Error('Invalid question status');
  if (!source.kind || !source.id || !source.questionId) throw new Error('Complete source identity required');
  const strategy = questionStrategy(question.questionTypeId ?? question.kind ?? question.type);
  const content = { ...question };
  for (const key of ['id', 'sourceDraftId', 'sourceQuestionId', 'canonicalQuestionId', 'questionRevision', 'practiceReference']) delete content[key];
  const normalized = resolveLegacyAnswer(content, { numericAnswerBase });
  const payload = stable({ schemaVersion: 1, questionTypeId: strategy?.id ?? null, legacy: content, options: normalized.options, answer: normalized.answer });
  return {
    owner, source: { kind: String(source.kind), id: String(source.id), questionId: String(source.questionId) },
    id: `bank-${digest([owner, source.kind, source.id, source.questionId]).slice(0,32)}`,
    status, payload, fingerprint: digest(payload),
  };
}

// Draft archival preserves incomplete/ambiguous authored content without inventing an answer.
export function archiveDraftQuestions(db, owner, draft) {
  assertOwner(owner);
  const sections=Array.isArray(draft.content?.sections)?draft.content.sections:[];
  let questionIndex = 0;
  for (const section of sections) {
    const questions=Array.isArray(section?.questions)?section.questions:[];
    for (const question of questions) {
      questionIndex++;
      const source={kind:'draft',id:draft.id,questionId:String(question?.id ?? `draft-q${questionIndex}`)};
      const strategy=questionStrategy(question?.questionTypeId ?? question?.kind ?? question?.type);
      const payload=stable({schemaVersion:1,questionTypeId:strategy?.id??null,legacy:question,
        sectionContext:{title:section.title,instruction:section.instruction},
        answer:{type:'unscored'},validationStatus:'unreviewed'});
      saveQuestionSource(db,{owner,source,id:`bank-${digest([owner,source.kind,source.id,source.questionId]).slice(0,32)}`,
        status:'needs_review',payload,fingerprint:digest(payload)});
    }
  }
}

export function saveQuestionSource(db, adapted) {
  const { owner, source, fingerprint, payload, status } = adapted;
  assertOwner(owner);
  const alias = db.prepare('SELECT question_id FROM bank_question_aliases WHERE owner=? AND source_kind=? AND source_id=? AND source_question_id=?')
    .get(owner, source.kind, source.id, source.questionId);
  const id = alias?.question_id ?? adapted.id;
  const identical = db.prepare('SELECT revision FROM bank_question_versions WHERE owner=? AND question_id=? AND fingerprint=?').get(owner,id,fingerprint);
  const current = db.prepare('SELECT latest_revision FROM bank_questions WHERE owner=? AND id=?').get(owner,id);
  const revision = identical?.revision ?? (current?.latest_revision ?? 0) + 1;
  if (!identical) {
    db.prepare('INSERT INTO bank_question_versions(owner,question_id,revision,fingerprint,payload_json) VALUES(?,?,?,?,?)')
      .run(owner,id,revision,fingerprint,JSON.stringify(payload));
  }
  db.prepare(`INSERT INTO bank_questions(owner,id,latest_revision,status) VALUES(?,?,?,?)
    ON CONFLICT(owner,id) DO UPDATE SET latest_revision=MAX(bank_questions.latest_revision,excluded.latest_revision),
    status=CASE WHEN excluded.latest_revision >= bank_questions.latest_revision THEN excluded.status ELSE bank_questions.status END`)
    .run(owner,id,revision,status);
  linkQuestionAlias(db,owner,source,{id,revision});
  return { id, revision };
}
export function linkQuestionAlias(db, owner, source, ref) {
  assertOwner(owner);
  const previous = db.prepare('SELECT question_id FROM bank_question_aliases WHERE owner=? AND source_kind=? AND source_id=? AND source_question_id=?')
    .get(owner,source.kind,source.id,source.questionId);
  if (previous && previous.question_id !== ref.id) throw new Error('Question alias conflict');
  if (!readQuestionVersion(db,owner,ref)) throw new Error('Question version not found');
  db.prepare(`INSERT INTO bank_question_aliases(owner,source_kind,source_id,source_question_id,question_id,revision) VALUES(?,?,?,?,?,?)
    ON CONFLICT(owner,source_kind,source_id,source_question_id) DO UPDATE SET revision=excluded.revision`)
    .run(owner,source.kind,source.id,source.questionId,ref.id,ref.revision);
}
export function readQuestionVersion(db,owner,ref) {
  assertOwner(owner);
  const row=db.prepare('SELECT payload_json FROM bank_question_versions WHERE owner=? AND question_id=? AND revision=?').get(owner,ref.id,ref.revision);
  return row ? JSON.parse(row.payload_json) : null;
}
