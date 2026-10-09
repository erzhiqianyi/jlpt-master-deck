// v3 API の型（server/v3/repo/* の返り値と同じ形）。
export type KnowledgeKind = 'word' | 'grammar' | 'name';
export type JlptLevel = 'N5' | 'N4' | 'N3' | 'N2' | 'N1';
export type PartOfSpeech = 'verb_1' | 'verb_2' | 'verb_3_suru' | 'verb_3_kuru' | 'i_adjective' | 'na_adjective' | 'noun' | 'adverb' | 'conjunction'
  | 'adnominal' | 'interjection' | 'prefix' | 'suffix' | 'phrase' | 'idiom';
export type ReviewState = 'new' | 'learning' | 'review' | 'mastered';
/** 言語別の文字。isFallback は要求した言語がなく別の言語で代用したとき。 */
export type PickedText = { text: string; language: string; isFallback?: boolean };
export type LevelRange = { min: JlptLevel; max: JlptLevel };

export type WordbookStats = { total: number; words: number; grammar: number; names: number; due: number; new: number; mastered: number };
export type Wordbook = { code: string; title: string; createdAt: string; updatedAt: string; stats: WordbookStats };

export type KnowledgeSummary = {
  code: string; kind: KnowledgeKind; wordbook: string; expression: string; reading: string | null; romaji: string | null; pos: PartOfSpeech | null;
  jlptLevel: LevelRange | null; meaning: PickedText | null; tags: string[]; review: { status: ReviewState; dueAt: string | null };
  capturedAt: string | null; updatedAt: string;
};
export type KnowledgeList = { total: number; limit: number; offset: number; language: string; items: KnowledgeSummary[] };

export type Conjugation = { form: string; label: string; written: string; reading: string | null; exception: boolean; step: PickedText | null };
export type KnowledgeDetail = {
  code: string; kind: KnowledgeKind; wordbook: string; language: string;
  expression: string; reading: string | null; romaji: string | null; pos: PartOfSpeech | null; transitivity: 'transitive' | 'intransitive' | 'both' | null;
  isSuruNoun: boolean; baseForm: string | null; jlptLevel: LevelRange | null; register: 'written' | 'spoken' | 'formal' | 'both' | null; paraphrase: string | null;
  meaning: PickedText | null; meaningJa: string | null; explanation: PickedText | null;
  examples: Array<{ sentence: string; reading: string | null; spokenSentence: string | null; targetReading: string | null;
    translation: PickedText | null; spokenTranslation: PickedText | null; analysis: PickedText | null; formAnalysis: PickedText | null }>;
  memoryPoints: PickedText[];
  patterns: Array<{ pattern: string; example: string | null; connection: PickedText | null; meaning: PickedText | null; exampleTranslation: PickedText | null }>;
  notes: Array<{ kind: 'register' | 'exam_tip' | 'key_point' | 'other'; title: PickedText | null; body: PickedText | null }>;
  comparisons: Array<{ target: string; kind: 'synonym' | 'everyday'; difference: PickedText | null }>;
  alternateForms: string[]; relatedWords: string[]; sources: Array<{ title: string; url: string | null }>; tags: string[];
  questionKinds: string[]; distractors: Record<string, string[]>;
  memoryImage: { language: string; isFallback: boolean; concept: string | null; prompt: string | null; status: string; media: number | null; url: string | null; caption: string | null } | null;
  conjugations: Conjugation[];
  questions: Array<{ code: string; typeId: string; status: string; relation: string }>;
  sourceSentence: string | null; compileNote: string | null;
  review: { status: ReviewState; reviewCount?: number; ease?: number; intervalDays?: number; dueAt?: string | null; firstSeenAt?: string | null; lastReviewedAt?: string | null };
  capturedAt: string | null; createdAt: string; updatedAt: string;
};

export type KnowledgeQuery = { wordbook?: string; kind?: string; level?: JlptLevel; tag?: string; status?: ReviewState | 'due'; q?: string;
  limit?: number; offset?: number; sort?: 'recent' | 'code' | 'expression' | 'due' };

