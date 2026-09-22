export type Deck = 'n1_vocab' | 'name_reading' | 'grammar_expression';
export type QuestionKind = 'grammar' | 'moji_goi' | 'meaning' | 'kana_to_kanji' | 'kanji_to_kana';
export type Locale = 'zh-CN' | 'ja' | 'en';
export type AppView = 'market' | 'capture' | 'captures' | 'home' | 'memory-review' | 'history' | 'mistakes' | 'memory' | 'data' | 'mcp' | 'insights' | 'plan' | 'question-types' | 'vocabulary' | 'grammar' | 'listening' | 'reading' | 'mixed' | 'daily-practice' | 'mock-exams' | 'news-cycle' | 'drafts' | 'about' | 'profile' | 'settings';
export type StudyPage = 'tips' | 'questions' | 'words' | 'wordbooks' | 'review' | 'samples' | 'mock';
export type AppRoute = { view: AppView; page: StudyPage; itemId?: string };
export type AnswerRecord = { selected: string; correct: boolean; startedAt?: string; answeredAt?: string; elapsedMs?: number; attemptId?: string };
export type AnswerState = Record<string, AnswerRecord>;
export type ReviewStatus = 'new' | 'learning' | 'review' | 'mastered';

export type SearchResult = {
  item?: VocabItem;
  id: string;
  view: 'vocabulary' | 'grammar' | 'listening' | 'reading';
  title: string;
  subtitle: string;
  moduleLabel: string;
  matches: string[];
  score: number;
};

export type ProgressEntry = {
  correct: number;
  wrong: number;
  status: ReviewStatus;
  firstSeenAt?: string;
  lastReviewedAt?: string;
  reviewCount?: number;
  ease?: number;
  intervalDays?: number;
  nextReviewAt?: string;
  lastPracticeSessionId?: string;
};

export type ProgressState = Record<string, ProgressEntry>;
export type FeedbackMode = 'immediate' | 'batch';
export type FontSize = 'small' | 'standard' | 'large';
export type QuestionTypeSection = 'vocabulary' | 'grammar' | 'reading' | 'listening';

export type CustomQuestionTypeTip = {
  id: string;
  section: QuestionTypeSection;
  title: string;
  description: string;
  tip: string;
  createdAt: string;
  updatedAt: string;
};

export type AttemptAnswer = {
  questionId: string;
  itemId: string;
  kind: QuestionKind;
  selected: string;
  correct: boolean;
  startedAt?: string;
  answeredAt: string;
  elapsedMs: number;
};

export type PracticeAttempt = {
  id: string;
  title?: string;
  practiceId?: string;
  startedAt: string;
  completedAt?: string;
  analysisStatus?: 'idle' | 'processing' | 'completed';
  analysisStartedAt?: string;
  analysisCompletedAt?: string;
  view: AppView;
  deck: Deck | 'all';
  questionIds: string[];
  answers: AttemptAnswer[];
  summary?: {
    total: number;
    correct: number;
    wrong: number;
    accuracy: number;
    elapsedMs: number;
  };
};

export type DisplaySettings = {
  showReviewRuby: boolean;
  showExplanationRuby: boolean;
  locale: Locale;
  fontSize: FontSize;
  memoryCardFrontFields: import('./domain/memoryCards').MemoryCardField[];
  memoryCardBackFields: import('./domain/memoryCards').MemoryCardField[];
  feedbackMode: FeedbackMode;
  questionTypeTips: Record<string, string>;
  customQuestionTypeTips: CustomQuestionTypeTip[];
};

export type AuthUser = { id: number; username: string };

export type StudyState = {
  answers: AnswerState;
  progress: ProgressState;
  settings: DisplaySettings;
  attemptHistory: PracticeAttempt[];
  activeAttempt: PracticeAttempt | null;
};

