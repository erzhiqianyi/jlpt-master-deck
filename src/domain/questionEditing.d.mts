// questionEditing.mjs の型。
import type { GroupInput, GroupMaterial, GroupQuestion, JlptLevel, QuestionGroup, QuestionMark, QuestionType } from '../v3/types';

export type QuestionForm = Omit<GroupInput, 'questions' | 'materials' | 'level'> & { level: JlptLevel | null; instruction: string; context: string; sourceReference: string; materials: GroupMaterial[]; questions: GroupQuestion[] };
export const MATERIAL_SLOTS: Record<QuestionType['materialKinds'], Array<{ role: GroupMaterial['role']; kind: NonNullable<GroupMaterial['kind']> }>>;
export function emptyQuestion(type: QuestionType): GroupQuestion;
export function emptyGroup(type: QuestionType): QuestionForm;
export function detectStarSlots(prompt: string | null | undefined): QuestionMark[];
export function detectBlank(prompt: string | null | undefined): QuestionMark[];
export function markTarget(prompt: string | null | undefined, target: string | null | undefined, kind?: QuestionMark['kind']): QuestionMark[];
export function passageBlank(body: string | null | undefined, number: number, role?: string): QuestionMark[];
export function markText(question: Pick<GroupQuestion, 'prompt'>, mark: QuestionMark, materials?: GroupMaterial[]): string;
export function autoMarks(type: QuestionType, question: GroupQuestion, options?: { target?: string; index?: number; materials?: GroupMaterial[] }): QuestionMark[];
export function groupToForm(group: QuestionGroup): QuestionForm;
export function formToInput(form: QuestionForm, options?: { originalMaterials?: GroupMaterial[] }): GroupInput;