export type CardTemplateField = { field: string; maxItems: number | null; withTranslation: boolean };
export type CardTemplate = { code: string; kind: KnowledgeKind; isDefault: boolean; name: PickedText | null; description: PickedText | null; front: CardTemplateField[]; back: CardTemplateField[] };
export type Language = { code: string; nativeName: string; fallback: string | null };

export type V3Settings = {
  uiLanguage: 'zh-CN' | 'ja' | 'en'; explanationLanguage: string; fontScale: number; feedbackMode: 'immediate' | 'batch'; practiceNavigation: 'auto' | 'manual';
  autoAdvanceSeconds: number; showReviewRuby: boolean; showExplanationRuby: boolean; showRomaji: boolean; cardWordSpacing: boolean; segmentedDisplay: boolean;
  dailySource: { answers: boolean; cardReviews: boolean; window: string | null; hours: number | null; timeZone: string | null; runAt: string | null; ratings: string[] };
  questionKinds: string[]; posStyles: Record<string, { mode: 'none' | 'underline' | 'text'; color: string }>; questionTypeTips: Record<string, string>;
  customTips: Array<{ id: number; section: string; title: string; description: string | null; tip: string; createdAt: string; updatedAt: string }>;
  speech: { provider: string; rate: number; cardAuto: 'off' | 'front' | 'back'; grammarAuto: boolean; includeExample: boolean; voices: Record<string, { voice: string; style: string | null; role: string | null }> };
  cardTemplates: Record<KnowledgeKind, string | null>;
};
/** 設定の部分更新（入れ子の dailySource・speech・cardTemplates も渡した項目だけ変わる）。 */
export type V3SettingsPatch = Partial<Omit<V3Settings, 'dailySource' | 'speech' | 'cardTemplates'>> & {
  dailySource?: Partial<V3Settings['dailySource']>; speech?: Partial<V3Settings['speech']>; cardTemplates?: Partial<V3Settings['cardTemplates']>;
};
/** 文字の大きさ（表示上の 3 段階）と fontScale の対応。 */
export const FONT_SCALES = { small: 0.9, standard: 1, large: 1.2 } as const;
export const fontSizeOf = (scale: number): keyof typeof FONT_SCALES => (scale < 0.95 ? 'small' : scale >= 1.15 ? 'large' : 'standard');