export type DraftSummary = { reference?: string; id: string; title: string; status: string; created_at: string; updated_at: string };
export type DraftAnnotation = { id: string; body: string; created_at: string };
export type ReviewPackDraft = DraftSummary & { content: unknown; annotations: DraftAnnotation[] };
export type DailyPracticeSummary = {
  reference?: string;
  id: string;
  date: string;
  version: number;
  title: string;
  minutes: number;
  strategy: string;
  questionCount: number;
  summary?: string;
  created_at: string;
  updated_at: string;
};
export type DailyPractice = DailyPracticeSummary & {
  description?: string;
  sourceDraftId?: string;
  generated_at: string;
  diagnosis?: unknown;
  practice_plan?: Array<{ minutes: number; task: string }>;
  questions: Question[];
};

export type Wordbook = {
  reference?: string;
  id: string;
  title: string;
  deck: Deck;
  builtIn: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type LearningCaptureCategory = 'word' | 'grammar' | 'sentence' | 'listening' | 'reading' | 'unsure';
export type LearningCaptureStatus = 'inbox' | 'processed' | 'archived';
export type LearningCapture = {
  reference?: string;
  id: string;
  body: string;
  category: LearningCaptureCategory;
  context: string;
  targetDeck?: Deck;
  targetWordbookId?: string;
  targetWordbookTitle?: string;
  status: LearningCaptureStatus;
  createdAt: string;
  updatedAt: string;
};

export type ListeningQuestion = {
  reference?: string;
  id: string;
  audioAssetId?: string;
  audioReference?: string;
  libraryNumber?: number;
  title: string;
  questionTypeId: string;
  question: string;
  choices: string[];
  answerIndex: number;
  explanation: string;
  audioFileName: string;
  audioMime: string;
  audioSize: number;
  createdAt: string;
};

export type ListeningQuestionInput = Omit<ListeningQuestion, 'id' | 'audioSize' | 'createdAt'> & { audioBase64: string; existingQuestionId?: string };

export type ListeningRecordingStatus = 'pending' | 'analyzing' | 'completed' | 'failed';

export type ListeningRecordingAnalysis = {
  summary: string;
  transcript?: string;
  referenceTranscript?: string;
  strengths: string[];
  improvements: string[];
  nextPractice: string;
};

export type ListeningRecording = {
  reference?: string;
  id: string;
  listeningQuestionId: string;
  audioMime: string;
  audioSize: number;
  status: ListeningRecordingStatus;
  analysis?: ListeningRecordingAnalysis;
  createdAt: string;
  updatedAt: string;
};

export type ReadingQuestion = {
  reference?: string;
  id: string;
  title: string;
  passage: string;
  question: string;
  choices: string[];
  answerIndex: number;
  explanation: string;
  tags: string[];
  explanationNodes?: { title: string; body: string }[];
  translationLines?: { ja: string; zh: string }[];
  passageTranslation?: string;
  choiceExplanations?: { text: string; translation: string; analysis: string; evidence: string; errorType: string }[];
  readingAnalysis?: { summary: string; structure: string; keySentences: string[] };
  createdAt: string;
};

export type ReadingQuestionInput = Omit<ReadingQuestion, 'id' | 'createdAt'>;

export type MockExamSection = {
  id: string;
  title: string;
  durationMinutes: number;
  questionCount: number;
  groups: string[];
};

export type MockExamQuestion = {
  id: string;
  sectionId: string;
  group: string;
  prompt: string;
  passage?: string;
  choices: string[];
  answerIndex: number;
  explanation: string;
  audioUrl?: string;
  transcript?: string;
};

export type LocalMockExam = {
  id: string;
  level: string;
  title: string;
  titleJa: string;
  description: string;
  content_origin: 'ai_generated';
  verification_status: 'unverified';
  level_confidence: 'medium';
  generated_at: string;
  disclaimer: string;
  totalDurationMinutes: number;
  sections: MockExamSection[];
  questions: MockExamQuestion[];
};

export type LocalMockExamSummary = Omit<LocalMockExam, 'generated_at' | 'disclaimer' | 'sections' | 'questions'> & {
  questionCount: number;
  audioCount: number;
};

export type LocalMockExamManifest = {
  generated_at: string;
  content_origin: 'ai_generated';
  verification_status: 'unverified';
  level_confidence: 'medium';
  exams: LocalMockExamSummary[];
};

export type NewsCycleModule = 'vocabulary' | 'grammar' | 'listening' | 'reading';
export type NewsCycleQuestion = {
  formalQuestionId?: string;
  quality_review?: {
    status: 'needs_review' | 'approved' | 'rejected';
    checks: Record<string, 'pending' | 'pass' | 'fail' | 'not_applicable'>;
    machine_issues: string[];
    reviewer?: string | null;
    reviewed_at?: string | null;
    notes_zh?: string;
  };
  scoring_ready?: boolean;
  review_note_zh?: string;
  id: string;
  date: string;
  level: string;
  module: NewsCycleModule;
  official_type: string;
  source_id: string;
  source_url: string;
  verification_status: string;
  prompt: string;
  question?: string;
  passage?: string;
  target?: string;
  choices: string[];
  answerIndex: number;
  explanation_zh: string;
  source_rewrite?: boolean;
  composition_note?: string;
  audio?: {
    duration?: string | null;
    timecode?: string | null;
    fileName?: string | null;
    previewUrl?: string;
    import_ready?: boolean;
  };
};
export type NewsCycleDay = {
  date: string;
  questionCount: number;
  audioCount: number;
  sourceCount: number;
  moduleCounts: Record<NewsCycleModule, number>;
  questions: NewsCycleQuestion[];
};
export type NewsCycleData = {
  id?: string;
  summary?: {
    range?: { from: string; to: string };
    total_questions?: number;
    modules?: Partial<Record<NewsCycleModule, number>>;
    direct_audio_question_count?: number;
    needs_audio_review_count?: number;
    status?: string;
  };
  days: NewsCycleDay[];
};
export type NewsCycleSummary = {
  id: string;
  range?: { from: string; to: string };
  generatedAt?: string;
  totalQuestions: number;
  moduleCounts: Record<NewsCycleModule, number>;
  audioCount: number;
  needsAudioReviewCount: number;
  formalQuestionCount: number;
  formalPracticeQuestionIds: string[];
  status: string;
};
export type NewsCycleCatalogData = {
  cycles: NewsCycleSummary[];
};

export type StudyPlanModule = 'grammar' | 'reading' | 'listening' | 'vocabulary' | 'other';
export type StudyPlanMaterial = {
  id: string;
  title: string;
  module: StudyPlanModule;
  currentPosition?: string;
};
export type StudyPlanProfile = {
  level: 'N1' | 'N2' | 'N3' | 'N4' | 'N5';
  startDate: string;
  examDate: string;
  studyDaysPerWeek: number;
  dailyMinutes: number;
  materials: StudyPlanMaterial[];
  materialStartStatus?: 'not_started' | 'in_progress' | 'reviewing';
  fixedSchedule?: string;
  supplementalNeeds?: string;
  phaseStrategy?: string;
  postMaterialStrategy?: string;
  goal?: string;
};
export type StudyPlanTaskStatus = 'pending' | 'completed' | 'skipped' | 'missed';
export type StudyPlanTask = {
  id: string;
  date: string;
  title: string;
  module: StudyPlanModule;
  minutes: number;
  detail?: string;
  sourceLabel?: string;
  materialId?: string;
  workloadKind?: 'standard' | 'full_mock';
  status: StudyPlanTaskStatus;
  completedAt?: string;
};
export type StudyDailySummary = {
  date: string;
  attempted: number;
  correct: number;
  accuracy: number | null;
  practiceMinutes: number;
  plannedTasks: number;
  completedTasks: number;
  plannedMinutes: number;
  completedMinutes: number;
  note: string;
};
export type StudyPlanDayEvidence = {
  date: string;
  drafts: number;
  confirmedDrafts: number;
  captures: number;
  processedCaptures: number;
  practiceAttempts: number;
  practiceQuestions: number;
  mediaDrafts: number;
  readingDrafts: number;
};
export type StudyPlanPhase = {
  id: string;
  startDate: string;
  endDate: string;
  focus: string;
  points: string[];
  goal?: string;
};
export type StudyPlanDocument = {
  profile: StudyPlanProfile;
  status: 'profile_only' | 'ready' | 'needs_refresh';
  tasks: StudyPlanTask[];
  phases: StudyPlanPhase[];
  dailySummaries: StudyDailySummary[];
  generatedAt?: string;
  updatedAt?: string;
};
export type RubyTerm = { text: string; reading: string };

export type LocalizedText = {
  meaning?: string;
  core_memory?: string;
  analysis?: string;
};

export type PracticeQuestionSeed = {
  id?: string;
  kind?: string;
  instruction?: string;
  prompt?: string;
  choices?: string[];
  answer?: string;
  translation_zh?: string;
  explanation_zh?: string;
  tested_expression?: string;
  form_analysis_zh?: string;
  distractor_notes?: Record<string, string>;
};

export type ConjugationForm = {
  kind: 'dictionary' | 'polite' | 'negative' | 'past' | 'te' | 'conditional' | 'potential' | 'passive' | 'causative' | 'adverbial' | string;
  form: string;
};

export type InflectionClass = 'godan' | 'ichidan' | 'suru' | 'kuru' | 'i_adjective' | 'na_adjective';
export type UsageRegister = 'written' | 'spoken' | 'both' | 'formal';

export type VocabItem = {
  reference?: string;
  id: string;
  date: string;
  input_at?: string;
  /** The single wordbook this entry is filed in; falls back to the built-in wordbook of its deck. */
  wordbook_id?: string;
  deck: Deck;
  type: string;
  jlpt_level?: string;
  original: string;
  reading?: string;
  meaning_ja?: string;
  paraphrase_ja?: string;
  formation?: string;
  usage_notes?: string;
  meaning_zh: string;
  core_memory: string;
  part_of_speech?: string;
  inflection_class?: InflectionClass;
  base_form?: string;
  conjugations?: ConjugationForm[];
  collocations?: string[];
  examples?: { ja: string; zh: string; spoken_ja?: string; spoken_zh?: string; analysis_zh?: string; form_analysis_zh?: string }[];
  comparisons?: { target: string; difference_zh: string }[];
  analysis?: string;
  explanation_zh?: string;
  localizations?: Partial<Record<Locale | string, LocalizedText>>;
  ruby_terms?: RubyTerm[];
  tags?: string[];
  content_origin?: 'user_provided' | 'ai_generated';
  verification_status?: 'unverified' | 'needs_review' | 'verified';
  level_confidence?: 'low' | 'medium' | 'high';
  question_kinds?: QuestionKind[];
  question_distractors?: Partial<Record<QuestionKind, string[]>>;
  source_original_sentence?: string;
  source_grammar_point?: string;
  grammar_point?: string;
  grammar_forms?: { form?: string; example?: string; meaning_zh?: string; connection_zh?: string }[];
  grammar_features?: { feature?: string; detail_zh?: string }[];
  usage_register?: UsageRegister;
  usage_register_zh?: string;
  exam_register_zh?: string;
  everyday_alternatives?: { ja?: string; zh?: string }[];
  comparison_notes?: { target?: string; difference_zh?: string }[];
  notes?: string[];
  source_chat_summary?: string;
  practice_questions?: PracticeQuestionSeed[];
};

export type ReviewData = {
  generated_at: string;
  items: VocabItem[];
};

export type Question = {
  reference?: string;
  practiceReference?: string;
  id: string;
  itemId: string;
  kind: QuestionKind;
  title: string;
  instruction?: string;
  prompt: string;
  promptTarget?: string;
  choices: string[];
  answer: string;
  translationZh?: string;
  context: string;
  correctReason: string;
  memoryPoint: string;
  choiceAnalysis: { choice: string; correct: boolean; explanation: string }[];
};
