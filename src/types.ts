
export type Locale = 'zh-CN' | 'ja' | 'en';
export type AppView = 'study' | 'market' | 'capture' | 'captures' | 'home' | 'memory-review' | 'history' | 'mistakes' | 'memory' | 'data' | 'mcp' | 'insights' | 'plan' | 'question-types' | 'vocabulary' | 'grammar' | 'listening' | 'reading' | 'mixed' | 'daily-practice' | 'mock-exams' | 'drafts' | 'about' | 'profile' | 'settings';
export type StudyPage = 'tips' | 'questions' | 'words' | 'wordbooks' | 'bank' | 'review' | 'samples' | 'mock';
export type AppRoute = { view: AppView; page: StudyPage; itemId?: string };

export type SearchResult = {
  id: string;
  view: 'vocabulary' | 'grammar' | 'listening' | 'reading';
  title: string;
  subtitle: string;
  moduleLabel: string;
  matches: string[];
  score: number;
};
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

export type TtsProviderId = 'browser' | 'openai' | 'google-cloud' | 'azure';

export type AuthUser = { id: number; username: string };