// ---------- 题库 ----------
export type QuestionModule = 'vocabulary' | 'grammar' | 'reading' | 'listening';
export type GroupStatus = 'draft' | 'needs_review' | 'needs_revision' | 'ready' | 'retired';
export type RuleRequirement = 'required' | 'optional' | 'forbidden' | 'warn';
export type QuestionType = {
  typeId: string; module: QuestionModule; labelJa: string; official: boolean;
  targetMarking: 'underline' | 'blank' | 'star' | 'passage_blank' | 'none'; optionMedia: 'text' | 'text_or_image' | 'audio' | 'mixed' | 'none';
  materialKinds: 'none' | 'passage' | 'passage_pair' | 'notice' | 'audio' | 'audio_image'; drawWholeGroup: boolean; answerMode: 'choice' | 'text_input' | 'recording' | 'none';
  levels: JlptLevel[]; rules: Record<string, { requirement: RuleRequirement; value: number | null }>; task: PickedText | null; tip: PickedText | null;
};
export type MaterialRole = 'main' | 'passage_a' | 'passage_b' | 'notice' | 'scene_image' | 'audio';
export type TextValue = string | PickedText | null;
export type GroupMaterial = {
  role: MaterialRole; material?: string; kind?: 'passage' | 'notice' | 'image' | 'audio'; body?: string | null; transcript?: string | null; mediaId?: number | null; mediaUrl?: string | null;
  clipStartMs?: number | null; clipEndMs?: number | null; title?: TextValue; bodyTranslation?: TextValue; summary?: TextValue; structure?: TextValue; transcriptTranslation?: TextValue;
  sentences?: Array<{ sentence: string; isKey?: boolean; translation?: TextValue }>;
};
export type QuestionMark = { kind: 'target' | 'blank' | 'slot' | 'star_slot'; start: number; end: number; label?: string | null; material?: string | null };
export type QuestionOption = { id?: number | null; position?: number; text?: string | null; mediaId?: number | null; correct?: boolean; distractorType?: string | null; analysis?: TextValue; translation?: TextValue };
export type ExplanationSection = { kind: 'basis' | 'step' | 'full_answer' | 'tip' | 'objective'; title?: TextValue; body: TextValue };
export type Evidence = { option?: number | null; material?: string | null; source: 'prompt' | 'body' | 'transcript'; start?: number | null; end?: number | null; quote: string };
export type GroupQuestion = {
  code?: string; position?: number; prompt?: string | null; promptMediaId?: number | null; expectedText?: string | null; translation?: TextValue;
  marks: QuestionMark[]; options: QuestionOption[]; explanation: ExplanationSection[]; evidence: Evidence[]; tags: string[];
  knowledge: Array<{ code: string; relation?: 'target' | 'prerequisite' | 'contrast'; expression?: string }>;
};
export type ReviewFinding = { id: number; reviewer: 'system' | 'ai' | 'user'; question: string | null; optionId: number | null; check: string; severity: 'error' | 'warning' | 'info'; message: PickedText | null };
export type QuestionGroup = {
  code: string; typeId: string; module: QuestionModule; status: GroupStatus; level: JlptLevel | null; official: boolean; shuffleOptions: boolean;
  instruction: string | null; instructionTranslation: TextValue; context: string | null; contextTranslation: TextValue; sourceReference: string | null; language: string;
  materials: GroupMaterial[]; questions: GroupQuestion[];
  review: { latest: { reviewer: string; verdict: 'pass' | 'revise' | 'reject'; agentLabel: string | null; summary: PickedText | null; createdAt: string } | null; openFindings: ReviewFinding[] };
  createdAt: string; updatedAt: string; warnings?: ValidationIssue[];
};
export type GroupInput = Omit<Partial<QuestionGroup>, 'code' | 'module' | 'status' | 'review' | 'createdAt' | 'updatedAt' | 'questions'> & { typeId: string; status?: 'draft' | 'needs_review'; questions: GroupQuestion[] };
export type GroupSummary = {
  code: string; typeId: string; module: QuestionModule; labelJa: string; status: GroupStatus; level: JlptLevel | null; official: boolean; updatedAt: string;
  materials: Array<{ material: string; kind: string; role: MaterialRole }>; questions: Array<{ code: string; prompt: string | null; options: number }>;
};
export type ValidationIssue = { path: string; code: string; message: string };
export type ValidationResult = { ok: boolean; errors: ValidationIssue[]; warnings: ValidationIssue[] };

// ---------- 练习 ----------
export type PracticeGroup = {
  code: string; typeId: string; module: QuestionModule; answerMode: QuestionType['answerMode']; level: JlptLevel | null; instruction: string | null; context: string | null; shuffleOptions: boolean;
  instructionTranslation: TextValue; contextTranslation: TextValue; questionCount: number;
  materials: Array<GroupMaterial & { title?: TextValue }>;
};
export type PracticeQuestion = {
  code: string; group: string; position: number; prompt: string | null; promptMediaId: number | null; marks: QuestionMark[];
  options: Array<{ id: number; text: string | null; mediaId: number | null }>; knowledge: Array<{ code: string; expression?: string }>;
};
export type PracticeResult = {
  correctOptionId: number | null; correctText: string | null; expectedText: string | null; translation: TextValue; explanation: ExplanationSection[]; evidence: Evidence[];
  options: Array<{ id: number; correct: boolean; analysis: TextValue; translation: TextValue; distractorType: string | null }>;
};
export type PracticeAnswer = { selectedOptionId: number | null; selectedText: string | null; correct: boolean | null; answerText: string | null; recordingId: number | null;
  startedAt: string | null; answeredAt: string | null; elapsedMs: number | null };
