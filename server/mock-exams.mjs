import { ensureQuestionBankSchema } from './question-bank.mjs';
import { ensureBankMaterialSchema, attachPracticeReferences } from './bank-materials.mjs';
import { transaction } from './platform.mjs';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { japaneseAnnotationsSchema } from './japanese-annotations.mjs';

const versionRef=z.object({id:z.string().min(1),revision:z.number().int().positive()});
const text = z.string().trim().min(1);
const url = z.string().refine(value => /^https?:\/\//.test(value) || /^\/api\//.test(value), 'Use an HTTP(S) URL or an /api/ asset path');
export const examQuestionSchema = z.object({
  canonicalQuestionId:z.string().optional(),questionRevision:z.number().int().positive().optional(),materialRefs:z.array(versionRef).optional(),questionTypeId:z.string().optional(),
  japaneseAnnotations: japaneseAnnotationsSchema.optional(),
  id: text, prompt: text, passage: z.string().optional(), choices: z.array(text).min(2).max(10),
  answerIndex: z.number().int().min(0), explanation: text,
  choiceExplanations: z.array(z.string()).optional(), translation: z.string().optional(),
  sourceUrl: url.optional(), sourceLabel: z.string().optional(), type: z.string().optional(),
  audioUrl: url.optional(), transcript: z.string().optional(), scoringReady: z.boolean().optional(),
}).strict().superRefine((q, ctx) => {
  if (q.answerIndex >= q.choices.length) ctx.addIssue({ code: 'custom', message: 'answerIndex must identify a choice' });
  if (q.choiceExplanations && q.choiceExplanations.length !== q.choices.length) ctx.addIssue({ code: 'custom', message: 'Provide one explanation per choice' });
});
export const examSessionSchema = z.object({
  id: text, title: text, scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  description: z.string().optional(), durationMinutes: z.number().int().positive().max(1440).optional(),
  questions: z.array(examQuestionSchema).min(1).max(500),
}).strict();
export const examContentFields = {
  title: text, description: z.string().optional(), level: z.string().optional(),
  sessions: z.array(examSessionSchema).min(1).max(100),
};
const contentSchema = z.object(examContentFields).strict().superRefine((exam, ctx) => {
  if (new Set(exam.sessions.map(s => s.id)).size !== exam.sessions.length) ctx.addIssue({ code: 'custom', message: 'Session IDs must be unique' });
  for (const session of exam.sessions) {
    if (new Set(session.questions.map(q => q.id)).size !== session.questions.length) ctx.addIssue({ code: 'custom', message: `Question IDs must be unique within session ${session.id}` });
  }
});
function ensureSchema(db) {
  ensureQuestionBankSchema(db);ensureBankMaterialSchema(db);
  db.exec(`CREATE TABLE IF NOT EXISTS mock_exams (
    id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content_json TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  ); CREATE INDEX IF NOT EXISTS mock_exams_owner_updated ON mock_exams(user_id, updated_at);`);
}
function record(row) {
  return row ? { ...JSON.parse(row.content_json), id: row.id, revision: row.revision, createdAt: row.created_at, updatedAt: row.updated_at } : null;
}
export function listMockExams(db, userId) {
  ensureSchema(db);
  return db.prepare('SELECT * FROM mock_exams WHERE user_id = ? ORDER BY updated_at DESC, id').all(userId).map(row => {
    const exam = record(row);
    return { ...exam, sessions: exam.sessions.map(({ questions, ...session }) => ({ ...session, questionCount: questions.length })) };
  });
}
export function getMockExam(db, userId, id) {
  ensureSchema(db);
  return record(db.prepare('SELECT * FROM mock_exams WHERE user_id = ? AND id = ?').get(userId, id));
}
export function createMockExam(db, userId, input) {
  const content = contentSchema.parse(input);
  ensureSchema(db);
  const id = randomUUID();
  const now = new Date().toISOString();
  transaction(db,()=>{
  for (const session of content.sessions) attachPracticeReferences(db,userId,{id:`mock:${id}:${session.id}`,questions:session.questions});
  db.prepare('INSERT INTO mock_exams (id, user_id, content_json, revision, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)')
    .run(id, userId, JSON.stringify(content), now, now);
  });
  return getMockExam(db, userId, id);
}
export function updateMockExam(db, userId, id, input) {
  const { expectedRevision, ...patch } = z.object({ expectedRevision: z.number().int().positive(),
    title: examContentFields.title.optional(), description: z.string().optional(), level: z.string().optional(), sessions: examContentFields.sessions.optional(),
  }).strict().parse(input);
  if (!Object.keys(patch).length) throw new Error('Provide a field to update');
  const current = getMockExam(db, userId, id);
  if (!current) return null;
  const { revision, createdAt, updatedAt, id: ignored, ...previous } = current;
  const content = contentSchema.parse({ ...previous, ...patch });
  transaction(db,()=>{
  // Optimistic guard precedes canonical writes; rollback leaves no orphan versions.
  if(current.revision!==expectedRevision) {const error=new Error('Exam changed; read it again before updating');error.status=409;throw error;}
  for (const session of content.sessions) attachPracticeReferences(db,userId,{id:`mock:${id}:${session.id}`,questions:session.questions});
  const result = db.prepare('UPDATE mock_exams SET content_json = ?, revision = revision + 1, updated_at = ? WHERE user_id = ? AND id = ? AND revision = ?')
    .run(JSON.stringify(content), new Date().toISOString(), userId, id, expectedRevision);
  if (!result.changes) { const error = new Error('Exam changed; read it again before updating'); error.status = 409; throw error; }
  });
  return getMockExam(db, userId, id);
}
