// /api/v3 のクライアント。
import { apiRequest } from '../lib/api';
import type { DailyReport, Draft, DraftSummary, InboxCapture, MarketImport, MarketShare, MarketShareDetail, StudyPlan, Attempt, AttemptKind, AttemptListItem, Card, CardRating, Mistake, PracticeFilters, PracticeSet, PracticeSetKind, PracticeSetSummary, StudyOverview, CardTemplate, GroupInput, GroupStatus, GroupSummary, KnowledgeDetail, KnowledgeList, KnowledgeQuery, KnowledgeSummary, Language, QuestionGroup, QuestionModule, QuestionType, V3Settings, ValidationResult, Wordbook, V3SettingsPatch } from './types';

const query = (params: Record<string, string | number | undefined>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== '') search.set(key, String(value));
  const text = search.toString();
  return text ? `?${text}` : '';
};
const path = (code: string) => encodeURIComponent(code);

export function createV3Client(token: string) {
  const get = <T>(url: string) => apiRequest<T>(url, { token });
  const send = <T>(method: string, url: string, body?: unknown) => apiRequest<T>(url, { method, token, body });
  return {
    languages: () => get<{ languages: Language[] }>('/api/v3/languages').then((r) => r.languages),
    settings: () => get<{ settings: V3Settings }>('/api/v3/settings').then((r) => r.settings),
    updateSettings: (patch: V3SettingsPatch) => send<{ settings: V3Settings }>('PATCH', '/api/v3/settings', patch).then((r) => r.settings),
    cardTemplates: () => get<{ templates: CardTemplate[] }>('/api/v3/card-templates').then((r) => r.templates),
    wordbooks: () => get<{ wordbooks: Wordbook[] }>('/api/v3/wordbooks').then((r) => r.wordbooks),
    createWordbook: (title: string) => send<{ wordbook: Wordbook }>('POST', '/api/v3/wordbooks', { title }).then((r) => r.wordbook),
    renameWordbook: (code: string, title: string) => send<{ wordbook: Wordbook }>('PATCH', `/api/v3/wordbooks/${path(code)}`, { title }).then((r) => r.wordbook),
    deleteWordbook: (code: string) => send<{ deleted: string }>('DELETE', `/api/v3/wordbooks/${path(code)}`),
    knowledge: (q: KnowledgeQuery = {}) => get<KnowledgeList>(`/api/v3/knowledge${query(q)}`),
    knowledgePoint: (code: string, language?: string) => get<{ item: KnowledgeDetail }>(`/api/v3/knowledge/${path(code)}${query({ language })}`).then((r) => r.item),
    lookup: (q: string) => get<{ items: KnowledgeSummary[] }>(`/api/v3/knowledge/lookup${query({ q })}`).then((r) => r.items),
    createKnowledge: (input: Record<string, unknown>) => send<{ item: KnowledgeDetail }>('POST', '/api/v3/knowledge', input).then((r) => r.item),
    updateKnowledge: (code: string, patch: Record<string, unknown>) => send<{ item: KnowledgeDetail }>('PATCH', `/api/v3/knowledge/${path(code)}`, patch).then((r) => r.item),
    deleteKnowledge: (code: string) => send<{ deleted: string }>('DELETE', `/api/v3/knowledge/${path(code)}`),
    questionTypes: () => get<{ types: QuestionType[] }>('/api/v3/question-types').then((r) => r.types),
    questionGroups: (q: { module?: QuestionModule; typeId?: string; status?: GroupStatus; level?: string; knowledge?: string; q?: string; limit?: number; offset?: number } = {}) =>
      get<{ total: number; limit: number; offset: number; items: GroupSummary[] }>(`/api/v3/question-groups${query(q)}`),
    questionGroup: (code: string) => get<{ group: QuestionGroup }>(`/api/v3/question-groups/${path(code)}`).then((r) => r.group),
    validateGroup: (group: GroupInput) => send<ValidationResult>('POST', '/api/v3/questions/validate', group),
    createGroup: (group: GroupInput) => send<{ group: QuestionGroup }>('POST', '/api/v3/question-groups', group).then((r) => r.group),
    updateGroup: (code: string, group: GroupInput) => send<{ group: QuestionGroup }>('PUT', `/api/v3/question-groups/${path(code)}`, group).then((r) => r.group),
    deleteGroup: (code: string) => send<{ deleted: string }>('DELETE', `/api/v3/question-groups/${path(code)}`),
    setGroupStatus: (code: string, status: 'draft' | 'needs_review' | 'retired') => send<{ code: string; status: GroupStatus }>('POST', `/api/v3/question-groups/${path(code)}/status`, { status }),
    reportQuestion: (code: string, message: string) => send('POST', `/api/v3/questions/${path(code)}/report`, { message }),
    uploadMedia: (file: { base64: string; mime: string; fileName?: string }) => send<{ media: { id: number; kind: string; mime: string; size: number; url: string } }>('POST', '/api/v3/media', file).then((r) => r.media),
    startAttempt: (input: { practice?: string; questions?: string[]; filters?: PracticeFilters; kind?: AttemptKind; title?: string }) =>
      send<{ attempt: Attempt }>('POST', '/api/v3/attempts', input).then((r) => r.attempt),
    attempt: (code: string) => get<{ attempt: Attempt }>(`/api/v3/attempts/${path(code)}`).then((r) => r.attempt),
    activeAttempt: () => get<{ attempt: Attempt | null }>('/api/v3/attempts/active').then((r) => r.attempt),
    attempts: (q: { kind?: AttemptKind; practice?: string; completed?: boolean; limit?: number; offset?: number } = {}) =>
      get<{ total: number; items: AttemptListItem[] }>(`/api/v3/attempts${query({ ...q, completed: q.completed === undefined ? undefined : String(q.completed) })}`),
    submitAnswer: (attempt: string, answer: { question: string; selectedOptionId?: number; answerText?: string; recordingId?: number; eventId: string; startedAt?: string; elapsedMs?: number }) =>
      send<{ duplicate: boolean; attempt: string; summary: Attempt['summary']; item: Attempt['items'][number]; groups: Attempt['groups'] }>('POST', `/api/v3/attempts/${path(attempt)}/answers`, { ...answer, source: 'web' }),
    completeAttempt: (attempt: string) => send<{ attempt: Attempt }>('POST', `/api/v3/attempts/${path(attempt)}/complete`).then((r) => r.attempt),
    mistakes: (q: { module?: string; limit?: number; offset?: number } = {}) => get<{ total: number; items: Mistake[] }>(`/api/v3/mistakes${query(q)}`),
    practiceSets: (q: { kind?: PracticeSetKind; date?: string; limit?: number; offset?: number } = {}) => get<{ total: number; items: PracticeSetSummary[] }>(`/api/v3/practice-sets${query(q)}`),
    practiceSet: (code: string) => get<{ practice: PracticeSet }>(`/api/v3/practice-sets/${path(code)}`).then((r) => r.practice),
    deletePracticeSet: (code: string) => send<{ deleted: string }>('DELETE', `/api/v3/practice-sets/${path(code)}`),
    dueCards: (q: { kinds?: string; wordbook?: string; limit?: number; newLimit?: number } = {}) => get<{ due: number; new: number; cards: Card[] }>(`/api/v3/cards/due${query(q)}`),
    rateCard: (code: string, rating: CardRating, eventId: string) => send<{ duplicate: boolean; code: string; rating: CardRating; schedule: Card['schedule'] }>('POST', '/api/v3/cards/ratings', { code, rating, eventId, source: 'web' }),
    stats: (q: { days?: number; module?: string } = {}) => get<StudyOverview>(`/api/v3/stats${query(q)}`),
    inbox: (q: { status?: string; category?: string; limit?: number; cursor?: string } = {}) => get<{ total: number; items: InboxCapture[]; nextCursor: string | null }>(`/api/v3/inbox${query(q)}`),
    inboxCount: (q: { status?: string; category?: string } = {}) => get<{ total: number }>(`/api/v3/inbox/count${query(q)}`),
    setCaptureStatus: (code: string, status: InboxCapture['status']) => send<{ capture: InboxCapture }>('PATCH', `/api/v3/inbox/${path(code)}`, { status }).then((r) => r.capture),
    deleteCapture: (code: string) => send<{ deleted: string }>('DELETE', `/api/v3/inbox/${path(code)}`),
    drafts: (q: { status?: string } = {}) => get<{ drafts: DraftSummary[] }>(`/api/v3/drafts${query(q)}`).then((r) => r.drafts),
    draft: (code: string) => get<{ draft: Draft }>(`/api/v3/drafts/${path(code)}`).then((r) => r.draft),
    commentDraft: (code: string, body: string) => send<{ draft: Draft }>('POST', `/api/v3/drafts/${path(code)}/comments`, { body }).then((r) => r.draft),
    setDraftStatus: (code: string, status: Draft['status']) => send<{ draft: Draft }>('POST', `/api/v3/drafts/${path(code)}/status`, { status }).then((r) => r.draft),
    publishDraft: (code: string) => send<{ draft: string; practice: string }>('POST', `/api/v3/drafts/${path(code)}/publish`, {}),
    deleteDraft: (code: string) => send<{ deleted: string }>('DELETE', `/api/v3/drafts/${path(code)}`),
    plan: () => get<{ plan: StudyPlan }>('/api/v3/plan').then((r) => r.plan),
    savePlanProfile: (profile: Record<string, unknown>) => send<{ plan: StudyPlan }>('PUT', '/api/v3/plan/profile', profile).then((r) => r.plan),
    setTaskStatus: (code: string, status: StudyPlan['tasks'][number]['status']) => send('POST', `/api/v3/plan/tasks/${path(code)}`, { status }),
    reports: () => get<{ reports: Array<{ date: string; total: number; correct: number; accuracy: number | null }> }>('/api/v3/reports').then((r) => r.reports),
    report: (date: string) => get<{ report: DailyReport }>(`/api/v3/reports/${date}`).then((r) => r.report),
    marketShares: (mine = false) => get<{ shares: MarketShare[] }>(`/api/v3/market${mine ? '?mine=1' : ''}`).then((r) => r.shares),
    marketShare: (id: string) => get<{ share: MarketShareDetail }>(`/api/v3/market/${path(id)}`).then((r) => r.share),
    marketSources: () => get<{ wordbooks: Array<{ kind: 'wordbook'; source: string; title: string; count: number }>; practices: Array<{ kind: 'practice'; source: string; title: string; count: number }> }>('/api/v3/market/sources'),
    publishShare: (input: { kind: 'wordbook' | 'practice'; source: string; title?: string; description?: string }) => send<{ share: MarketShareDetail }>('POST', '/api/v3/market', input).then((r) => r.share),
    withdrawShare: (id: string) => send('DELETE', `/api/v3/market/${path(id)}`),
    importShare: (id: string) => send<MarketImport>('POST', `/api/v3/market/${path(id)}/import`, {}),
    uploadRecording: (input: { question?: string; audioBase64: string; mime: string }) => send<{ recording: { code: string; id: number } }>('POST', '/api/v3/recordings', input).then((r) => r.recording),
    media: async (id: number) => {
      const response = await fetch(`/api/v3/media/${id}`, { headers: { authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error(`media ${id}: ${response.status}`);
      return response.blob();
    },
  };
}
export type V3Client = ReturnType<typeof createV3Client>;