export type AttemptItem = { position: number; status: 'answered' | 'presented' | 'missing_original'; question: PracticeQuestion | null; result: PracticeResult | null; answer: PracticeAnswer | null };
export type AttemptKind = 'daily' | 'vocabulary' | 'grammar' | 'reading' | 'listening' | 'mixed' | 'mock';
export type AttemptSummary = { total: number; answered: number; scored: number; correct: number; elapsedMs?: number };
export type Attempt = {
  code: string; kind: AttemptKind; practice: string | null; active: boolean; startedAt: string; completedAt: string | null; title: PickedText | null; analysisStatus: string; language: string;
  summary: AttemptSummary; groups: Record<string, PracticeGroup>; items: AttemptItem[];
};
export type AttemptListItem = { code: string; kind: AttemptKind; practice: string | null; active: boolean; startedAt: string; completedAt: string | null; title: PickedText | null; summary: AttemptSummary };
export type PracticeFilters = { module?: QuestionModule; typeIds?: string[]; level?: JlptLevel; wordbook?: string; knowledge?: string[]; onlyDue?: boolean; statuses?: ReviewState[]; excludeAnsweredCorrectly?: boolean; count?: number };
export type PracticeSetKind = 'daily' | 'topic' | 'mixed' | 'mock';
export type PracticeSetSummary = { code: string; kind: PracticeSetKind; date: string | null; version: number; minutes: number | null; level: JlptLevel | null; questionCount: number; completedCount: number; title: PickedText | null; createdAt: string };
export type PracticeSetEntry = { position: number; question: string; group: string; typeId: string; groupStatus: GroupStatus };
export type PracticeSet = {
  code: string; kind: PracticeSetKind; date: string | null; version: number; minutes: number | null; strategy: string | null; level: JlptLevel | null;
  title: PickedText | null; description: PickedText | null; disclaimer: PickedText | null; sourceSummary: PickedText | null;
  sections: Array<{ position: number; instruction: string | null; scheduledDate: string | null; durationMinutes: number | null; title: PickedText | null; description: PickedText | null; entries: PracticeSetEntry[] }>;
  entries: PracticeSetEntry[]; attempts: Array<{ code: string; startedAt: string; completedAt: string | null }>;
};
export type Mistake = { question: string; group: string; typeId: string; module: QuestionModule; prompt: string | null; selectedText: string | null; correctText: string | null; answeredAt: string };

// ---------- 卡片、统计 ----------
export type CardItem = { text?: string; lang?: string; language?: string; isFallback?: boolean; translation?: string; title?: string; mediaId?: number | null; url?: string | null; caption?: string | null };
export type Card = { code: string; kind: KnowledgeKind; template: string | null; language: string; front: Array<{ field: string; items: CardItem[] }>; back: Array<{ field: string; items: CardItem[] }>;
  schedule: KnowledgeDetail['review'] };
export type CardRating = 'forgot' | 'hard' | 'remembered' | 'easy';
export type StudyOverview = {
  timeZone: string; today: string;
  totals: { answered: number; scored: number; correct: number; accuracy: number | null; ratings: number };
  byType: Array<{ typeId: string; module: QuestionModule; labelJa: string; answered: number; scored: number; correct: number; accuracy: number | null; elapsedMs: number }>;
  daily: Array<{ date: string; answered: number; correct: number; ratings: number }>; todayActivity: { date: string; answered: number; correct: number; ratings: number };
  streak: number; knowledge: { total: number; new: number; learning: number; review: number; mastered: number; due: number };
};

// ---------- 收集箱、草稿、计划、日报、市场 ----------
export type InboxCapture = { code: string; body: string; category: 'word' | 'grammar' | 'sentence' | 'listening' | 'reading' | 'unsure'; context: string | null; wordbook: string | null; status: 'inbox' | 'processed' | 'archived'; createdAt: string; updatedAt: string };
export type DraftQuestionRef = { question: string; group: string; typeId: string; groupStatus: GroupStatus; prompt: string | null };
export type DraftSummary = { code: string; status: 'draft' | 'needs_revision' | 'approved' | 'archived'; kind: string | null; date: string | null; questionCount: number; commentCount: number; title: PickedText | null; createdAt: string; updatedAt: string };
export type Draft = Omit<DraftSummary, 'questionCount' | 'commentCount'> & {
  strategy: string | null; targetLevel: JlptLevel | null; minutes: number | null; language: string;
  description: PickedText | null; nextStep: PickedText | null; objectives: PickedText[];
  sections: Array<{ position: number; instruction: string | null; title: PickedText | null; body: PickedText | null; questions: DraftQuestionRef[] }>;
  quiz: DraftQuestionRef[]; generated: DraftQuestionRef[]; comments: Array<{ code: string; body: string; createdAt: string }>; published: string[];
};
export type PlanModule = 'vocabulary' | 'grammar' | 'reading' | 'listening' | 'other';
export type StudyPlan = {
  status: 'none' | 'profile_only' | 'ready' | 'needs_refresh'; generatedAt?: string | null; updatedAt?: string;
  profile: null | { examName: string | null; level: JlptLevel | null; startDate: string | null; examDate: string | null; studyDaysPerWeek: number | null; dailyMinutes: number | null;
    materialStartStatus: string | null; fixedSchedule: PickedText | null; supplementalNeeds: PickedText | null;
    materials: Array<{ id: number; position: number; module: PlanModule; title: PickedText | null; currentPosition: PickedText | null }> };
  strategy: null | { phaseStrategy: PickedText | null; postMaterialStrategy: PickedText | null; goal: PickedText | null };
  phases: Array<{ position: number; startDate: string; endDate: string; focus: PickedText | null; goal: PickedText | null; points: PickedText[] }>;
  tasks: Array<{ code: string; date: string; module: PlanModule; minutes: number | null; material: number | null; status: 'pending' | 'completed' | 'skipped' | 'missed'; completedAt: string | null; title: PickedText | null; detail: PickedText | null; sourceLabel: PickedText | null }>;
};
export type DailyReport = {
  date: string; timeZone: string; generatedAt: string | null; totals: { total: number; correct: number; incorrect: number; accuracy: number | null; uniqueItems: number | null };
  summary: PickedText | null; byType: Array<{ typeId: string; total: number; correct: number; incorrect: number; accuracy: number | null }>;
  strengths: Array<{ label: PickedText | null; detail: PickedText | null }>; weaknesses: Array<{ label: PickedText | null; detail: PickedText | null }>;
  confusions: Array<{ topic: PickedText | null; knowledge: Array<{ code: string; expression: string }>; questions: string[] }>;
  recommendations: Array<{ type: string; title: PickedText | null; detail: PickedText | null }>;
  wrongAnswers: Array<{ question: string | null; prompt: string | null; knowledge: string | null; selected: string | null; correctAnswer: string | null }>;
};
export type MarketShare = { id: string; kind: 'wordbook' | 'practice'; title: string; description: string; knowledgeCount: number; groupCount: number; questionCount: number; mine: boolean; withdrawn: boolean; createdAt: string };
export type MarketPackage = { format: 'jlpt-share'; version: 2; kind: 'wordbook' | 'practice'; title: string; description: string; language: string;
  knowledge: Array<{ kind: KnowledgeKind; expression: string; reading?: string; meaning?: string }>; groups: Array<{ typeId: string; questions: Array<{ prompt?: string; options: Array<{ text?: string; correct?: boolean }> }> }> };
export type MarketShareDetail = MarketShare & { revisions: Array<{ revision: number; createdAt: string }>; package: MarketPackage };
export type MarketImport = { wordbook: string | null; knowledge: string[]; groups: string[]; practice: string | null; skipped: Array<{ index: number; typeId: string }>; needsRevision?: string[]; alreadyImported: boolean };
