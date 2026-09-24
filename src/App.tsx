import { WordLookupProvider } from './features/review/WordLookup';
import { listeningPracticeKey, recordListeningPractice } from './domain/listeningPractice';
'use client';

import { LoginLanding } from './features/auth/LoginLanding';
import { AppNoticeDialog } from './components/AppNoticeDialog';
import { AuthoringNavigation, type AuthoringLocation } from './components/AuthoringNavigation';

import { configureFirebase, googleIdToken, firebaseLogout } from './lib/firebase';

import { isTopicDraft, topicDraftForPractice } from './domain/practicePurpose';
import { GlobalSearch } from './features/search/GlobalSearch';
import { ArrowLeft, BookOpenText, Search } from 'lucide-react';
import { lazy, Suspense, startTransition, useEffect, useMemo, useRef, useState } from 'react';
import { useQuestionBatch } from './hooks/useQuestionBatch';
import { useBrowserHash } from './hooks/useBrowserHash';
import { itemExplanation, itemMeaning, itemMemory, itemPatternTexts } from './domain/items';
import { defaultMemoryCardBackFields, defaultMemoryCardFrontFields, normalizeMemoryCardFields } from './domain/memoryCards';
import { buildQuestionIndex, type QuestionReference, buildQuestions, deckLabelsFor } from './domain/questions';
import { createDefaultStudyPlanProfile, localDateString } from './domain/studyPlan';
import { nextSchedule, nextStatus } from './domain/srs.mjs';
import type { OfficialSampleModule } from './data/officialModuleSamples';
import { AboutPanel, aboutSectionTitle, isAboutSection } from './features/about/AboutPanel';
import { UserProfilePanel } from './features/profile/UserProfilePanel';
import { CapturePanel } from './features/capture/CapturePanel';
import { DraftsPanel } from './features/drafts/DraftsPanel';
import { HomeDashboard } from './features/home/HomeDashboard';
import { AttemptQuestionDetail } from './features/history/HistoryPanel';
import { DataManagementPanel, type DataTab } from './features/insights/DataManagementPanel';
import { ListeningPanel } from './features/listening/ListeningPanel';
import { DesktopPageHeader, DesktopSidebarNavigation, MobileAppHeader, MobileBottomNavigation, MobileStudyControls, type MobileStudyPanel } from './features/navigation/MobileNavigation';
import { OfficialModuleSamples } from './features/official-samples/OfficialModuleSamples';
import { StudyPlanPanel } from './features/plan/StudyPlanPanel';
import { MixedEntryIndexPanel, MixedPracticeHub } from './features/practice/MixedPracticeHub';
import { MockExamCatalog } from './features/practice/MockExamCatalog';
import { MockExamPanel } from './features/practice/MockExamPanel';
import { NewsCyclePanel } from './features/news/NewsCyclePanel';
import { PracticePanel, PracticeReviewPanel, WordDetailPanel, WordbookManagerPanel, WordIndexPanel, type WordIndexPracticeFocus } from './features/practice/StudyPanels';
import { itemInWordbook, wordbookFamily } from './domain/wordbooks';
import { QuestionTypeGuide } from './features/question-types/QuestionTypeGuide';
import { QuestionTypeDetail } from './features/question-types/QuestionTypeDetail';
import { ReadingPanel } from './features/reading/ReadingPanel';
import { FocusedMemoryReview, type MemoryRating } from './features/review/FocusedMemoryReview';
import { RecordsOverview } from './features/overview/RecordsOverview';
import { SettingsView } from './features/settings/SettingsView';
import { AgentConsentPage, isAgentConsentPage } from './features/agents/AgentConsentPage';
import { PublicIntroPanel } from './features/about/PublicIntroPanel';
import { translations } from './i18n/translations';
import { ApiError, apiRequest } from './lib/api';
import type {
  AnswerState,
  AppRoute,
  AppView,
  AttemptAnswer,
  AuthUser,
  CustomQuestionTypeTip,
  DailyPractice,
  DailyPracticeSummary,
  Deck,
  DisplaySettings,
  DraftSummary,
  ListeningQuestion,
  ListeningQuestionInput,
  LearningCapture,
  LearningCaptureCategory,
  LearningCaptureStatus,
  Locale,
  PracticeAttempt,
  ProgressEntry,
  ProgressState,
  Question,
  QuestionKind,
  QuestionTypeSection,
  ReadingQuestion,
  ReadingQuestionInput,
  ReviewData,
  ReviewPackDraft,
  ReviewStatus,
  SearchResult,
  StudyPage,
  StudyPlanDocument,
  StudyPlanProfile,
  StudyPlanTaskStatus,
  StudyState,
  VocabItem,
  Wordbook,
} from './types';

const MarketPanel = lazy(() => import('./features/market/MarketPanel').then((module) => ({ default: module.MarketPanel })));

const STORAGE_TOKEN = 'jlpt-auth-token-v1';
const DEV_AUTH_TOKEN = import.meta.env.DEV ? import.meta.env.VITE_DEV_AUTH_TOKEN : undefined;
const MEMORY_CARD_FRONT_COMPAT_KEY = '_memory_card_front_fields';
const MEMORY_CARD_BACK_COMPAT_KEY = '_memory_card_back_fields';

const fallbackData: ReviewData = {
  generated_at: '2026-08-27T20:20:00+09:00',
  items: [],
};

const fallbackWordbooks: Wordbook[] = [
  { id: 'n1_vocab', title: 'N1/N2 词汇', deck: 'n1_vocab', builtIn: true },
  { id: 'name_reading', title: '补充・人名读法', deck: 'name_reading', builtIn: true },
  { id: 'grammar_expression', title: '语法・句型', deck: 'grammar_expression', builtIn: true },
];

const defaultSettings: DisplaySettings = {
  showReviewRuby: true,
  showExplanationRuby: true,
  locale: 'zh-CN',
  fontSize: 'standard',
  memoryCardFrontFields: defaultMemoryCardFrontFields,
  memoryCardBackFields: defaultMemoryCardBackFields,
  feedbackMode: 'immediate',
  questionTypeTips: {},
  customQuestionTypeTips: [],
};

type AppRouteNavItem = {
  view: AppView;
  label: string;
  page?: StudyPage;
  itemId?: string;
  activeViews?: AppView[];
  children?: AppRouteNavItem[];
  group?: 'today' | 'study' | 'review' | 'record' | 'manage';
};

export default function App() {
  const [authoringLocation, setAuthoringLocation] = useState<AuthoringLocation | null>(null);
  const [data, setData] = useState<ReviewData>(fallbackData);
  const [authToken, setAuthToken] = useState<string>(() => (typeof window === 'undefined' ? '' : localStorage.getItem(STORAGE_TOKEN) ?? DEV_AUTH_TOKEN ?? ''));
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const [sessionLoadError, setSessionLoadError] = useState('');
  const [authNotice, setAuthNotice] = useState('');
  const [authMode, setAuthMode] = useState<'local' | 'firebase' | null>(null);
  const [firebaseLinked, setFirebaseLinked] = useState(false);
  useEffect(() => {
    if (!authToken || authMode !== 'firebase') { setFirebaseLinked(false); return; }
    let cancelled = false;
    apiRequest<{ uid: string | null }>('/api/auth/firebase/status', { token: authToken })
      .then((status) => { if (!cancelled) setFirebaseLinked(Boolean(status.uid)); })
      .catch(() => { if (!cancelled) setFirebaseLinked(false); });
    return () => { cancelled = true; };
  }, [authToken, authMode]);

  useEffect(() => {
    apiRequest<{ mode: 'local' | 'firebase'; firebase: import('firebase/app').FirebaseOptions | null }>('/api/auth/config')
      .then((config) => { if (config.firebase) configureFirebase(config.firebase); setAuthMode(config.mode); })
      .catch(() => setAuthError('无法读取登录配置，请刷新页面重试'));
  }, []);
  async function handleGoogleLogin(linkExisting = false) {
    setAuthLoading(true); setAuthError(''); setAuthNotice('');
    try {
      const idToken = await googleIdToken();
      const session = await apiRequest<{ user: AuthUser; token: string }>(linkExisting ? '/api/auth/firebase/link' : '/api/auth/firebase', { method: 'POST', token: linkExisting ? authToken : undefined, body: { idToken } });
      localStorage.setItem(STORAGE_TOKEN, session.token); setAuthToken(session.token); setUser(session.user);
      if (linkExisting) { setFirebaseLinked(true); setAuthNotice('已绑定 Google，原来的学习记录已保留。'); }
    } catch (error) { setAuthError(error instanceof Error ? error.message : 'Google 登录失败'); }
    finally { setAuthLoading(false); }
  }
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [dailyPractices, setDailyPractices] = useState<DailyPracticeSummary[]>([]);
  const [dailyPracticeDetails, setDailyPracticeDetails] = useState<DailyPractice[]>([]);
  const [activeDailyPractice, setActiveDailyPractice] = useState<DailyPractice | null>(null);
  const [activeDraft, setActiveDraft] = useState<ReviewPackDraft | null>(null);
  const [draftAnnotation, setDraftAnnotation] = useState('');
  const [listeningQuestions, setListeningQuestions] = useState<ListeningQuestion[]>([]);
  const [readingQuestions, setReadingQuestions] = useState<ReadingQuestion[]>([]);
  const [captures, setCaptures] = useState<LearningCapture[]>([]);
  const [wordbooks, setWordbooks] = useState<Wordbook[]>(fallbackWordbooks);
  const [studyPlan, setStudyPlan] = useState<StudyPlanDocument>(() => ({ profile: createDefaultStudyPlanProfile(), status: 'profile_only', tasks: [], phases: [], dailySummaries: [] }));
  const [selectedDeck, setSelectedDeck] = useState<Deck | 'all'>('all');
  const [selectedWordbookId, setSelectedWordbookId] = useState('all');
  const [activeIndex, setActiveIndex] = useState(0);
  const questionTimer = useRef<{ questionId: string; startedAt: number } | null>(null);
  const [wordIndex, setWordIndex] = useState(0);
  const [mixedQuestionSeed, setMixedQuestionSeed] = useState(() => {
    const saved = Number(sessionStorage.getItem('jlpt-mixed-question-seed'));
    return saved > 0 && saved < 1 ? saved : 0.314159;
  });
  const [questionShuffleSeed, setQuestionShuffleSeed] = useState(() => Math.random());
  const [answers, setAnswers] = useState<AnswerState>({});
  const [progress, setProgress] = useState<ProgressState>({});
  const [attemptHistory, setAttemptHistory] = useState<PracticeAttempt[]>([]);
  const [activeAttempt, setActiveAttempt] = useState<PracticeAttempt | null>(null);
  const [settings, setSettings] = useState<DisplaySettings>(defaultSettings);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const restoreLastPage = useRef(!window.location.hash || window.location.hash === '#/');
  const browserHash = useBrowserHash();
  const route = routeFromHash(browserHash);
  const [renderedHash, setRenderedHash] = useState<string | null>(null);
  const routeReady = renderedHash === browserHash;
  const [practiceLoadError, setPracticeLoadError] = useState<string | null>(null);
  // Paint the destination header and loading state before computing its content.
  useEffect(() => {
    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => startTransition(() => setRenderedHash(browserHash)));
    });
    return () => { cancelAnimationFrame(firstFrame); cancelAnimationFrame(secondFrame); };
  }, [browserHash]);
  const practiceFailed = route.view === 'daily-practice' && Boolean(route.itemId) && practiceLoadError === route.itemId;
  const pageLoading = !routeReady || authLoading
    || (route.view === 'daily-practice' && Boolean(route.itemId)
      && route.itemId !== activeDailyPractice?.id && practiceLoadError !== route.itemId);
  const [dataTab, setDataTab] = useState<DataTab>(() => dataTabForRoute(route.view));
  const [activeCaptureDetailId, setActiveCaptureDetailId] = useState<string | null>(null);
  const [activeDraftDetailId, setActiveDraftDetailId] = useState<string | null>(null);
  const [activeAttemptDetailId, setActiveAttemptDetailId] = useState<string | null>(null);
  const [attemptQuestionDetailOpen, setAttemptQuestionDetailOpen] = useState(false);
  const [practiceFocus, setPracticeFocus] = useState<WordIndexPracticeFocus | null>(null);
  const [desktopSidebarCollapsed, setDesktopSidebarCollapsed] = useState(() => { try { return localStorage.getItem('jlpt.sidebar.collapsed') === 'true'; } catch { return false; } });
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [mobileStudyPanel, setMobileStudyPanel] = useState<MobileStudyPanel>(null);
  const lastPracticeEntryKey = useRef<string | null>(null);
  const processingAttemptIds = useRef(new Set<string>());
  const pendingPracticeSave = useRef<Promise<unknown>>(Promise.resolve());
  const activeView = route.view;
  const studyPage = route.page;

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      setSessionLoadError('');
      if (!authToken) {
        setAuthLoading(false);
        return;
      }
      try {
        const me = await apiRequest<{ user: AuthUser }>('/api/me', { token: authToken });
        if (cancelled) return;
        setUser(me.user);
        const [reviewData, studyState, draftList, dailyPracticeList, listeningList, readingList, savedPlan, captureList, wordbookList] = await Promise.all([
          apiRequest<ReviewData>('/api/review-data', { token: authToken }),
          apiRequest<StudyState>('/api/study-state', { token: authToken }),
          apiRequest<{ drafts: DraftSummary[] }>('/api/drafts', { token: authToken }),
          apiRequest<{ practices: DailyPracticeSummary[] }>('/api/daily-practices', { token: authToken }),
          apiRequest<{ questions: ListeningQuestion[] }>('/api/listening-questions', { token: authToken }),
          apiRequest<{ questions: ReadingQuestion[] }>('/api/reading-questions', { token: authToken }),
          apiRequest<{ plan: StudyPlanDocument }>('/api/study-plan', { token: authToken }),
          apiRequest<{ captures: LearningCapture[] }>('/api/captures', { token: authToken }),
          apiRequest<{ wordbooks: Wordbook[] }>('/api/wordbooks', { token: authToken }),
        ]);
        if (cancelled) return;
        const resume = readPracticeResume(me.user.id);
        if (restoreLastPage.current) {
          restoreLastPage.current = false;
          if (resume.hash) window.location.replace(resume.hash);
        }
        const requestedPracticeId = routeFromHash(window.location.hash).view === 'daily-practice'
          ? routeFromHash(window.location.hash).itemId ?? resume.practiceId
          : undefined;
        setUser(me.user);
        setData(reviewData);
        applyStudyState(studyState);
        setDrafts(draftList.drafts ?? []);
        setDailyPractices(dailyPracticeList.practices ?? []);
        const dailyPracticeDetails = await Promise.all((dailyPracticeList.practices ?? []).filter((practice) => practice.date === todayDateKey() || practice.id === requestedPracticeId).map(async (practice) => {
          const response = await apiRequest<{ practice: DailyPractice }>(`/api/daily-practices/${practice.id}`, { token: authToken });
          return response.practice;
        }));
        if (!cancelled) {
          setDailyPracticeDetails(dailyPracticeDetails);
          setActiveDailyPractice(dailyPracticeDetails.find((practice) => practice.id === requestedPracticeId) ?? dailyPracticeDetails.find((practice) => !topicDraftForPractice(practice, draftList.drafts ?? [])) ?? null);
        }
        if (cancelled) return;
        setListeningQuestions(listeningList.questions ?? []);
        setReadingQuestions(readingList.questions ?? []);
        setStudyPlan(savedPlan.plan ?? { profile: createDefaultStudyPlanProfile(), status: 'profile_only', tasks: [], phases: [], dailySummaries: [] });
        setCaptures(captureList.captures ?? []);
        setWordbooks(normalizeWordbooks(wordbookList.wordbooks));
        const importedBook = new URLSearchParams(window.location.search).get('wordbook');
        if (importedBook && wordbookList.wordbooks.some((book) => book.id === importedBook)) setSelectedWordbookId(importedBook);
        setAuthError('');
      } catch (error) {
        if (!cancelled) {
          if (error instanceof ApiError && error.status === 401) {
            localStorage.removeItem(STORAGE_TOKEN);
            setAuthToken('');
            setUser(null);
            setAuthError('登录已过期，请重新登录');
          } else {
            setSessionLoadError(error instanceof Error ? error.message : '学习数据加载失败');
          }
        }
      } finally {
        if (!cancelled) setAuthLoading(false);
      }
    }

    restoreSession();
    return () => { cancelled = true; };
  }, [authToken]);

  useEffect(() => {
    document.documentElement.dataset.fontSize = settings.fontSize;
    return () => {
      delete document.documentElement.dataset.fontSize;
    };
  }, [settings.fontSize]);

  useEffect(() => {
    if (activeView !== 'plan' || !authToken) return;
    let cancelled = false;
    async function refreshPlan() {
      try {
        const response = await apiRequest<{ plan: StudyPlanDocument }>('/api/study-plan', { token: authToken });
        if (!cancelled) setStudyPlan(response.plan);
      } catch {
        // The main session restore flow owns authentication errors.
      }
    }
    refreshPlan();
    const timer = window.setInterval(refreshPlan, 20_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [activeView, authToken]);

  useEffect(() => {
    if (activeView !== 'daily-practice' || !authToken || authLoading || route.itemId || activeDailyPractice) return;
    refreshDailyPractices().catch((error) => setAuthError(error instanceof Error ? error.message : 'Failed to load daily practice'));
  }, [activeDailyPractice, activeView, authToken, authLoading, route.itemId]);

  useEffect(() => {
    if (authLoading || !authToken || activeView !== 'daily-practice' || !route.itemId || route.itemId === activeDailyPractice?.id) return;
    let cancelled = false;
    setPracticeLoadError(null);
    apiRequest<{ practice: DailyPractice }>(`/api/daily-practices/${encodeURIComponent(route.itemId)}`, { token: authToken })
      .then(({ practice }) => { if (!cancelled) setActiveDailyPractice(practice); })
      .catch((error) => { if (!cancelled) { setPracticeLoadError(route.itemId ?? null); setAuthError(error instanceof Error ? error.message : 'Failed to load practice'); } });
    return () => { cancelled = true; };
  }, [authLoading, authToken, activeView, route.itemId, activeDailyPractice?.id]);

  // Drafts may be created by an external agent while the home page stays open.
  useEffect(() => {
    if (!authToken || activeView !== 'home') return;
    let cancelled = false;
    let refreshing = false;
    let idleHandle: number | undefined;
    let timeoutHandle: number | undefined;
    async function refreshHomeDrafts() {
      if (document.hidden || refreshing) return;
      refreshing = true;
      try {
        const [result, practiceList] = await Promise.all([
          apiRequest<{ drafts: DraftSummary[] }>('/api/drafts', { token: authToken }),
          apiRequest<{ practices: DailyPracticeSummary[] }>('/api/daily-practices', { token: authToken }),
        ]);
        if (!cancelled) {
          setDrafts(result.drafts ?? []);
          setDailyPractices(practiceList.practices ?? []);
        }
      } catch {
        // Retain the last successful list during a temporary connection failure.
      } finally {
        refreshing = false;
      }
    }
    const scheduleRefresh = () => {
      if (idleHandle || timeoutHandle) return;
      if ('requestIdleCallback' in window) {
        idleHandle = window.requestIdleCallback(() => {
          idleHandle = undefined;
          void refreshHomeDrafts();
        }, { timeout: 2000 });
        return;
      }
      timeoutHandle = window.setTimeout(() => {
        timeoutHandle = undefined;
        void refreshHomeDrafts();
      }, 800);
    };
    scheduleRefresh();
    const timer = window.setInterval(refreshHomeDrafts, 30000);
    window.addEventListener('focus', refreshHomeDrafts);
    document.addEventListener('visibilitychange', refreshHomeDrafts);
    return () => {
      cancelled = true;
      if (idleHandle) window.cancelIdleCallback(idleHandle);
      if (timeoutHandle) window.clearTimeout(timeoutHandle);
      window.clearInterval(timer);
      window.removeEventListener('focus', refreshHomeDrafts);
      document.removeEventListener('visibilitychange', refreshHomeDrafts);
    };
  }, [authToken, activeView]);

  useEffect(() => {
    if (!window.location.hash) {
      window.location.replace(routeHash('home', 'questions'));
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [browserHash]);

  const items = useMemo(
    () => moduleItems(data.items, activeView, selectedDeck, activeView === 'vocabulary' || activeView === 'grammar' ? selectedWordbookId : 'all'),
    [activeView, data.items, selectedDeck, selectedWordbookId],
  );

  const locale = normalizeLocale(settings.locale);
  const needsActiveQuestions = routeReady && supportsStudyPage(activeView) && activeView !== 'daily-practice'
    && (studyPage === 'questions' || studyPage === 'review' || (activeView === 'grammar' && studyPage === 'words'));
  const questionItems = useMemo(
    () => {
      if (!needsActiveQuestions) {
        return [];
      }
      return selectedDeck === 'all' ? items.filter((item) => item.deck !== 'name_reading' && item.type !== 'proper_name') : items;
    },
    [items, needsActiveQuestions, selectedDeck],
  );
  const pagedVocabulary = activeView === 'vocabulary' && studyPage === 'questions';
  const allQuestions = useMemo(() => pagedVocabulary ? [] : activeView === 'mixed'
    ? shuffledBySeed(buildQuestions(shuffledBySeed(questionItems, mixedQuestionSeed), locale, 20), mixedQuestionSeed)
    : buildQuestions(questionItems, locale), [questionItems, locale, activeView, mixedQuestionSeed, pagedVocabulary]);
  const [mistakeQuestions, setMistakeQuestions] = useState<Question[]>([]);
  const [mistakeQuestionsStatus, setMistakeQuestionsStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  useEffect(() => {
    if (activeView !== 'mistakes' || !authToken || authLoading) return;
    let cancelled = false;
    setMistakeQuestionsStatus('loading');
    apiRequest<{ questions: Question[] }>('/api/history-questions', { token: authToken })
      .then((result) => { if (!cancelled) { setMistakeQuestions(result.questions); setMistakeQuestionsStatus('ready'); } })
      .catch(() => { if (!cancelled) setMistakeQuestionsStatus('error'); });
    return () => { cancelled = true; };
  }, [activeView, authToken, authLoading, attemptHistory]);
  const needsHistoryQuestions = routeReady && (activeView === 'mistakes'
    || (['history', 'insights'].includes(activeView) && Boolean(activeAttemptDetailId)));
  const needsPracticeDetails = (needsHistoryQuestions && activeView !== 'mistakes') || activeView === 'home'
    || (activeView === 'mixed' && studyPage === 'tips' && route.itemId === 'topics');
  useEffect(() => {
    if (!authToken || authLoading || !needsPracticeDetails) return;
    let cancelled = false;
    const missing = dailyPractices.filter((entry) =>
      (activeView !== 'home' || entry.date === todayDateKey())
      && !dailyPracticeDetails.some((detail) => detail.id === entry.id && detail.updated_at === entry.updated_at));
    if (!missing.length) return;
    Promise.all(missing.map(async (entry) => {
      const result = await apiRequest<{ practice: DailyPractice }>(`/api/daily-practices/${entry.id}`, { token: authToken });
      return result.practice;
    })).then((loaded) => {
      if (!cancelled) setDailyPracticeDetails((previous) => [
        ...previous.filter((entry) => !loaded.some((next) => next.id === entry.id)), ...loaded,
      ]);
    }).catch((error) => {
      if (!cancelled) setAuthError(error instanceof Error ? error.message : 'Failed to load practice details');
    });
    return () => { cancelled = true; };
  }, [activeView, authLoading, authToken, dailyPractices, dailyPracticeDetails, needsPracticeDetails]);
  const historyQuestions = useMemo(() => {
    if (!needsHistoryQuestions) {
      return [];
    }
    // The mistake notebook only lists items answered wrong at least once, so only rebuild those.
    const wrongItemIds = new Set(attemptHistory.flatMap((attempt) => attempt.answers.filter((answer) => !answer.correct).map((answer) => answer.itemId)));
    return uniqueById([
      ...buildQuestions(activeView === 'mistakes' ? data.items.filter((item) => wrongItemIds.has(item.id)) : data.items, locale),
      ...(activeView === 'mistakes' ? mistakeQuestions : []),
      ...dailyPracticeDetails.flatMap((practice) => practice.questions ?? []),
    ]);
  }, [dailyPracticeDetails, data.items, locale, needsHistoryQuestions, activeView, attemptHistory, mistakeQuestions]);
  const materializedQuestions = useMemo(
    () => {
      if (activeView === 'daily-practice') {
        return activeDailyPractice?.questions ?? [];
      }
      const focusedItemIds = new Set(practiceFocus?.kind === 'items' ? practiceFocus.itemIds : []);
      const focusedQuestions = activeView === 'grammar' && practiceFocus && practiceFocus.kind !== 'random'
        ? allQuestions.filter((question) => {
          if (practiceFocus.kind === 'question-kind') return question.kind === practiceFocus.questionKind;
          if (practiceFocus.kind === 'items') return focusedItemIds.has(question.itemId);
          const sourceItem = data.items.find((item) => item.id === question.itemId);
          return Boolean(sourceItem?.tags?.includes(practiceFocus.tag));
        })
        : allQuestions;
      return activeView === 'vocabulary' ? shuffledBySeed(focusedQuestions, questionShuffleSeed) : focusedQuestions;
    },
    [activeDailyPractice, activeView, allQuestions, data.items, practiceFocus, questionShuffleSeed],
  );
  const vocabularyIndex = useMemo(() => {
    if (!pagedVocabulary) return [];
    const focusedItemIds = new Set(practiceFocus?.kind === 'items' ? practiceFocus.itemIds : []);
    const index = buildQuestionIndex(questionItems).filter((question) => {
      if (!practiceFocus || practiceFocus.kind === 'random') return true;
      if (practiceFocus.kind === 'question-kind') return question.kind === practiceFocus.questionKind;
      if (practiceFocus.kind === 'items') return focusedItemIds.has(question.itemId);
      return Boolean(questionItems.find((item) => item.id === question.itemId)?.tags?.includes(practiceFocus.tag));
    });
    return shuffledBySeed(index, questionShuffleSeed);
  }, [pagedVocabulary, practiceFocus, questionItems, questionShuffleSeed]);
  // The vocabulary word list never materializes questions; count its practicable kinds from the cheap index.
  const wordIndexQuestions = useMemo(() => activeView === 'vocabulary' && studyPage === 'words'
    ? buildQuestionIndex(selectedDeck === 'all' ? items.filter((item) => item.deck !== 'name_reading' && item.type !== 'proper_name') : items)
    : materializedQuestions,
  [activeView, studyPage, selectedDeck, items, materializedQuestions]);
  const questions: QuestionReference[] = pagedVocabulary ? vocabularyIndex : materializedQuestions;
  const batch = useQuestionBatch(questionItems, vocabularyIndex, activeIndex, locale, pagedVocabulary && routeReady);
  const activeQuestion = pagedVocabulary ? batch.question : materializedQuestions[activeIndex % Math.max(materializedQuestions.length, 1)];
  const practiceAnsweredCount = questions.filter((question) => Boolean(answers[question.id])).length;
  const practiceComplete = questions.length > 0 && practiceAnsweredCount === questions.length;
  const effectiveFeedbackMode = activeView === 'mixed' ? 'batch' : settings.feedbackMode;
  const activeWord = items[wordIndex % Math.max(items.length, 1)];
  const labels = translations[locale];
  const deckLabels = deckLabelsFor(locale);
  const today = useMemo(() => todayDateKey(), []);
  const needsHomeMetrics = routeReady && activeView === 'home';
  const hasMemoryReview = needsHomeMetrics && data.items.length > 0;
  const homeTodayPractices = useMemo(() => {
    if (!needsHomeMetrics) {
      return [];
    }
    return dailyPracticeDetails
      .filter((practice) => practice.date === today && !topicDraftForPractice(practice, drafts))
      .sort((left, right) => right.version - left.version);
  }, [dailyPracticeDetails, drafts, needsHomeMetrics, today]);
  const latestHomeDraft = useMemo(() => {
    if (!needsHomeMetrics) {
      return undefined;
    }
    return drafts
      .filter((draft) => ['draft', 'needs_revision', 'approved'].includes(draft.status) && localDateString(new Date(draft.created_at)) === today)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
  }, [drafts, needsHomeMetrics, today]);
  const moduleStats = useMemo(
    () => routeReady && activeView === 'mixed' ? moduleSummaries(data.items, labels) : [],
    [routeReady, activeView, data.items, labels],
  );
  const memoryReviewItems = useMemo(() => {
    if (!routeReady || activeView !== 'memory-review') {
      return [];
    }
    const now = new Date().toISOString();
    return data.items
      .filter((item) => item.deck === 'grammar_expression' || item.deck === 'n1_vocab' || item.deck === 'name_reading')
      .filter((item) => !progress[item.id]?.nextReviewAt || (progress[item.id]?.nextReviewAt ?? '') <= now)
      .sort((left, right) => (progress[left.id]?.nextReviewAt ?? '9999').localeCompare(progress[right.id]?.nextReviewAt ?? '9999'));
  }, [routeReady, activeView, data.items, progress]);
  // FocusedMemoryReview snapshots its queue on mount, so reload the library and progress
  // before mounting it: items added elsewhere (e.g. via MCP) since the session loaded must be included.
  const [memoryReviewReady, setMemoryReviewReady] = useState(false);
  const isMemoryReview = activeView === 'memory-review';
  useEffect(() => {
    if (!isMemoryReview || !user || !authToken) {
      setMemoryReviewReady(false);
      return;
    }
    let cancelled = false;
    setMemoryReviewReady(false);
    Promise.all([
      apiRequest<ReviewData>('/api/review-data', { token: authToken }),
      apiRequest<StudyState>('/api/study-state', { token: authToken }),
    ]).then(([reviewData, studyState]) => {
      if (cancelled) return;
      setData(reviewData);
      applyStudyState(studyState);
    }).catch(() => {
      // Fall back to the data already in memory during a temporary connection failure.
    }).finally(() => {
      if (!cancelled) setMemoryReviewReady(true);
    });
    return () => { cancelled = true; };
  }, [isMemoryReview, user?.id, authToken]);
  const hasStudyControls = !['samples', 'wordbooks'].includes(studyPage) && supportsStudyPage(activeView) && activeView !== 'mixed' && activeView !== 'daily-practice';
  const hasLibraryPage = activeView === 'vocabulary' || activeView === 'grammar' || activeView === 'listening' || activeView === 'reading';
  const libraryPageLabel = activeView === 'listening' || activeView === 'reading' ? labels.questionBankPage : labels.wordPage;
  const searchResults = useMemo(() => searchItems(data.items, searchQuery, locale, labels, listeningQuestions, readingQuestions), [data.items, labels, locale, searchQuery, listeningQuestions, readingQuestions]);
  const needsReviewAttempt = studyPage === 'questions' || studyPage === 'review';
  const reviewAttempt = useMemo(
    () => needsReviewAttempt ? latestAttemptFor(attemptHistory, activeView, selectedDeck, questions) : undefined,
    [activeView, attemptHistory, needsReviewAttempt, questions, selectedDeck],
  );
  async function shareLearningContent(kind: 'practice' | 'wordbook', sourceId: string, description: string) {
    const body = { kind, sourceId, description };
    await apiRequest('/api/market', { token: authToken, method: 'POST', body });
  }
  const topicPracticeEntries = useMemo(() => {
    if (activeView !== 'mixed' || studyPage !== 'tips' || route.itemId !== 'topics') {
      return [];
    }
    return drafts.filter(isTopicDraft).map((draft) => {
      const practice = dailyPracticeDetails.find((practice) => practice.sourceDraftId === draft.id);
      return {
        key: draft.id, title: draft.title, reference: practice?.reference ?? draft.reference,
        share: practice ? (description: string) => shareLearningContent('practice', practice.id, description) : undefined,
        description: practice?.description ?? '',
        status: practice || ['approved', 'archived'].includes(draft.status) ? 'ready' as const : 'pending' as const,
        updatedAt: draft.updated_at,
        body: practice ? `${practice.questions.length} 题 · 开始练习` : ['approved', 'archived'].includes(draft.status) ? '已确认 · 查看并开始' : '待确认 · 查看题目',
        count: practice?.questions.length ?? 0, icon: BookOpenText, tone: 'mint',
        action: () => {
          if (practice) { void openDailyPractice(practice.id); }
          else { void selectDraft(draft.id); setActiveDraftDetailId(draft.id); navigateTo('drafts'); }
        },
      };
    });
  }, [activeView, dailyPracticeDetails, drafts, route.itemId, studyPage, authToken]);
  const practiceEntryKey = `${activeView}:${studyPage}:${selectedDeck}:${selectedWordbookId}:${locale}:${activeDailyPractice?.id ?? ''}:${questions.length}:${activeView === 'vocabulary' ? questionShuffleSeed : activeView === 'mixed' ? mixedQuestionSeed : ''}`;

  useEffect(() => {
    setWordIndex(0);
    if (activeView === 'vocabulary') {
      setQuestionShuffleSeed(Math.random());
    }
  }, [activeView, selectedDeck, selectedWordbookId, locale]);

  useEffect(() => {
    if (activeView !== 'grammar' && activeView !== 'vocabulary' && practiceFocus) {
      setPracticeFocus(null);
    }
  }, [activeView, practiceFocus]);

  useEffect(() => {
    if (selectedWordbookId === 'all') return;
    const selected = wordbooks.find((wordbook) => wordbook.id === selectedWordbookId);
    const isEntryLibrary = activeView === 'vocabulary' || activeView === 'grammar';
    if (!selected || (isEntryLibrary && wordbookFamily(selected.deck) !== (activeView === 'grammar' ? 'grammar' : 'vocabulary'))) {
      setSelectedWordbookId('all');
    }
  }, [activeView, selectedWordbookId, wordbooks]);

  useEffect(() => {
    if (!routeReady || authLoading || lastPracticeEntryKey.current === practiceEntryKey) return;
    lastPracticeEntryKey.current = practiceEntryKey;
    if (studyPage !== 'questions') return;

    const saved = user ? readPracticeResume(user.id) : {};
    const savedIndex = saved.hash === browserHash && saved.practiceId === activeDailyPractice?.id
      ? questions.findIndex((question) => question.id === saved.questionId) : -1;
    const firstUnansweredIndex = questions.findIndex((question) => !answers[question.id]);
    setActiveIndex(savedIndex >= 0 ? savedIndex : firstUnansweredIndex >= 0 ? firstUnansweredIndex : 0);
  }, [answers, authLoading, routeReady, practiceEntryKey, questions, studyPage]);

  useEffect(() => {
    if (studyPage !== 'words' || !route.itemId) {
      return;
    }
    const requestedIndex = items.findIndex((item) => item.id === route.itemId);
    if (requestedIndex >= 0) {
      setWordIndex(requestedIndex);
    }
  }, [items, route.itemId, studyPage]);

  useEffect(() => {
    if (isDataManagementView(route.view)) {
      setDataTab(dataTabForRoute(route.view));
    } else {
      setActiveCaptureDetailId(null);
      setActiveDraftDetailId(null);
      setActiveAttemptDetailId(null);
      setAttemptQuestionDetailOpen(false);
    }
  }, [route.view]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (studyPage !== 'words' || activeView === 'home' || activeView === 'about' || activeView === 'profile' || activeView === 'settings' || activeView === 'drafts' || activeView === 'listening' || activeView === 'reading') {
        return;
      }
      if (event.key === 'ArrowLeft') {
        setWordIndex((index) => previousIndex(index, items.length));
      }
      if (event.key === 'ArrowRight') {
        setWordIndex((index) => nextIndex(index, items.length));
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeView, items.length, studyPage]);

  // Per-question timing: the clock starts when a question is shown and pauses while the tab is hidden,
  // so long breaks between sessions never inflate the recorded practice time.
  useEffect(() => {
    if (studyPage !== 'questions' || !activeQuestion) {
      questionTimer.current = null;
      return;
    }
    questionTimer.current = { questionId: activeQuestion.id, startedAt: Date.now() };
    const onVisible = () => {
      if (!document.hidden) questionTimer.current = { questionId: activeQuestion.id, startedAt: Date.now() };
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [activeQuestion?.id, studyPage, activeView]);

  function answerQuestion(question: Question, selected: string) {
    const correct = selected === question.answer;
    const now = new Date();
    const attempt = withPracticeName(currentAttemptFor(activeAttempt, attemptHistory, activeView, selectedDeck, questions, now));
    const previous = answers[question.id]?.attemptId === attempt.id ? answers[question.id] : undefined;
    const timer = questionTimer.current?.questionId === question.id ? questionTimer.current : null;
    const segmentStart = timer?.startedAt ?? now.getTime();
    const startedAt = previous?.startedAt ?? new Date(segmentStart).toISOString();
    const elapsedMs = (previous?.elapsedMs ?? 0) + Math.max(0, now.getTime() - segmentStart);
    questionTimer.current = { questionId: question.id, startedAt: now.getTime() };
    const nextAttemptAnswer: AttemptAnswer = {
      questionId: question.id,
      itemId: question.itemId,
      kind: question.kind,
      selected,
      correct,
      startedAt,
      answeredAt: now.toISOString(),
      elapsedMs,
    };
    const nextAttempt = appendAttemptAnswer(attempt, nextAttemptAnswer);
    const nextAttemptHistory = upsertAttemptHistory(attemptHistory, nextAttempt);
    const nextAnswers = {
      ...answers,
      [question.id]: { selected, correct, startedAt, answeredAt: now.toISOString(), elapsedMs, attemptId: nextAttempt.id },
    };
    if (effectiveFeedbackMode === 'batch') {
      setAnswers(nextAnswers);
      setActiveAttempt(nextAttempt);
      setAttemptHistory(nextAttemptHistory);
      if (authToken) {
        pendingPracticeSave.current = pendingPracticeSave.current.catch(() => undefined).then(() => apiRequest<StudyState>('/api/study-state/practice', {
          method: 'PUT',
          token: authToken,
          timeoutMs: 15000,
          body: { answers: nextAnswers, attemptHistory: nextAttemptHistory, activeAttempt: nextAttempt },
        })).catch((error) => setAuthError(error instanceof Error ? error.message : 'Failed to save answer'));
      }
      return;
    }

    if (answers[question.id]) {
      return;
    }

    const current = progress[question.itemId] ?? { correct: 0, wrong: 0, status: 'new' as const };
    const nextCorrect = current.correct + (correct ? 1 : 0);
    const nextWrong = current.wrong + (correct ? 0 : 1);
    const schedule = nextSchedule(current, correct, now);
    const status = nextStatus(nextCorrect, nextWrong, schedule.reviewCount);
    const nextProgress = {
      ...progress,
      [question.itemId]: {
        ...current,
        correct: nextCorrect,
        wrong: nextWrong,
        status,
        ...schedule,
      },
    };
    const completed = questions.length > 0 && questions.every((candidate) => Boolean(nextAnswers[candidate.id]));
    const nextHistory = completed ? upsertAttemptHistory(nextAttemptHistory, completeAttempt(nextAttempt, nextAnswers, questions, now)) : nextAttemptHistory;
    const nextActiveAttempt = completed ? null : nextAttempt;
    setAnswers(nextAnswers);
    setProgress(nextProgress);
    setAttemptHistory(nextHistory);
    setActiveAttempt(nextActiveAttempt);

    if (authToken) {
      apiRequest<StudyState>('/api/answers', {
        method: 'POST',
        token: authToken,
        body: { questionId: question.id, itemId: question.itemId, selected, correct, answerRecord: nextAnswers[question.id], progressEntry: nextProgress[question.itemId], attemptHistory: nextHistory, activeAttempt: nextActiveAttempt },
      }).then(applyStudyState).catch((error) => setAuthError(error instanceof Error ? error.message : 'Failed to save answer'));
    }
  }

  async function submitPracticeReview(navigateToReview = true) {
    const now = new Date();
    const attempt = withPracticeName(attemptForReviewSubmission(activeAttempt, attemptHistory, answers, activeView, selectedDeck, questions, now));
    if (attempt.analysisStatus === 'completed' || processingAttemptIds.current.has(attempt.id)) {
      if (navigateToReview) window.location.hash = routeHash(activeView, 'review', activeView === 'daily-practice' ? activeDailyPractice?.id : undefined);
      return;
    }
    processingAttemptIds.current.add(attempt.id);
    const completedAttempt = completeAttempt(attempt, answers, questions, now);
    const processingAttempt: PracticeAttempt = {
      ...completedAttempt,
      analysisStatus: 'processing',
      analysisStartedAt: now.toISOString(),
      analysisCompletedAt: undefined,
    };
    const nextHistory = upsertAttemptHistory(attemptHistory, processingAttempt);
    const nextProgress = progressAfterAttempt(progress, answers, questions, now);
    setProgress(nextProgress);
    setAttemptHistory(nextHistory);
    setActiveAttempt(null);

    try {
      await pendingPracticeSave.current;
      const analyzedAttempt: PracticeAttempt = {
        ...processingAttempt,
        analysisStatus: 'completed',
        analysisCompletedAt: new Date().toISOString(),
      };
      const analyzedHistory = upsertAttemptHistory(nextHistory, analyzedAttempt);
      if (authToken) {
        const saved = await apiRequest<StudyState>('/api/study-state/practice', {
          method: 'PUT',
          token: authToken,
          body: { answers, progress: nextProgress, answerItemIds: Object.fromEntries(questions.map((question) => [question.id, question.itemId])), attemptHistory: analyzedHistory, activeAttempt: null },
          timeoutMs: 30000,
        });
        applyStudyState(saved);
      } else {
        setAttemptHistory(analyzedHistory);
      }
    } catch (error) {
      setActiveAttempt(null);
      setProgress(progress);
      const retryAttempt: PracticeAttempt = { ...processingAttempt, analysisStatus: 'idle', analysisCompletedAt: undefined };
      const retryHistory = upsertAttemptHistory(nextHistory, retryAttempt);
      setAttemptHistory(retryHistory);
      setAuthError(error instanceof Error ? error.message : 'Failed to save practice review');

    } finally {
      processingAttemptIds.current.delete(attempt.id);
    }

    if (navigateToReview) {
      window.location.hash = routeHash(activeView, 'review', activeView === 'daily-practice' ? activeDailyPractice?.id : undefined);
    }
  }

  function restartPractice() {
    const nextMixedSeed = Math.random();
    const nextQuestions = activeView === 'mixed'
      ? shuffledBySeed(buildQuestions(shuffledBySeed(questionItems, nextMixedSeed), locale, 20), nextMixedSeed)
      : questions;
    const questionIds = new Set([...questions, ...nextQuestions].map((question) => question.id));
    const nextAnswers = Object.fromEntries(
      Object.entries(answers).filter(([questionId]) => !questionIds.has(questionId)),
    );
    const nextAttempt = withPracticeName(createPracticeAttempt(activeView, selectedDeck, nextQuestions, new Date()));
    const nextHistory = upsertAttemptHistory(
      activeAttempt ? attemptHistory.filter((attempt) => attempt.id !== activeAttempt.id || Boolean(attempt.completedAt)) : attemptHistory,
      nextAttempt,
    );
    setAnswers(nextAnswers);
    setActiveAttempt(nextAttempt);
    setAttemptHistory(nextHistory);
    if (authToken) {
      apiRequest<StudyState>('/api/study-state/practice', { method: 'PUT', token: authToken, body: { answers: nextAnswers, attemptHistory: nextHistory, activeAttempt: nextAttempt } })
        .then(applyStudyState)
        .catch((error) => setAuthError(error instanceof Error ? error.message : 'Failed to restart practice'));
    }
    if (activeView === 'mixed') {
      sessionStorage.setItem('jlpt-mixed-question-seed', String(nextMixedSeed));
      setMixedQuestionSeed(nextMixedSeed);
    }
    setActiveIndex(0);
    if (activeView === 'vocabulary') {
      setQuestionShuffleSeed(Math.random());
    }
    if (supportsStudyPage(activeView)) {
      window.location.hash = routeHash(activeView, 'questions', activeView === 'daily-practice' ? activeDailyPractice?.id : undefined);
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
  }

  function navigateTo(view: AppView, page?: StudyPage, itemId?: string) {
    const requestedPage = page ?? (supportsStudyPage(view) ? defaultDesktopStudyPage(view) : 'questions');
    const nextRoute = { view, page: supportsStudyPage(view) || isOfficialSampleModule(view) ? requestedPage : 'questions' as StudyPage };
    const nextHash = routeHash(nextRoute.view, nextRoute.page, itemId);
    if (window.location.hash === nextHash) {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      return;
    }
    window.location.hash = nextHash;
  }

  function startWordIndexPractice(focus?: WordIndexPracticeFocus) {
    setPracticeFocus(focus && (activeView === 'grammar' || activeView === 'vocabulary') ? focus : null);
    setActiveIndex(0);
    navigateTo(activeView, 'questions');
  }

  function openSearchResult(result: SearchResult) {
    setSelectedDeck('all');
    setSelectedWordbookId('all');
    setSearchOpen(false);
    window.location.hash = routeHash(result.view, 'words', result.id);
  }

  function openQuestionType(id: string) {
    window.location.hash = routeHash('question-types', 'questions', id);
  }

  function openOfficialSamples(module: OfficialSampleModule, id?: string) {
    window.location.hash = routeHash(module, 'samples', id);
  }

  function openMockExam(examId?: string) {
    window.location.hash = examId ? `#/mock-exams/${encodeURIComponent(examId)}` : '#/mock-exams';
  }

  function updateSettings(nextSettings: DisplaySettings) {
    const normalized = normalizeSettings(nextSettings);
    setSettings(normalized);
    if (authToken) {
      const compatibleSettings = {
        ...normalized,
        questionTypeTips: {
          ...normalized.questionTypeTips,
          [MEMORY_CARD_FRONT_COMPAT_KEY]: normalized.memoryCardFrontFields.join(','),
          [MEMORY_CARD_BACK_COMPAT_KEY]: normalized.memoryCardBackFields.join(','),
        },
      };
      apiRequest<{ settings: DisplaySettings }>('/api/study-state/settings', { method: 'PUT', token: authToken, body: compatibleSettings })
        .then((response) => setSettings(normalizeSettings(response.settings)))
        .catch((error) => setAuthError(error instanceof Error ? error.message : 'Failed to save settings'));
    }
  }

  function updateQuestionTypeTip(id: string, tip: string) {
    const nextTips = { ...settings.questionTypeTips };
    if (tip) {
      nextTips[id] = tip;
    } else {
      delete nextTips[id];
    }
    updateSettings({ ...settings, questionTypeTips: nextTips });
  }

  function createCustomQuestionTypeTip(input: { section: QuestionTypeSection; title: string; description: string; tip: string }) {
    const now = new Date().toISOString();
    const id = createCustomQuestionTypeTipId(settings.customQuestionTypeTips);
    const nextEntry: CustomQuestionTypeTip = {
      id,
      section: input.section,
      title: input.title.trim().slice(0, 80),
      description: input.description.trim().slice(0, 200),
      tip: input.tip.trim().slice(0, 2000),
      createdAt: now,
      updatedAt: now,
    };
    updateSettings({ ...settings, customQuestionTypeTips: [...settings.customQuestionTypeTips, nextEntry] });
    return id;
  }

  function updateCustomQuestionTypeTip(id: string, input: { title: string; description: string; tip: string }) {
    const now = new Date().toISOString();
    const nextEntries = settings.customQuestionTypeTips.map((entry) => entry.id === id ? {
      ...entry,
      title: input.title.trim().slice(0, 80) || entry.title,
      description: input.description.trim().slice(0, 200),
      tip: input.tip.trim().slice(0, 2000),
      updatedAt: now,
    } : entry);
    updateSettings({ ...settings, customQuestionTypeTips: nextEntries });
  }

  useEffect(() => {
    if (authLoading || !user || (activeView === 'daily-practice' && route.itemId && route.itemId !== activeDailyPractice?.id)) return;
    const save = () => {
      try {
        localStorage.setItem(`jlpt-practice-resume:${user.id}`, JSON.stringify({
          hash: browserHash,
          practiceId: activeDailyPractice?.id,
          questionId: studyPage === 'questions' ? questions[activeIndex]?.id : undefined,
        }));
      } catch { /* Resume is optional when browser storage is unavailable. */ }
    };
    const timer = window.setTimeout(save, 0);
    const onHide = () => { if (document.hidden) save(); };
    window.addEventListener('pagehide', save);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pagehide', save);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [authLoading, user, browserHash, activeDailyPractice?.id, activeQuestion?.id, activeIndex, questions, studyPage, activeView, route.itemId]);

  function deleteCustomQuestionTypeTip(id: string) {
    updateSettings({
      ...settings,
      customQuestionTypeTips: settings.customQuestionTypeTips.filter((entry) => entry.id !== id),
    });
  }

  function applyStudyState(studyState: StudyState) {
    setAnswers(Object.fromEntries(Object.entries(studyState.answers ?? {}).filter(([id]) => !id.startsWith('memory-card:'))));
    setProgress(studyState.progress ?? {});
    setAttemptHistory(studyState.attemptHistory ?? []);
    setActiveAttempt(studyState.activeAttempt ?? null);
    setSettings(normalizeSettings(studyState.settings));
  }

  async function handleAuth(mode: 'login' | 'register', username: string, password: string) {
    setAuthLoading(true);
    setAuthError('');
    try {
      const session = await apiRequest<{ user: AuthUser; token: string }>(`/api/auth/${mode}`, { method: 'POST', body: { username, password } });
      localStorage.setItem(STORAGE_TOKEN, session.token);
      setAuthToken(session.token);
      setUser(session.user);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Authentication failed');
    } finally {
      setAuthLoading(false);
    }
  }

  function handleLogout() {
    void firebaseLogout();
    if (authToken) apiRequest('/api/auth/logout', { method: 'POST', token: authToken }).catch(() => undefined);
    localStorage.removeItem(STORAGE_TOKEN);
    setAuthToken('');
    setUser(null);
    setData(fallbackData);
    setAnswers({});
    setProgress({});
    setAttemptHistory([]);
    setActiveAttempt(null);
    setSettings(defaultSettings);
    setDrafts([]);
    setDailyPractices([]);
    setDailyPracticeDetails([]);
    setActiveDailyPractice(null);
    setActiveDraft(null);
    setListeningQuestions([]);
    setWordbooks(fallbackWordbooks);
  }

  async function refreshAddedShare() {
    const [reviewData, wordbookList, draftList] = await Promise.all([
      apiRequest<ReviewData>('/api/review-data', { token: authToken }),
      apiRequest<{ wordbooks: Wordbook[] }>('/api/wordbooks', { token: authToken }),
      apiRequest<{ drafts: DraftSummary[] }>('/api/drafts', { token: authToken }),
    ]);
    setData(reviewData);
    setWordbooks(normalizeWordbooks(wordbookList.wordbooks));
    setDrafts(draftList.drafts ?? []);
    await refreshDailyPractices();
  }

  async function refreshDailyPractices(selectId?: string) {
    if (!authToken) return;
    const list = await apiRequest<{ practices: DailyPracticeSummary[] }>('/api/daily-practices', { token: authToken });
    const nextPractices = list.practices ?? [];
    setDailyPractices(nextPractices);
    const nextDetails = await Promise.all(nextPractices.filter((practice) => practice.id === selectId || practice.id === activeDailyPractice?.id || practice.date === todayDateKey()).map(async (practice) => {
      const response = await apiRequest<{ practice: DailyPractice }>(`/api/daily-practices/${practice.id}`, { token: authToken });
      return response.practice;
    }));
    setDailyPracticeDetails(nextDetails);
    const nextId = selectId ?? activeDailyPractice?.id ?? nextDetails.find((practice) => !topicDraftForPractice(practice, drafts))?.id;
    const selectedPractice = nextDetails.find((practice) => practice.id === nextId) ?? nextDetails.find((practice) => !topicDraftForPractice(practice, drafts)) ?? null;
    if (selectedPractice) {
      setActiveDailyPractice(selectedPractice);
    } else {
      setActiveDailyPractice(null);
    }
  }

  async function createDailyPracticeAndStart() {
    if (!authToken) return;
    try {
      const response = await apiRequest<{ practice: DailyPractice }>('/api/daily-practices', { method: 'POST', token: authToken, body: { minutes: 30 } });
      setActiveDailyPractice(response.practice);
      await refreshDailyPractices(response.practice.id);
      window.location.hash = routeHash('daily-practice', 'questions', response.practice.id);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Failed to create daily practice');
    }
  }

  async function openDailyPractice(id?: string) {
    if (!authToken) return;
    const todayPractice = activeDailyPractice?.date === todayDateKey() && !topicDraftForPractice(activeDailyPractice, drafts)
      ? activeDailyPractice
      : dailyPracticeDetails.find((practice) => practice.date === todayDateKey() && !topicDraftForPractice(practice, drafts));
    const practiceId = id ?? todayPractice?.id;
    if (!practiceId) {
      await createDailyPracticeAndStart();
      return;
    }
    setPracticeLoadError(null);
    window.location.hash = routeHash('daily-practice', 'questions', practiceId);
  }

  async function refreshDrafts(selectId?: string) {
    if (!authToken) return;
    const list = await apiRequest<{ drafts: DraftSummary[] }>('/api/drafts', { token: authToken });
    setDrafts(list.drafts ?? []);
    const nextId = selectId ?? activeDraft?.id ?? list.drafts?.[0]?.id;
    if (nextId) {
      const response = await apiRequest<{ draft: ReviewPackDraft }>(`/api/drafts/${nextId}`, { token: authToken });
      setActiveDraft(response.draft);
    }
  }

  async function removeDraft(id: string) {
    if (!authToken) return;
    try {
      await apiRequest(`/api/drafts/${id}`, { method: 'DELETE', token: authToken });
      const list = await apiRequest<{ drafts: DraftSummary[] }>('/api/drafts', { token: authToken });
      const nextDrafts = list.drafts ?? [];
      setDrafts(nextDrafts);
      setDraftAnnotation('');
      if (activeDraft?.id === id) {
        const nextId = nextDrafts.find((draft) => draft.id !== id)?.id;
        if (nextId) {
          const response = await apiRequest<{ draft: ReviewPackDraft }>(`/api/drafts/${nextId}`, { token: authToken });
          setActiveDraft(response.draft);
        } else {
          setActiveDraft(null);
        }
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Failed to delete draft');
    }
  }

  async function createDailyDraft() {
    if (!authToken) return;
    try {
      const response = await apiRequest<{ draft: ReviewPackDraft }>('/api/drafts', { method: 'POST', token: authToken, body: { kind: 'daily_review_pack', minutes: 30 } });
      setActiveDraft(response.draft);
      setDraftAnnotation('');
      await refreshDrafts(response.draft.id);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Failed to create draft');
    }
  }

  async function publishDraftAsDailyPractice(id: string) {
    if (!authToken) return;
    try {
      const response = await apiRequest<{ practice: DailyPractice }>(`/api/drafts/${id}/publish-daily-practice`, {
        method: 'POST',
        token: authToken,
        body: { date: todayDateKey(), title: drafts.find((draft) => draft.id === id && isTopicDraft(draft))?.title },
      });
      setActiveDailyPractice(response.practice);
      await Promise.all([refreshDailyPractices(response.practice.id), refreshDrafts(id)]);
      window.location.hash = routeHash('daily-practice', 'questions', response.practice.id);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : labels.publishDraftFailed);
    }
  }

  async function createDraftFromSelection(ids: string[]) {
    if (!authToken || !ids.length) return null;
    try {
      const selectedDrafts = await Promise.all(ids.map(async (id) => {
        const response = await apiRequest<{ draft: ReviewPackDraft }>(`/api/drafts/${id}`, { token: authToken });
        return response.draft;
      }));
      const createdAt = new Date().toISOString();
      const response = await apiRequest<{ draft: ReviewPackDraft }>('/api/drafts', {
        method: 'POST',
        token: authToken,
        body: {
          title: `${labels.organizedDraftTitle} ${new Intl.DateTimeFormat(locale).format(new Date())}`,
          content: {
            kind: 'organized_review_pack',
            generated_at: createdAt,
            source_draft_ids: ids,
            sections: [
              {
                title: labels.organizedDraftSourceSection,
                body: labels.organizedDraftSourceBody,
                items: selectedDrafts.map((draft) => ({ id: draft.id, title: draft.title, status: draft.status, updated_at: draft.updated_at })),
              },
            ],
            source_drafts: selectedDrafts.map((draft) => ({
              id: draft.id,
              title: draft.title,
              content: draft.content,
              annotations: draft.annotations,
            })),
          },
        },
      });
      setActiveDraft(response.draft);
      setDraftAnnotation('');
      await refreshDrafts(response.draft.id);
      setActiveDraftDetailId(response.draft.id);
      return response.draft.id;
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Failed to organize selected drafts');
      return null;
    }
  }

  async function selectDraft(id: string) {
    if (!authToken) return;
    try {
      const response = await apiRequest<{ draft: ReviewPackDraft }>(`/api/drafts/${id}`, { token: authToken });
      setActiveDraft(response.draft);
      setDraftAnnotation('');
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Failed to load draft');
    }
  }

  async function updateDraft(id: string, input: { title: string; content: unknown }) {
    if (!authToken) return;
    try {
      const response = await apiRequest<{ draft: ReviewPackDraft }>(`/api/drafts/${id}`, {
        method: 'PATCH',
        token: authToken,
        body: input,
      });
      setActiveDraft(response.draft);
      setDraftAnnotation('');
      await refreshDrafts(response.draft.id);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Failed to update draft');
      throw error;
    }
  }

  async function saveDraftAnnotation() {
    if (!authToken || !activeDraft || !draftAnnotation.trim()) return;
    try {
      const response = await apiRequest<{ draft: ReviewPackDraft }>(`/api/drafts/${activeDraft.id}/annotations`, { method: 'POST', token: authToken, body: { body: draftAnnotation } });
      setActiveDraft(response.draft);
      setDraftAnnotation('');
      await refreshDrafts(response.draft.id);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Failed to save annotation');
    }
  }

  async function saveQuestionReview(id: string, body: string) {
    const response = await apiRequest<{ draft: ReviewPackDraft }>(`/api/drafts/${id}/annotations`, { method: 'POST', token: authToken, body: { body } });
    setActiveDraft(response.draft);
  }

  async function finalizeReviewedDraft(id: string) {
    const latest = await apiRequest<{ draft: ReviewPackDraft }>(`/api/drafts/${id}`, { token: authToken });
    const content = latest.draft.content as Record<string, unknown>;
    const questions = [content.generated_practice, content.quiz, content.practice_questions, content.review_questions].find((list) => Array.isArray(list) && list.length) as unknown[] | undefined;
    const confirmations = new Map<string, boolean>();
    for (const annotation of latest.draft.annotations) {
      try {
        const entry = JSON.parse(annotation.body);
        if (entry.kind === 'question_review') confirmations.set(entry.key, entry.confirmed === true);
      } catch { /* Free-text annotations do not confirm a question. */ }
    }
    if (!questions?.length || !questions.every((question, index) => (confirmations.get(JSON.stringify([index, question])) ?? true))) {
      setActiveDraft(latest.draft);
      throw new Error('题目或确认状态有更新，请重新检查后生成最终版。');
    }
    const finalQuestions = questions.map((value, index) => {
      const question = value as Record<string, unknown>;
      const choices = Array.isArray(question.choices) ? question.choices.map(String) : [];
      const rawAnswer = String(question.answer ?? '');
      const answerIndex = Number.isInteger(question.answerIndex) ? Number(question.answerIndex)
        : /^[1-9]\d*$/.test(rawAnswer) ? Number(rawAnswer) - 1 : choices.indexOf(rawAnswer);
      if (choices.length < 2 || answerIndex < 0 || answerIndex >= choices.length) throw new Error(`第 ${index + 1} 题的答案不完整，请先编辑草稿。`);
      return { ...question, answerIndex, kind: question.kind ?? question.type, target: question.target ?? question.promptTarget };
    });
    await apiRequest(`/api/drafts/${id}`, { method: 'PATCH', token: authToken, body: {
      title: latest.draft.title,
      content: { ...content, sections: [{ id: 'reviewed', title: latest.draft.title, questions: finalQuestions }] },
    } });
    await apiRequest(`/api/drafts/${id}/confirm`, { method: 'POST', token: authToken, body: { unknownWords: '' } });
    const response = await apiRequest<{ practice: DailyPractice }>(`/api/drafts/${id}/publish-daily-practice`, { method: 'POST', token: authToken, body: { date: todayDateKey() } });
    setActiveDailyPractice(response.practice);
    await Promise.all([refreshDailyPractices(response.practice.id), refreshDrafts(id)]);
    window.location.hash = routeHash('daily-practice', 'questions', response.practice.id);
  }

  async function copyDraftRevisionContext() {
    if (!authToken || !activeDraft) return;
    try {
      const context = await apiRequest<Record<string, unknown>>(`/api/drafts/${activeDraft.id}/revision-context`, { token: authToken });
      await navigator.clipboard.writeText(JSON.stringify(context, null, 2));
      setAuthError(labels.revisionContextCopied);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Failed to copy revision context');
    }
  }

  async function confirmDraftForAgent(id: string, input: { unknownWords: string }) {
    if (!authToken) return;
    try {
      const context = await apiRequest<{ agent_message?: string }>(`/api/drafts/${id}/confirm`, {
        method: 'POST',
        token: authToken,
        body: input,
      });
      if (context.agent_message) {
        await navigator.clipboard.writeText(context.agent_message);
      }
      await refreshDrafts(id);
      setAuthError(labels.draftAgentPromptCopied);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Failed to confirm draft');
    }
  }

  const listeningProgressRef = useRef(progress);
  listeningProgressRef.current = progress;
  async function saveListeningPractice(item: ListeningQuestion, sessionId: string) {
    if (!authToken) throw new Error('请先登录');
    const save = pendingPracticeSave.current.catch(() => undefined).then(async () => {
      const key = listeningPracticeKey(item);
      const previous = listeningProgressRef.current[key];
      const entry = recordListeningPractice(previous, sessionId, new Date().toISOString());
      if (entry === previous) return;
      await apiRequest<StudyState>('/api/study-state/practice', {
        method: 'PUT', token: authToken, timeoutMs: 15000, body: { progress: { [key]: entry } },
      });
      listeningProgressRef.current = { ...listeningProgressRef.current, [key]: entry };
      setProgress((current) => ({ ...current, [key]: entry }));
    });
    pendingPracticeSave.current = save;
    await save;
  }

  async function createListeningQuestion(input: ListeningQuestionInput) {
    if (!authToken) return;
    const response = await apiRequest<{ question: ListeningQuestion }>('/api/listening-questions', {
      method: 'POST',
      token: authToken,
      body: input,
    });
    setListeningQuestions((current) => [response.question, ...current.filter((item) => item.id !== response.question.id)]);
  }

  async function removeListeningQuestion(id: string) {
    if (!authToken) return;
    await apiRequest(`/api/listening-questions/${id}`, { method: 'DELETE', token: authToken });
    setListeningQuestions((current) => current.filter((question) => question.id !== id));
  }

  async function createReadingQuestion(input: ReadingQuestionInput) {
    if (!authToken) return;
    const response = await apiRequest<{ question: ReadingQuestion }>('/api/reading-questions', {
      method: 'POST',
      token: authToken,
      body: input,
    });
    setReadingQuestions((current) => [response.question, ...current]);
  }

  async function removeReadingQuestion(id: string) {
    if (!authToken) return;
    await apiRequest(`/api/reading-questions/${id}`, { method: 'DELETE', token: authToken });
    setReadingQuestions((current) => current.filter((question) => question.id !== id));
  }

  async function saveStudyPlanProfile(profile: StudyPlanProfile) {
    if (!authToken) return;
    const response = await apiRequest<{ plan: StudyPlanDocument }>('/api/study-plan/profile', { method: 'PUT', token: authToken, body: profile });
    setStudyPlan(response.plan);
  }

  async function updateStudyPlanTask(id: string, status: StudyPlanTaskStatus) {
    if (!authToken) return;
    const response = await apiRequest<{ plan: StudyPlanDocument }>(`/api/study-plan/tasks/${id}`, { method: 'PATCH', token: authToken, body: { status } });
    setStudyPlan(response.plan);
  }

  async function rateMemoryItem(item: VocabItem, rating: MemoryRating) {
    const now = new Date();
    const current = progress[item.id] ?? { correct: 0, wrong: 0, status: 'new' as const };
    const intervals: Record<MemoryRating, number> = { forgot: 0, hard: 1, remembered: 3, easy: 7 };
    const easeDelta: Record<MemoryRating, number> = { forgot: -0.2, hard: -0.05, remembered: 0.05, easy: 0.15 };
    const nextDate = new Date(now);
    if (rating === 'forgot') nextDate.setMinutes(nextDate.getMinutes() + 10);
    else nextDate.setDate(nextDate.getDate() + intervals[rating]);
    const nextEntry: ProgressEntry = {
      ...current,
      correct: current.correct + (rating === 'forgot' ? 0 : 1),
      wrong: current.wrong + (rating === 'forgot' ? 1 : 0),
      status: rating === 'forgot' ? 'learning' : (current.reviewCount ?? 0) >= 4 ? 'mastered' : 'review',
      firstSeenAt: current.firstSeenAt ?? now.toISOString(),
      lastReviewedAt: now.toISOString(),
      reviewCount: (current.reviewCount ?? 0) + 1,
      ease: Math.max(1.3, Math.min(3, (current.ease ?? 2.5) + easeDelta[rating])),
      intervalDays: intervals[rating],
      nextReviewAt: nextDate.toISOString(),
    };
    setProgress((state) => ({ ...state, [item.id]: nextEntry }));
    if (authToken) {
      const nextState = await apiRequest<StudyState>('/api/answers', {
        method: 'POST', token: authToken,
        body: { questionId: `memory-card:${item.id}`, itemId: item.id, selected: rating, correct: rating !== 'forgot', progressEntry: nextEntry },
      });
      applyStudyState(nextState);
    }
  }

  async function createCapture(input: { body: string; category: LearningCaptureCategory; context?: string; targetDeck?: Deck; targetWordbookId?: string }) {
    if (!authToken) return;
    const response = await apiRequest<{ capture: LearningCapture }>('/api/captures', { method: 'POST', token: authToken, body: input });
    setCaptures((current) => [response.capture, ...current]);
  }

  async function createWordbook(title: string, deck: Deck = 'n1_vocab') {
    if (!authToken) return null;
    const response = await apiRequest<{ wordbook: Wordbook }>('/api/wordbooks', {
      method: 'POST',
      token: authToken,
      body: { title, deck },
    });
    setWordbooks((current) => normalizeWordbooks([...current.filter((wordbook) => wordbook.id !== response.wordbook.id), response.wordbook]));
    return response.wordbook;
  }

  async function organizeItem(id: string, input: { wordbookId?: string; tags?: string[] }) {
    if (!authToken) return null;
    const response = await apiRequest<{ item: VocabItem }>(`/api/review-items/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      token: authToken,
      body: input,
    });
    setData((current) => ({ ...current, items: current.items.map((item) => item.id === response.item.id ? { ...item, ...response.item } : item) }));
    return response.item;
  }

  async function addItemImage(id: string, input: { imageBase64?: string; mime?: string; url?: string; caption?: string }) {
    if (!authToken) return null;
    const response = await apiRequest<{ item: VocabItem }>(`/api/review-items/${encodeURIComponent(id)}/images`, {
      method: 'POST',
      token: authToken,
      body: input,
      timeoutMs: 60_000,
    });
    setData((current) => ({ ...current, items: current.items.map((item) => item.id === response.item.id ? { ...item, ...response.item } : item) }));
    return response.item;
  }

  async function removeItemImage(id: string, image: string) {
    if (!authToken) return null;
    const response = await apiRequest<{ item: VocabItem }>(`/api/review-items/${encodeURIComponent(id)}/images/${encodeURIComponent(image)}`, {
      method: 'DELETE',
      token: authToken,
    });
    // images is dropped from the item when the last one goes, so replace rather than merge.
    setData((current) => ({ ...current, items: current.items.map((item) => item.id === response.item.id ? { ...response.item, reference: item.reference } : item) }));
    return response.item;
  }

  async function renameWordbook(id: string, title: string) {
    if (!authToken) return null;
    const response = await apiRequest<{ wordbook: Wordbook }>(`/api/wordbooks/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      token: authToken,
      body: { title },
    });
    setWordbooks((current) => normalizeWordbooks(current.map((wordbook) => wordbook.id === response.wordbook.id ? response.wordbook : wordbook)));
    return response.wordbook;
  }

  async function updateCaptureStatus(id: string, status: LearningCaptureStatus) {
    if (!authToken) return;
    const response = await apiRequest<{ capture: LearningCapture }>(`/api/captures/${id}`, { method: 'PATCH', token: authToken, body: { status } });
    setCaptures((current) => current.map((capture) => capture.id === id ? response.capture : capture));
  }

  function openPendingCaptures() {
    setDataTab('captures');
    navigateTo('captures');
  }

  if (authLoading && !user) return <LoadingScreen />;
  if (sessionLoadError) return <main className="mx-auto max-w-xl p-8" role="alert">
    <h1>学习数据暂时无法加载</h1>
    <p className="my-4">登录状态已保留，请重试加载。</p>
    <details className="my-4"><summary>查看详情</summary><p>{sessionLoadError}</p></details>
    <button className="cute-button-primary px-4 py-2" onClick={() => window.location.reload()}>重新加载</button>
  </main>;
  // An MCP client sent the browser to the OAuth consent page: sign in first, then approve/deny.
  const consentPage = isAgentConsentPage();
  if (!user) {
    const isPublicLanding = !consentPage && (!window.location.hash || window.location.hash === '#/' || activeView === 'about');
    if (isPublicLanding) return <PublicIntroPanel />;
    return <LoginScreen error={authError} loading={authLoading || authMode === null} onSubmit={handleAuth} firebase={authMode === 'firebase'} onGoogle={() => void handleGoogleLogin()} />;
  }
  if (consentPage) return <AgentConsentPage authToken={authToken} username={user.username} />;
  if (activeView === 'memory-review' && !memoryReviewReady) return <LoadingScreen />;
  if (activeView === 'memory-review') return <WordLookupProvider items={data.items} captures={captures} locale={locale} enabled={Boolean(authToken)} onCapture={createCapture}><FocusedMemoryReview items={memoryReviewItems} locale={locale} token={authToken} frontFields={settings.memoryCardFrontFields} backFields={settings.memoryCardBackFields} onExit={() => navigateTo('home')} onRate={rateMemoryItem} /></WordLookupProvider>;

  const captureDetailOpen = isDataManagementView(activeView) && dataTab === 'captures' && Boolean(activeCaptureDetailId);
  const draftDetailOpen = isDataManagementView(activeView) && dataTab === 'drafts' && Boolean(activeDraftDetailId);
  const attemptDetailOpen = isDataManagementView(activeView) && dataTab === 'practice' && Boolean(activeAttemptDetailId);
  const questionDetailOpen = attemptDetailOpen && attemptQuestionDetailOpen;
  const dataDetailOpen = captureDetailOpen || draftDetailOpen || attemptDetailOpen;
  const showMobileBackHeader = !isMobileTabRoute(route) || dataDetailOpen;
  const mobileBackRouteValue = mobileBackRoute(route);
  const desktopBackRouteValue = desktopBackRoute(route);
  const detailTitle = route.page === 'words' && route.itemId
    ? (route.view === 'reading' ? readingQuestions.find((item) => item.id === route.itemId)?.title
      : route.view === 'listening' ? listeningQuestions.find((item) => item.id === route.itemId)?.title
      : data.items.find((item) => item.id === route.itemId)?.original)
    : undefined;
  const listeningDetailReference = route.view === 'listening' && route.page === 'words' && route.itemId
    ? listeningQuestions.find((item) => item.id === route.itemId)?.reference
    : undefined;
  const pageCrumbs = routeBreadcrumbs(route, labels, dataTab, draftDetailOpen ? activeDraft?.title : undefined, detailTitle, locale, listeningDetailReference);
  if (authoringLocation) pageCrumbs.push({ label: authoringLocation.label });
  const parentCrumbRoute = pageCrumbs.at(-2)?.route;
  const defaultDataTab = dataTabForRoute(activeView);
  const dataManagementBackAction = dataDetailOpen
    ? () => {
        if (questionDetailOpen) {
          setAttemptQuestionDetailOpen(false);
          return;
        }
        setActiveCaptureDetailId(null);
        setActiveDraftDetailId(null);
        setActiveAttemptDetailId(null);
      }
    : isDataManagementView(activeView) && dataTab !== defaultDataTab
      ? () => setDataTab(defaultDataTab)
      : undefined;
  const dataManagementBackLabel = questionDetailOpen ? labels.historyBackToAttemptQuestions : captureDetailOpen ? labels.historyBackToCaptures : draftDetailOpen ? labels.draftBackToList : attemptDetailOpen ? labels.historyBackToAttempts : dataTabLabel(dataTab, labels);
  const mobileStudyModeLabel = studyPage === 'tips'
    ? labels.navQuestionTypes
    : studyPage === 'words'
      ? libraryPageLabel
      : studyPage === 'review'
        ? labels.reviewPage
        : labels.questionPage;
  const selectedMobileWordbook = wordbooks.find((wordbook) => wordbook.id === selectedWordbookId);
  const isLibraryEntryPage = ['vocabulary', 'grammar'].includes(activeView) && studyPage === 'words' && !route.itemId;
  const studyItemDetailOpen = studyPage === 'words' && Boolean(route.itemId);
  const mobileFilterLabel = selectedWordbookId !== 'all' && selectedMobileWordbook
    ? selectedMobileWordbook.title
    : deckLabels[selectedDeck];
  const showMobileStudyFilter = hasStudyControls && (activeView === 'vocabulary' || activeView === 'grammar') && studyPage !== 'words' && !studyItemDetailOpen;
  const mobileHeaderBackLabel = questionDetailOpen
    ? labels.historyBackToAttemptQuestions
    : studyItemDetailOpen
      ? labels.backToEntryList
      : (route.view === 'vocabulary' || route.view === 'grammar') && route.page === 'wordbooks'
        ? labels.backToEntryList
      : dataDetailOpen
        ? dataManagementBackLabel
        : (labels.mobileBack ?? (locale === 'ja' ? '戻る' : locale === 'en' ? 'Back' : '返回上一页'));
  const activePracticeTitle = activeView === 'daily-practice'
    ? (activeDailyPractice && (topicDraftForPractice(activeDailyPractice, drafts)?.title || activeDailyPractice.title)) || labels.dailyPracticeTitle
    : activeView === 'mixed' ? (locale === 'zh-CN' ? '综合练习 · 每组 20 题' : locale === 'ja' ? '総合練習 · 20問ずつ' : 'Mixed practice · 20 questions') : labels.meaningTypeTitle;
  function withPracticeName(attempt: PracticeAttempt): PracticeAttempt {
    if (attempt.title?.trim()) return attempt;
    if (activeView === 'daily-practice' && activeDailyPractice) {
      return { ...attempt, title: activePracticeTitle, practiceId: activeDailyPractice.id };
    }
    if (activeView === 'mixed') return { ...attempt, title: activePracticeTitle };
    return attempt;
  }
  const mobileHeaderTitle = authoringLocation?.label || detailTitle || (activeView === 'daily-practice' && (studyPage === 'questions' || studyPage === 'review')
    ? activePracticeTitle
    : activeView === 'plan' && route.itemId
      ? ({ daily: locale === 'ja' ? '毎日の学習' : locale === 'en' ? 'Daily learning' : '每天学什么', overview: locale === 'ja' ? '試験までの予定' : locale === 'en' ? 'Exam preparation' : '备考安排', adjust: locale === 'ja' ? '計画を調整' : locale === 'en' ? 'Adjust plan' : '调整计划', textbooks: locale === 'ja' ? '教材の学習予定' : locale === 'en' ? 'Textbook plan' : '教材计划' }[route.itemId] ?? labels.planTitle)
    : activeView === 'settings' && route.itemId
      ? settingsSectionMobileTitle(route.itemId, labels, settings.locale)
    : isLibraryEntryPage ? (activeView === 'vocabulary' ? labels.navVocabulary : labels.navGrammar) : mobileAppTitle(route, labels, locale, isDataManagementView(activeView) ? dataTab : undefined, {
      capture: captureDetailOpen,
      draft: draftDetailOpen,
      attempt: attemptDetailOpen,
      question: questionDetailOpen,
    }));

  const pageKind = dataDetailOpen || studyItemDetailOpen || (['market', 'news-cycle'].includes(activeView) && route.itemId)
    ? 'detail'
    : (hasStudyControls && studyPage !== 'words' && studyPage !== 'tips') || (activeView === 'mock-exams' && route.itemId)
      ? 'practice'
      : isMobileTabRoute(route) && activeView !== 'market'
        ? 'entry'
        : activeView === 'plan' || activeView === 'settings' ? 'function' : 'list';

  return (
    <AuthoringNavigation.Provider value={setAuthoringLocation}>
    <main className="cute-shell flex min-h-[100dvh] max-w-full flex-col overflow-x-hidden text-[#28312d]">
      <GlobalSearch open={searchOpen} query={searchQuery} results={searchResults} labels={labels} onQueryChange={setSearchQuery} onOpenResult={openSearchResult} onClose={() => setSearchOpen(false)} />
      <MobileAppHeader
        onSearch={pagedVocabulary ? undefined : () => setSearchOpen(true)}
        filterLabel={pagedVocabulary ? wordbooks.find((book) => book.id === selectedWordbookId)?.title ?? labels.deckAll : undefined}
        onHeaderFilter={pagedVocabulary ? () => setMobileStudyPanel('filter') : undefined}
        searchLabel={labels.searchOpen}
        title={mobileHeaderTitle}
        backLabel={mobileHeaderBackLabel}
        showBack={showMobileBackHeader}
        onBack={() => {
          if (authoringLocation) { authoringLocation.close(); return; }
          if (dataManagementBackAction) {
            dataManagementBackAction();
            return;
          }
          window.location.hash = routeHash(mobileBackRouteValue.view, mobileBackRouteValue.page, mobileBackRouteValue.itemId);
        }}
        actionLabel={undefined}
        onAction={undefined}
        // Mobile pages should keep the header focused on navigation. The desktop
        // study/filter controls remain available in the full layout.
        studyActionLabel={undefined}
        studyActionAriaLabel={undefined}
        onStudyAction={undefined}
        filterActionLabel={undefined}
        filterActionAriaLabel={undefined}
        onFilterAction={undefined}
      />
      <div className="app-frame flex min-w-0 flex-1 md:items-stretch">
        <DesktopSidebarNavigation
          brand="JLPT Master Deck"
          items={desktopSidebarNavItems(labels)}
          route={route}
          labels={labels}
          username={user.username}
          collapsed={desktopSidebarCollapsed}
          mobileOpen={mobileSidebarOpen}
          onNavigate={navigateTo}
          onSettings={() => navigateTo('settings')}
          onLogout={handleLogout}
          onToggle={() => setDesktopSidebarCollapsed((value) => { try { localStorage.setItem('jlpt.sidebar.collapsed', String(!value)); } catch { /* Storage may be unavailable. */ } return !value; })}
          onMobileClose={() => setMobileSidebarOpen(false)}
        />

        <div className="app-content flex min-w-0 flex-1 flex-col" data-page-kind={pageKind}>
      <DesktopPageHeader
        breadcrumbs={pageCrumbs.map((crumb, index, crumbs) => ({
          label: crumb.label,
          onClick: () => {
            if (index === crumbs.length - 1) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
            authoringLocation?.close();
            if (crumb.route) navigateTo(crumb.route.view, crumb.route.page, crumb.route.itemId);
          },
        }))}
        title={mobileHeaderTitle}
        labels={labels}
        showBack={showMobileBackHeader}
        onBack={() => {
          if (authoringLocation) { authoringLocation.close(); return; }
          if (dataManagementBackAction) { dataManagementBackAction(); return; }
          if (parentCrumbRoute) { navigateTo(parentCrumbRoute.view, parentCrumbRoute.page, parentCrumbRoute.itemId); return; }
          window.location.hash = routeHash(mobileBackRouteValue.view, mobileBackRouteValue.page, mobileBackRouteValue.itemId);
        }}
        onSearch={pagedVocabulary ? undefined : () => setSearchOpen(true)}
        filterLabel={pagedVocabulary ? wordbooks.find((book) => book.id === selectedWordbookId)?.title ?? labels.deckAll : undefined}
        onHeaderFilter={pagedVocabulary ? () => setMobileStudyPanel('filter') : undefined}
      />

          <div className="hidden border-b border-[#f0d4dd] bg-white/70 px-4 py-3 md:block">
            <div className="mx-auto flex max-w-7xl items-center justify-between gap-5">
              <DesktopLocationBar
                route={route}
                labels={labels}
                backRoute={desktopBackRouteValue}
                backLabel={dataManagementBackLabel}
                backAction={dataManagementBackAction}
                activeDataTab={isDataManagementView(activeView) ? dataTab : undefined}
                activeDraftTitle={draftDetailOpen ? activeDraft?.title : undefined}
                onNavigate={(nextRoute) => {
                  window.location.hash = routeHash(nextRoute.view, nextRoute.page, nextRoute.itemId);
                }}
              />
              <div className="ledger-kid-top-actions" aria-label="今天的快捷操作">
                <span className="ledger-kid-sync"><i />{pageLoading ? '正在加载…' : '已准备好'}</span>
                <button type="button" className="ledger-kid-primary-action" onClick={() => navigateTo('mixed')}>
                  开始练习
                </button>
              </div>
            </div>
          </div>

          {authError ? <AppNoticeDialog message={authError} onDismiss={() => setAuthError('')} /> : null}

          {pageLoading ? <div className="flex min-h-64 flex-1 items-center justify-center p-8" role="status" aria-live="polite" aria-busy="true">
            <div className="rounded-2xl border border-[#f0d4dd] bg-white px-8 py-6 text-center shadow-sm">
              <span className="mx-auto mb-3 block h-6 w-6 animate-spin rounded-full border-2 border-[#f0d4dd] border-t-[#a84269]" aria-hidden="true" />
              正在加载{mobileHeaderTitle}…
            </div>
          </div> : null}
          {!pageLoading && activeView === 'home' ? (
            <HomeDashboard
              token={authToken}
              username={user.username}
              labels={labels}
              locale={locale}
              hasMemoryReview={hasMemoryReview}
              plan={studyPlan}
              todayPractices={homeTodayPractices}
              latestDraft={latestHomeDraft}
              onOpenDraft={(id) => {
                setActiveDraft(null);
                setActiveDraftDetailId(id);
                navigateTo('drafts');
                void selectDraft(id);
              }}
              onNavigate={navigateTo}
              onStartDailyPractice={openDailyPractice}
              onCreateDailyPractice={createDailyPracticeAndStart}
              onOpenPracticeHistory={() => navigateTo('history')}
              onStartMock={() => openMockExam()}
              onTaskStatus={updateStudyPlanTask}
            />
          ) : null}

          {!pageLoading && !practiceFailed && activeView !== 'home' ? (
            <section className={`mx-auto w-full min-w-0 flex-1 ${['mixed', 'history', 'insights', 'plan'].includes(activeView) && !route.itemId ? 'mobile-entry-shell' : ''} ${hasStudyControls ? 'max-w-6xl px-0 py-0 md:px-8 md:py-5 lg:px-10' : 'max-w-7xl px-4 py-4 md:px-8 md:py-5 lg:px-10'}`}>
          <div className={hasStudyControls || activeView === 'listening' ? 'min-w-0 space-y-5' : 'min-w-0'}>
            {activeView === 'settings' && authMode === 'firebase' && !firebaseLinked && (!route.itemId || route.itemId === 'account') ? <section className="mb-5 rounded-xl border p-4"><h2>Google 登录</h2><p className="my-2 text-sm">绑定当前账号，今后使用 Google 登录即可保留这里的学习记录。</p>{!firebaseLinked && <button type="button" className="cute-button-secondary px-4 py-2" disabled={authLoading} onClick={() => void handleGoogleLogin(true)}>绑定当前账号到 Google</button>}{authError && <p role="alert">{authError}</p>}{authNotice && <p role="status">{authNotice}</p>}</section> : null}
            {activeView === 'market' ? <Suspense fallback={<p role="status">正在加载分享…</p>}><MarketPanel onAdded={refreshAddedShare} initialShareId={route.itemId} token={authToken} labels={labels} settings={settings} locale={locale} /></Suspense> : null}
            {activeView === 'capture' ? <CapturePanel labels={labels} deckLabels={deckLabels} wordbooks={wordbooks} onSave={createCapture} onCreateWordbook={createWordbook} onOpenHistory={() => navigateTo('captures')} /> : null}
            {activeView === 'history' || activeView === 'insights' || activeView === 'captures' || activeView === 'drafts' ? (
              <DataManagementPanel
                key={activeView}
                labels={labels}
                locale={locale}
                captures={captures}
                items={data.items}
                showRuby={settings.showExplanationRuby}
                attempts={attemptHistory}
                questions={historyQuestions}
                draftsContent={<DraftsPanel onSaveQuestionReview={saveQuestionReview} onFinalizeReviewedDraft={finalizeReviewedDraft} embedded labels={labels} drafts={drafts} activeDraft={activeDraft} annotation={draftAnnotation} onAnnotationChange={setDraftAnnotation} onCreateDailyDraft={createDailyDraft} onSelectDraft={selectDraft} onSaveAnnotation={saveDraftAnnotation} onCopyRevisionContext={copyDraftRevisionContext} onCreateDraftFromSelection={createDraftFromSelection} onDeleteDraft={removeDraft} onConfirmDraft={confirmDraftForAgent} onPublishDraft={publishDraftAsDailyPractice} onUpdateDraft={updateDraft} detailDraftId={activeDraftDetailId} onDetailDraftChange={setActiveDraftDetailId} />}
                settingsContent={<SettingsView labels={labels} settings={settings} username={user.username} authToken={authToken} activeSection={route.itemId} onOpenSection={(section) => { window.location.hash = `#/settings/${section}`; }} onLogout={handleLogout} onUpdateSettings={updateSettings} />}
                activeTab={dataTab}
                isHome={activeView === 'insights' || activeView === 'history'}
                detailOpen={captureDetailOpen || attemptDetailOpen || draftDetailOpen}
                recordSection={activeView === 'history' && route.itemId === 'today' ? 'today' : activeView === 'history' && route.itemId === 'history' ? 'history' : 'home'}
                activeCaptureId={activeCaptureDetailId}
                onActiveCaptureChange={setActiveCaptureDetailId}
                activeAttemptId={activeAttemptDetailId}
                onActiveAttemptChange={(id) => {
                  setActiveAttemptDetailId(id);
                  setAttemptQuestionDetailOpen(false);
                }}
                attemptQuestionDetailOpen={attemptQuestionDetailOpen}
                onAttemptQuestionDetailChange={setAttemptQuestionDetailOpen}
                onCaptureStatus={updateCaptureStatus}
              />
            ) : null}
            {activeView === 'mistakes' || activeView === 'memory' || activeView === 'data' || activeView === 'mcp' ? <RecordsOverview questionStatus={mistakeQuestionsStatus} view={activeView} items={data.items} progress={progress} attempts={attemptHistory} questions={historyQuestions} locale={locale} onOpenMemoryReview={() => navigateTo('memory-review')} onOpenSettings={() => navigateTo('settings')} /> : null}
            {hasStudyControls ? (
              <MobileStudyControls
                mode={studyPage}
                labels={labels}
                deckLabels={deckLabels}
                selectedDeck={selectedDeck}
                wordbooks={wordbooks}
                selectedWordbookId={selectedWordbookId}
                allowDeckFilter={activeView === 'vocabulary' && !pagedVocabulary}
                allowWordbookFilter={activeView === 'vocabulary' || activeView === 'grammar'}
                wordbookFamily={activeView === 'grammar' ? 'grammar' : 'vocabulary'}
                allowWords={hasLibraryPage}
                wordsLabel={libraryPageLabel}
                panel={mobileStudyPanel}
                onPanelChange={setMobileStudyPanel}
                onModeChange={(page) => navigateTo(activeView, page)}
                onDeckChange={setSelectedDeck}
                onWordbookChange={(id) => {
                  setSelectedDeck(id === 'all' ? 'all' : wordbooks.find((book) => book.id === id)?.deck ?? 'all');
                  setSelectedWordbookId(id);
                  setActiveIndex(0);
                  setMobileStudyPanel(null);
                }}
              />
            ) : null}
            {activeView === 'profile' ? (
              <UserProfilePanel user={user} locale={locale} attempts={attemptHistory} captures={captures} progress={progress} plan={studyPlan} itemCount={data.items.length} onLogout={handleLogout} />
            ) : null}
            {activeView === 'about' ? (
              <AboutPanel labels={labels} user={user} locale={locale} authToken={authToken} section={route.itemId} />
            ) : null}
            {activeView === 'plan' ? (
              <StudyPlanPanel
                key={route.itemId ?? 'plan-home'}
                section={route.itemId}
                labels={labels}
                locale={locale}
                plan={studyPlan}
                drafts={drafts}
                captures={captures}
                attempts={attemptHistory}
                listeningQuestions={listeningQuestions}
                readingQuestions={readingQuestions}
                onSaveProfile={saveStudyPlanProfile}
                onTaskStatus={updateStudyPlanTask}
              />
            ) : null}
            {activeView === 'mock-exams' ? (
              route.itemId ? <MockExamPanel key={route.itemId} examId={route.itemId} locale={locale} onBack={() => openMockExam()} /> : <MockExamCatalog locale={locale} onOpen={openMockExam} />
            ) : null}
            {activeView === 'news-cycle' ? (
              <NewsCyclePanel
                locale={locale}
                token={authToken}
                selection={route.itemId}
                onOpenCycle={(cycleId) => { window.location.hash = routeHash('news-cycle', 'questions', cycleId); }}
                onOpenDay={(cycleId, date) => { window.location.hash = routeHash('news-cycle', 'questions', `${cycleId}:${date}`); }}
                onPracticeCycle={(cycleId) => { window.location.hash = routeHash('news-cycle', 'questions', `${cycleId}:practice`); }}
                onBack={() => navigateTo('news-cycle')}
              />
            ) : null}
            {activeView === 'question-types' ? (
              route.itemId ? (
                <QuestionTypeDetail id={route.itemId} labels={labels} locale={locale} customTip={settings.questionTypeTips[route.itemId]} customTipEntry={settings.customQuestionTypeTips.find((entry) => entry.id === route.itemId)} onBack={() => navigateTo('question-types')} onUpdateTip={updateQuestionTypeTip} onUpdateCustomTip={updateCustomQuestionTypeTip} onDeleteCustomTip={deleteCustomQuestionTypeTip} />
              ) : (
                <QuestionTypeGuide labels={labels} locale={locale} customTips={settings.questionTypeTips} customTipEntries={settings.customQuestionTypeTips} onOpen={openQuestionType} onCreateCustomTip={createCustomQuestionTypeTip} />
              )
            ) : null}
            {activeView === 'settings' ? (
              <SettingsView labels={labels} settings={settings} username={user.username} authToken={authToken} activeSection={route.itemId} onOpenSection={(section) => { window.location.hash = `#/settings/${section}`; }} onLogout={handleLogout} onUpdateSettings={updateSettings} />
            ) : null}
            {isOfficialSampleModule(activeView) && studyPage === 'samples' ? (
              <OfficialModuleSamples
                module={activeView}
                sampleId={route.itemId}
                labels={labels}
                locale={locale}
                token={authToken}
                onOpen={(id) => openOfficialSamples(activeView, id)}
                onBack={() => openOfficialSamples(activeView)}
              />
            ) : null}
            {activeView === 'mixed' && studyPage === 'tips' ? (
              <MixedPracticeHub
                topicEntries={topicPracticeEntries}
                groupKey={route.itemId}
                labels={labels}
                questions={materializedQuestions}
                items={data.items}
                progress={progress}
                modules={moduleStats}
                captures={captures}
                drafts={drafts}
                listeningQuestions={listeningQuestions}
                readingQuestions={readingQuestions}
                studyPlan={studyPlan}
                onStart={() => navigateTo('mixed', 'questions')}
                onStartMock={() => openMockExam()}
                onNavigate={(view) => { if (view === 'daily-practice') void openDailyPractice(); else navigateTo(view); }}
                onStartModule={(view) => navigateTo(view, 'questions')}
              />
            ) : null}
            {activeView === 'mixed' && studyPage === 'words' ? (
              <MixedEntryIndexPanel
                labels={labels}
                locale={locale}
                items={data.items}
                listeningQuestions={listeningQuestions}
                readingQuestions={readingQuestions}
                onOpenModule={(view) => navigateTo(view, 'words')}
              />
            ) : null}
            {activeView === 'mixed' && studyPage === 'mock' ? (
              <MockExamPanel examId="n1-ai-demo-001" locale={locale} onBack={() => openMockExam()} />
            ) : null}
            {studyPage === 'tips' && activeView !== 'mixed' && route.itemId ? (
              <QuestionTypeDetail id={route.itemId} labels={labels} locale={locale} customTip={settings.questionTypeTips[route.itemId]} customTipEntry={settings.customQuestionTypeTips.find((entry) => entry.id === route.itemId)} onBack={() => navigateTo(activeView, 'tips')} onUpdateTip={updateQuestionTypeTip} onUpdateCustomTip={updateCustomQuestionTypeTip} onDeleteCustomTip={deleteCustomQuestionTypeTip} />
            ) : studyPage === 'tips' && supportsStudyPage(activeView) && activeView !== 'mixed' ? (
              <QuestionTypeGuide labels={labels} locale={locale} customTips={settings.questionTypeTips} customTipEntries={settings.customQuestionTypeTips} section={questionTypeSectionFor(activeView)} onOpen={(id) => { window.location.hash = routeHash(activeView, 'tips', id); }} onCreateCustomTip={createCustomQuestionTypeTip} />
            ) : null}
            {activeView === 'listening' && studyPage === 'questions' ? (
              <ListeningPanel
                mode="practice"
                labels={labels}
                locale={locale}
                token={authToken}
                questions={listeningQuestions}
                progress={progress}
                onRecordPractice={saveListeningPractice}
                onCreate={createListeningQuestion}
                onDelete={removeListeningQuestion}
                onOpenLibrary={() => navigateTo('listening', 'words')}
                onPractice={() => navigateTo('listening', 'questions')}
                onTips={() => navigateTo('listening', 'tips')}
                onReview={() => navigateTo('listening', 'review')}
              />
            ) : null}
            {activeView === 'listening' && studyPage === 'words' ? (
              <ListeningPanel
                mode="library"
                labels={labels}
                locale={locale}
                token={authToken}
                questions={listeningQuestions}
                progress={progress}
                onRecordPractice={saveListeningPractice}
                onCreate={createListeningQuestion}
                onDelete={removeListeningQuestion}
                onPractice={() => navigateTo('listening', 'questions')}
                onTips={() => navigateTo('listening', 'tips')}
                onReview={() => navigateTo('listening', 'review')}
                activeQuestionId={route.itemId}
                onOpenQuestion={(id) => { window.location.hash = routeHash('listening', 'words', id); }}
                onBackToLibrary={() => navigateTo('listening', 'words')}
              />
            ) : null}
            {activeView === 'reading' && studyPage === 'questions' ? (
              <ReadingPanel
                mode="practice"
                labels={labels}
                locale={locale}
                questions={readingQuestions}
                activeQuestionId={route.itemId}
                onBackToLibrary={() => navigateTo('reading', 'words')}
                onCreate={createReadingQuestion}
                onDelete={removeReadingQuestion}
                onOpenLibrary={() => navigateTo('reading', 'words')}
                onPractice={() => navigateTo('reading', 'questions')}
                onTips={() => navigateTo('reading', 'tips')}
                onReview={() => navigateTo('reading', 'review')}
              />
            ) : null}
            {activeView === 'reading' && studyPage === 'words' ? (
              <ReadingPanel
                mode="library"
                labels={labels}
                locale={locale}
                questions={readingQuestions}
                activeQuestionId={route.itemId}
                onBackToLibrary={() => navigateTo('reading', 'words')}
                onCreate={createReadingQuestion}
                onDelete={removeReadingQuestion}
                onPractice={() => navigateTo('reading', 'questions')}
                onTips={() => navigateTo('reading', 'tips')}
                onReview={() => navigateTo('reading', 'review')}
              />
            ) : null}
	            {studyPage !== 'samples' && studyPage !== 'tips' && studyPage !== 'mock' && !(activeView === 'mixed' && studyPage === 'words') && activeView !== 'market' && activeView !== 'capture' && activeView !== 'captures' && activeView !== 'history' && activeView !== 'insights' && activeView !== 'mistakes' && activeView !== 'memory' && activeView !== 'data' && activeView !== 'mcp' && activeView !== 'about' && activeView !== 'profile' && activeView !== 'plan' && activeView !== 'question-types' && activeView !== 'mock-exams' && activeView !== 'news-cycle' && activeView !== 'drafts' && activeView !== 'settings' && activeView !== 'listening' && activeView !== 'reading' ? (
              studyPage === 'questions' ? (
                <PracticePanel
                  token={authToken}
                  loading={batch.loading}
                  activeQuestion={activeQuestion}
                  questions={questions}
                  questionsLength={questions.length}
                  activeIndex={activeIndex}
                  answeredCount={practiceAnsweredCount}
                  complete={practiceComplete}
                  feedbackMode={effectiveFeedbackMode}
                  answers={answers}
                  items={data.items}
                  labels={labels}
                  questionTypeLabel={activePracticeTitle}
                  settings={settings}
                  onAnswer={answerQuestion}
                  onPrev={() => setActiveIndex((index) => Math.max(index - 1, 0))}
                  onNext={() => setActiveIndex((index) => nextPracticeIndex(index, questions, answers))}
                  onJump={(index) => setActiveIndex(index)}
                  onRestart={() => {
                    restartPractice();
                  }}
                  onPracticeHome={() => navigateTo('mixed', 'tips')}
                  onPrepareReview={() => submitPracticeReview(false)}
                  onReview={() => navigateTo(activeView, 'review')}
                  analysisStatus={reviewAttempt?.analysisStatus === 'completed' ? 'completed' : processingAttemptIds.current.has(reviewAttempt?.id ?? activeAttempt?.id ?? '') ? 'processing' : 'idle'}
                />
              ) : studyPage === 'wordbooks' && (activeView === 'vocabulary' || activeView === 'grammar') ? (
                <WordbookManagerPanel
                  onShareWordbook={(id, description) => shareLearningContent('wordbook', id, description)}
                  labels={labels}
                  family={activeView === 'grammar' ? 'grammar' : 'vocabulary'}
                  wordbooks={wordbooks}
                  items={items}
                  onCreateWordbook={createWordbook}
                  onRenameWordbook={renameWordbook}
                />
              ) : studyPage === 'words' && route.itemId ? (
                <WordDetailPanel
                  item={activeWord}
                  navigationItems={items}
                  wordbooks={wordbooks}
                  onOrganize={organizeItem}
                  token={authToken}
                  onAddImage={addItemImage}
                  onRemoveImage={removeItemImage}
                  index={wordIndex}
                  total={items.length}
                  showRuby={settings.showReviewRuby}
                  labels={labels}
                  locale={locale}
                  onShowRubyChange={(checked) => updateSettings({ ...settings, showReviewRuby: checked })}
                  onPrevious={() => setWordIndex((index) => previousIndex(index, items.length))}
                  onNext={() => setWordIndex((index) => nextIndex(index, items.length))}
                  onSelectIndex={(index) => {
                    const selected = items[index];
                    if (selected) window.location.hash = routeHash(activeView, 'words', selected.id);
                  }}
                />
              ) : studyPage === 'words' ? (
                <WordIndexPanel
                  items={items}
                  questions={wordIndexQuestions}
                  answers={answers}
                  progress={progress}
                  labels={labels}
                  locale={locale}
                  deckLabels={deckLabels}
                  wordbooks={wordbooks}
                  selectedWordbookId={selectedWordbookId}
                  onWordbookChange={(id) => {
                  setSelectedDeck(id === 'all' ? 'all' : wordbooks.find((book) => book.id === id)?.deck ?? 'all');
                  setSelectedWordbookId(id);
                  setActiveIndex(0);
                  setMobileStudyPanel(null);
                }}
                  onOpen={(id) => { window.location.hash = routeHash(activeView, 'words', id); }}
                  onPractice={startWordIndexPractice}
                  onTips={() => navigateTo(activeView, 'tips')}
                  onReview={() => navigateTo(activeView, 'review')}
                  captureCategory={activeView === 'vocabulary' ? 'word' : activeView === 'grammar' ? 'grammar' : undefined}
                  defaultTargetDeck={selectedDeck === 'name_reading' ? 'name_reading' : activeView === 'grammar' ? 'grammar_expression' : 'n1_vocab'}
                  pendingCaptureCount={captures.filter((capture) => capture.status === 'inbox' && capture.category === (activeView === 'grammar' ? 'grammar' : 'word')).length}
                  onOpenPendingCaptures={openPendingCaptures}
                  onSaveCapture={createCapture}
                  onCreateWordbook={createWordbook}
                  onManageWordbooks={() => navigateTo(activeView, 'wordbooks')}
                  onOrganize={organizeItem}
                />
              ) : (
                <PracticeReviewPanel
                  token={authToken}
                  attempt={reviewAttempt}
                  questions={materializedQuestions}
                  answers={answers}
                  items={data.items}
                  labels={labels}
                  practiceTitle={activePracticeTitle}
                  locale={locale}
                  showRuby={settings.showExplanationRuby}
                  onRestart={restartPractice}
                  onBackToPractice={() => navigateTo(activeView, 'questions')}
                />
              )
            ) : null}
          </div>
            </section>
          ) : null}

          <footer className="mt-auto hidden border-t border-[#f0d4dd] bg-white/70 md:block">
            <div className="mx-auto flex max-w-7xl min-w-0 flex-col gap-2 px-5 py-5 text-sm text-[#6b5a61] md:flex-row md:items-center md:justify-between md:px-8 lg:px-10">
              <p>© 2026 Itsuki. All rights reserved.</p>
              <div className="flex flex-wrap gap-4">
                <a className="font-semibold text-[#a84269] hover:underline" href="https://x.com/itsuki_maer" target="_blank" rel="noreferrer">
                  X @itsuki_maer
                </a>
                <a className="font-semibold text-[#a84269] hover:underline" href="mailto:jlpt@erzhiqian.cc">
                  jlpt@erzhiqian.cc
                </a>
                <a className="font-semibold text-[#a84269] hover:underline" href="https://github.com/erzhiqianyi/jlpt-master-deck" target="_blank" rel="noreferrer">
                  GitHub
                </a>
              </div>
            </div>
          </footer>
        </div>
      </div>
      {!showMobileBackHeader ? (
        <MobileBottomNavigation items={navItems(labels)} activeView={activeView} onNavigate={navigateTo} />
      ) : null}

    </main>
    </AuthoringNavigation.Provider>
  );
}

function routeFromHash(hash: string): AppRoute {
  const [viewValue, pageValue, itemValue, detailValue] = hash.replace(/^#\/?/, '').split('/');
  const view = isAppView(viewValue) ? viewValue : 'home';
  if (view === 'plan') {
    return { view, page: 'questions', itemId: pageValue === 'textbooks' ? pageValue : undefined };
  }
  if (view === 'market' || view === 'question-types') {
    return { view, page: 'questions', itemId: pageValue ? decodeURIComponent(pageValue) : undefined };
  }
  if (view === 'mock-exams') {
    return { view, page: 'questions', itemId: pageValue ? decodeURIComponent(pageValue) : undefined };
  }
  if (view === 'news-cycle') {
    return { view, page: 'questions', itemId: pageValue ? decodeURIComponent(pageValue) : undefined };
  }
  if (view === 'history') {
    return { view, page: 'questions', itemId: ['today', 'history'].includes(pageValue) ? pageValue : undefined };
  }
  if (view === 'about' || view === 'settings') {
    return { view, page: 'questions', itemId: pageValue ? decodeURIComponent(pageValue) : undefined };
  }
  if (view === 'profile') {
    return { view, page: 'questions' };
  }
  if (isOfficialSampleModule(view) && pageValue === 'samples') {
    return { view, page: 'samples', itemId: itemValue ? decodeURIComponent(itemValue) : undefined };
  }
  if (view === 'mixed') {
    if (pageValue === 'tips' && itemValue === 'opinion' && detailValue) {
      return { view, page: 'tips', itemId: `opinion/${detailValue}` };
    }
    const page = pageValue === 'questions' || pageValue === 'review' || pageValue === 'mock' || pageValue === 'words' ? pageValue : 'tips';
    const itemId = page === 'words' && itemValue
      ? decodeURIComponent(itemValue)
      : page === 'tips' && ['topics', 'dialogue', 'opinion'].includes(itemValue)
        ? itemValue
        : undefined;
    return { view, page, itemId };
  }
  if (view === 'daily-practice') {
    const page = pageValue === 'review' ? 'review' : 'questions';
    return { view, page, itemId: itemValue ? decodeURIComponent(itemValue) : undefined };
  }
  if (supportsStudyPage(view) && !pageValue) {
    return { view, page: defaultDesktopStudyPage(view) };
  }
  const page = pageValue === 'tips' || pageValue === 'words' || pageValue === 'wordbooks' || pageValue === 'review' ? pageValue : 'questions';
  const itemId = (page === 'tips' || page === 'words') && itemValue ? decodeURIComponent(itemValue) : undefined;
  return { view, page: supportsStudyPage(view) && (page !== 'wordbooks' || view === 'vocabulary' || view === 'grammar') ? page : 'questions', itemId };
}

function routeHash(view: AppView, page: StudyPage, itemId?: string) {
  if (view === 'mixed' && page === 'tips' && itemId?.startsWith('opinion/')) return `#/mixed/tips/${itemId}`;
  if (view === 'plan') {
    return itemId ? `#/plan/${encodeURIComponent(itemId)}` : '#/plan';
  }
  if (view === 'history') {
    return itemId ? `#/history/${encodeURIComponent(itemId)}` : '#/history';
  }
  if (view === 'market' || view === 'question-types') {
    return itemId ? `#/${view}/${encodeURIComponent(itemId)}` : `#/${view}`;
  }
  if (view === 'mock-exams') {
    return itemId ? `#/mock-exams/${encodeURIComponent(itemId)}` : '#/mock-exams';
  }
  if (view === 'news-cycle') {
    return itemId ? `#/news-cycle/${encodeURIComponent(itemId)}` : '#/news-cycle';
  }
  if (view === 'about') {
    return itemId ? `#/about/${encodeURIComponent(itemId)}` : '#/about';
  }
  if (view === 'profile') {
    return '#/profile';
  }
  if (view === 'settings') {
    return itemId ? `#/settings/${encodeURIComponent(itemId)}` : '#/settings';
  }
  if (isOfficialSampleModule(view) && page === 'samples') {
    return itemId ? `#/${view}/samples/${encodeURIComponent(itemId)}` : `#/${view}/samples`;
  }
  if (view === 'daily-practice' && itemId) return `#/${view}/${page}/${encodeURIComponent(itemId)}`;
  if (!supportsStudyPage(view)) {
    return `#/${view}`;
  }
  return itemId && (page === 'tips' || page === 'words') ? `#/${view}/${page}/${encodeURIComponent(itemId)}` : `#/${view}/${page}`;
}

function supportsStudyPage(view: AppView) {
  return view === 'vocabulary' || view === 'grammar' || view === 'mixed' || view === 'daily-practice' || view === 'reading' || view === 'listening';
}

function questionTypeSectionFor(view: AppView) {
  if (view === 'vocabulary') return 'vocabulary' as const;
  if (view === 'grammar') return 'grammar' as const;
  if (view === 'reading') return 'reading' as const;
  if (view === 'listening') return 'listening' as const;
  return undefined;
}

function isOfficialSampleModule(view: AppView): view is OfficialSampleModule {
  return view === 'grammar' || view === 'reading' || view === 'listening';
}

function isAppView(value: string): value is AppView {
  return ['market', 'capture', 'captures', 'home', 'memory-review', 'history', 'mistakes', 'memory', 'data', 'mcp', 'insights', 'plan', 'question-types', 'vocabulary', 'grammar', 'listening', 'reading', 'mixed', 'daily-practice', 'mock-exams', 'news-cycle', 'drafts', 'about', 'profile', 'settings'].includes(value);
}

function nextIndex(index: number, total: number) {
  return total ? (index + 1) % total : 0;
}

function previousIndex(index: number, total: number) {
  return total ? (index - 1 + total) % total : 0;
}

function shuffledBySeed<T>(items: T[], seed: number) {
  const result = [...items];
  let state = Math.max(1, Math.floor(seed * 2_147_483_647));
  for (let index = result.length - 1; index > 0; index -= 1) {
    state = (state * 48_271) % 2_147_483_647;
    const swapIndex = state % (index + 1);
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function nextPracticeIndex(index: number, questions: QuestionReference[], answers: AnswerState) {
  if (!questions.length) {
    return 0;
  }
  for (let offset = 1; offset <= questions.length; offset += 1) {
    const candidate = (index + offset) % questions.length;
    if (!answers[questions[candidate].id]) {
      return candidate;
    }
  }
  return nextIndex(index, questions.length);
}

function unique<T>(items: T[]) {
  return Array.from(new Set(items));
}

function uniqueById<T extends { id: string }>(items: T[]) {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}

function todayDateKey() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function createPracticeAttempt(view: AppView, deck: Deck | 'all', questions: QuestionReference[], now: Date): PracticeAttempt {
  return {
    id: `attempt-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
    startedAt: now.toISOString(),
    analysisStatus: 'idle',
    view,
    deck,
    questionIds: questions.map((question) => question.id),
    answers: [],
  };
}

function currentAttemptFor(
  attempt: PracticeAttempt | null,
  history: PracticeAttempt[],
  view: AppView,
  deck: Deck | 'all',
  questions: QuestionReference[],
  now: Date,
) {
  const questionIds = questions.map((question) => question.id);
  const sameQuestionSet = attempt
    && attempt.view === view
    && attempt.deck === deck
    && attempt.questionIds.length === questionIds.length
    && attempt.questionIds.every((id, index) => id === questionIds[index])
    && !attempt.completedAt;
  if (sameQuestionSet) return attempt;
  const resumable = history.find((candidate) => (
    !candidate.completedAt
    && candidate.view === view
    && candidate.deck === deck
    && candidate.questionIds.length === questionIds.length
    && candidate.questionIds.every((id, index) => id === questionIds[index])
  ));
  return resumable ?? createPracticeAttempt(view, deck, questions, now);
}

function attemptForReviewSubmission(
  activeAttempt: PracticeAttempt | null,
  history: PracticeAttempt[],
  answers: AnswerState,
  view: AppView,
  deck: Deck | 'all',
  questions: QuestionReference[],
  now: Date,
) {
  const answerAttemptIds = new Set(questions.map((question) => answers[question.id]?.attemptId).filter(Boolean));
  const recorded = history.find((attempt) => answerAttemptIds.has(attempt.id));
  if (recorded) return recorded;
  const questionIds = questions.map((question) => question.id);
  const matchingCompletedAttempt = history.find((attempt) => (
    Boolean(attempt.completedAt)
    && attempt.view === view
    && attempt.deck === deck
    && attempt.questionIds.length === questionIds.length
    && attempt.questionIds.every((id, index) => id === questionIds[index])
    && questions.every((question) => {
      const stored = answers[question.id];
      const attemptAnswer = attempt.answers.find((answer) => answer.questionId === question.id);
      return Boolean(stored && attemptAnswer && stored.selected === attemptAnswer.selected && stored.correct === attemptAnswer.correct);
    })
  ));
  return matchingCompletedAttempt ?? currentAttemptFor(activeAttempt, history, view, deck, questions, now);
}

function appendAttemptAnswer(attempt: PracticeAttempt, answer: AttemptAnswer): PracticeAttempt {
  return {
    ...attempt,
    answers: [...attempt.answers.filter((item) => item.questionId !== answer.questionId), answer],
  };
}

function completeAttempt(attempt: PracticeAttempt, answers: AnswerState, questions: QuestionReference[], now: Date): PracticeAttempt {
  const completedAnswers = questions.map((question) => {
    const existing = attempt.answers.find((answer) => answer.questionId === question.id);
    const stored = answers[question.id];
    return existing ?? {
      questionId: question.id,
      itemId: question.itemId,
      kind: question.kind,
      selected: stored?.selected ?? '',
      correct: Boolean(stored?.correct),
      startedAt: stored?.startedAt,
      answeredAt: stored?.answeredAt ?? now.toISOString(),
      elapsedMs: stored?.elapsedMs ?? 0,
    };
  });
  const correct = completedAnswers.filter((answer) => answer.correct).length;
  // Total time is the sum of per-question time, not wall-clock time since the attempt was opened.
  const elapsedMs = completedAnswers.reduce((sum, answer) => sum + Math.max(0, answer.elapsedMs || 0), 0);
  return {
    ...attempt,
    completedAt: now.toISOString(),
    answers: completedAnswers,
    summary: {
      total: questions.length,
      correct,
      wrong: questions.length - correct,
      accuracy: questions.length ? correct / questions.length : 0,
      elapsedMs,
    },
  };
}

function progressAfterAttempt(progress: ProgressState, answers: AnswerState, questions: QuestionReference[], now: Date): ProgressState {
  return questions.reduce<ProgressState>((nextProgress, question) => {
    const answer = answers[question.id];
    if (!answer) {
      return nextProgress;
    }
    const current = nextProgress[question.itemId] ?? { correct: 0, wrong: 0, status: 'new' as const };
    const nextCorrect = current.correct + (answer.correct ? 1 : 0);
    const nextWrong = current.wrong + (answer.correct ? 0 : 1);
    const schedule = nextSchedule(current, answer.correct, now);
    return {
      ...nextProgress,
      [question.itemId]: {
        ...current,
        correct: nextCorrect,
        wrong: nextWrong,
        status: nextStatus(nextCorrect, nextWrong, schedule.reviewCount),
        ...schedule,
      },
    };
  }, { ...progress });
}

function upsertAttemptHistory(history: PracticeAttempt[], attempt: PracticeAttempt) {
  return [attempt, ...history.filter((item) => item.id !== attempt.id)].slice(0, 50);
}

function latestAttemptFor(history: PracticeAttempt[], view: AppView, deck: Deck | 'all', questions: QuestionReference[]) {
  const questionIds = new Set(questions.map((question) => question.id));
  return history.find((attempt) => (
    attempt.view === view
    && attempt.deck === deck
    && attempt.completedAt
    && attempt.questionIds.some((id) => questionIds.has(id))
  ));
}

function normalizeSettings(value: Partial<DisplaySettings> | undefined): DisplaySettings {
  const rawQuestionTypeTips = value?.questionTypeTips && typeof value.questionTypeTips === 'object' ? value.questionTypeTips : {};
  const questionTypeTips = Object.fromEntries(Object.entries(rawQuestionTypeTips).filter(([key]) => key !== MEMORY_CARD_FRONT_COMPAT_KEY && key !== MEMORY_CARD_BACK_COMPAT_KEY));
  return {
    ...defaultSettings,
    ...(value ?? {}),
    locale: normalizeLocale(value?.locale),
    fontSize: value?.fontSize === 'small' || value?.fontSize === 'large' ? value.fontSize : defaultSettings.fontSize,
    memoryCardFrontFields: normalizeMemoryCardFields(value?.memoryCardFrontFields ?? compatibilityMemoryCardFields(rawQuestionTypeTips[MEMORY_CARD_FRONT_COMPAT_KEY]), defaultMemoryCardFrontFields),
    memoryCardBackFields: normalizeMemoryCardFields(value?.memoryCardBackFields ?? compatibilityMemoryCardFields(rawQuestionTypeTips[MEMORY_CARD_BACK_COMPAT_KEY]), defaultMemoryCardBackFields),
    questionTypeTips,
    customQuestionTypeTips: normalizeCustomQuestionTypeTips(value?.customQuestionTypeTips),
  };
}

function compatibilityMemoryCardFields(value: unknown) {
  return typeof value === 'string' ? value.split(',').filter(Boolean) : undefined;
}

function normalizeCustomQuestionTypeTips(value: unknown): CustomQuestionTypeTip[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is Partial<CustomQuestionTypeTip> => Boolean(item) && typeof item === 'object')
    .map((item, index) => {
      const section = item.section === 'vocabulary' || item.section === 'grammar' || item.section === 'reading' || item.section === 'listening' ? item.section : 'vocabulary';
      const id = typeof item.id === 'string' && /^custom-tip-[a-z0-9_-]{1,80}$/i.test(item.id) ? item.id : `custom-tip-legacy-${index}`;
      return {
        id,
        section,
        title: String(item.title ?? '').trim().slice(0, 80),
        description: String(item.description ?? '').trim().slice(0, 200),
        tip: String(item.tip ?? '').trim().slice(0, 2000),
        createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date().toISOString(),
        updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : new Date().toISOString(),
      };
    })
    .filter((item) => item.title && item.tip)
    .slice(0, 80);
}

function createCustomQuestionTypeTipId(entries: CustomQuestionTypeTip[]) {
  const existingIds = new Set(entries.map((entry) => entry.id));
  let id = `custom-tip-${Date.now().toString(36)}`;
  let index = 1;
  while (existingIds.has(id)) {
    id = `custom-tip-${Date.now().toString(36)}-${index}`;
    index += 1;
  }
  return id;
}

function normalizeLocale(value: unknown): Locale {
  return value === 'ja' || value === 'en' || value === 'zh-CN' ? value : defaultSettings.locale;
}


function moduleItems(items: VocabItem[], view: AppView, selectedDeck: Deck | 'all', selectedWordbookId = 'all') {
  if (view === 'home') {
    return items;
  }
  if (view === 'grammar') {
    return items.filter((item) => item.deck === 'grammar_expression' && itemInWordbook(item, selectedWordbookId));
  }
  if (view === 'capture' || view === 'history' || view === 'insights' || view === 'plan' || view === 'question-types' || view === 'listening' || view === 'reading' || view === 'daily-practice' || view === 'drafts' || view === 'about' || view === 'profile' || view === 'settings') {
    return [];
  }
  if (view === 'vocabulary') {
    const vocabItems = items.filter((item) => item.deck !== 'grammar_expression');
    const deckItems = selectedDeck === 'all' || selectedDeck === 'grammar_expression'
      ? vocabItems
      : vocabItems.filter((item) => item.deck === selectedDeck);
    return deckItems.filter((item) => itemInWordbook(item, selectedWordbookId));
  }
  if (selectedDeck === 'all') {
    return items;
  }
  return items.filter((item) => item.deck === selectedDeck);
}

function navItems(labels: Record<string, string>) {
  return routeNavItems(labels);
}

function routeNavItems(labels: Record<string, string>): AppRouteNavItem[] {
  return [
    { view: 'home' as const, label: labels.navTaskHome ?? labels.navHome, activeViews: ['daily-practice'] as AppView[] },
    { view: 'mixed' as const, label: labels.navPracticeHome ?? labels.navMixed, activeViews: ['vocabulary', 'grammar', 'listening', 'reading', 'question-types', 'mock-exams', 'news-cycle', 'drafts', 'insights', 'capture', 'memory'] as AppView[] },
    { view: 'history' as const, label: labels.navStatsHome, activeViews: ['captures', 'mistakes'] as AppView[] },
    { view: 'plan' as const, label: labels.navStudyPlan ?? labels.navPlan },
    { view: 'market' as const, label: '发现' },
    { view: 'settings' as const, label: labels.settings, activeViews: ['data', 'mcp'] as AppView[] },
  ];
}

function desktopSidebarNavItems(labels: Record<string, string>): AppRouteNavItem[] {
  return [
    { view: 'home' as const, label: labels.navTaskHome ?? labels.navHome, group: 'today', activeViews: ['daily-practice'] as AppView[] },
    {
      view: 'mixed' as const, label: labels.navPracticeHome ?? labels.navMixed, group: 'today', activeViews: ['vocabulary', 'grammar', 'listening', 'reading', 'question-types', 'mock-exams', 'news-cycle', 'drafts', 'insights', 'capture', 'memory'] as AppView[],
      children: [
        { view: 'vocabulary' as const, label: labels.navVocabulary },
        { view: 'grammar' as const, label: labels.navGrammar },
        { view: 'listening' as const, label: labels.navListening },
        { view: 'reading' as const, label: labels.navReading },
        { view: 'mixed' as const, page: 'tips' as const, itemId: 'topics', label: '专项练习' },
        { view: 'news-cycle' as const, label: '新闻学习' },
      ],
    },
    { view: 'plan' as const, label: labels.navStudyPlan ?? labels.navPlan, group: 'review' },
    {
      view: 'history' as const, label: labels.navStatsHome, group: 'record', activeViews: ['captures', 'mistakes', 'drafts'] as AppView[],
      children: [
        { view: 'history' as const, itemId: 'today', label: '今天统计' },
        { view: 'history' as const, itemId: 'history', label: '历史练习记录' },
        { view: 'mistakes' as const, label: '错题集' },
        { view: 'captures' as const, label: '输入记录' },
        { view: 'drafts' as const, label: '练习草稿' },
      ],
    },
    { view: 'market' as const, label: '发现', group: 'manage' },
    { view: 'about' as const, label: labels.aboutTitle, group: 'manage' },
    { view: 'settings' as const, label: labels.settings, group: 'manage', activeViews: ['data', 'mcp'] as AppView[] },
  ];
}

function studyModeNavItems(view: AppView, labels: Record<string, string>, allowLibrary: boolean, libraryLabel?: string): AppRouteNavItem[] {
  return [
    { view, page: 'tips', label: labels.navQuestionTypes },
    { view, page: 'questions', label: labels.questionPage },
    ...(allowLibrary ? [{ view, page: 'words' as const, label: libraryLabel ?? labels.wordPage }] : []),
    { view, page: 'review', label: labels.reviewPage },
  ];
}

function mobileAppTitle(route: AppRoute, labels: Record<string, string>, locale: Locale, activeDataTab?: DataTab, detail?: { capture: boolean; draft: boolean; attempt: boolean; question: boolean }) {
  const activeView = route.view;
  if (activeView === 'market') return route.itemId ? '分享详情' : '发现';
  if (activeView === 'about') return isAboutSection(route.itemId) ? aboutSectionTitle(route.itemId, locale) : labels.aboutTitle;
  if (activeView === 'profile') return labels.account;
  if (activeView === 'mixed' && route.page === 'tips' && !route.itemId) return labels.navPracticeHome ?? labels.navMixed;
  if (route.page === 'words' && route.itemId && ['vocabulary', 'grammar'].includes(activeView)) return labels.wordDetail;
  if (detail?.question) return labels.historyAttemptQuestionDetail;
  if (detail?.attempt) return labels.historyAttemptDetail;
  if (detail?.capture) return labels.captureDetailTitle;
  if (detail?.draft) return labels.draftPreview;
  if (activeView === 'history' && route.itemId === 'today') return labels.historyFilterToday;
  if (activeView === 'history' && route.itemId === 'history') return labels.historyPracticeTab;
  if (isDataManagementView(activeView)) {
    const visibleTab = activeDataTab ?? dataTabForRoute(activeView);
    if (visibleTab === 'captures') return labels.historyCaptureTab;
    if (visibleTab === 'practice') return labels.navStatsHome;
    return dataTabLabel(visibleTab, labels);
  }
  if (activeView === 'daily-practice') {
    return labels.dailyPracticeTitle;
  }
  if (activeView === 'question-types') {
    return labels.navQuestionTypes;
  }
  if (activeView === 'mixed' && route.page === 'tips' && route.itemId) {
    if (route.itemId === 'topics') return '专项练习';
    if (route.itemId === 'dialogue') return '对话练习';
    if (route.itemId === 'opinion' || route.itemId.startsWith('opinion/')) return '意见表达';
  }
  if (activeView === 'reading' || activeView === 'listening') {
    if (route.page === 'words') {
      if (route.itemId) return locale === 'ja' ? '教材の詳細' : locale === 'en' ? 'Material details' : '材料详情';
      return activeView === 'reading'
        ? (locale === 'ja' ? '読解ライブラリ' : locale === 'en' ? 'Reading library' : '阅读题库')
        : (locale === 'ja' ? '聴解ライブラリ' : locale === 'en' ? 'Listening library' : '听力题库');
    }
    if (route.page === 'questions') return activeView === 'reading' ? labels.readingPracticeTitle : labels.listeningPracticeTitle;
    return `${moduleLabelFor(activeView, labels)} · ${studyPageLabelFor(activeView, route.page, labels)}`;
  }
  if (['vocabulary', 'grammar', 'listening', 'reading', 'mixed'].includes(activeView)) {
    return studyPageLabelFor(activeView, route.page, labels);
  }
  if (activeView === 'mock-exams') {
    return labels.navMockExams;
  }
  if (activeView === 'news-cycle') {
    return '新闻练习';
  }
  return navItems(labels).find((item) => item.view === activeView)?.label ?? labels.brand;
}

function settingsSectionMobileTitle(section: string, labels: Record<string, string>, locale: Locale) {
  const copy = locale === 'zh-CN'
    ? { display: '显示与阅读', practice: '练习体验' }
    : locale === 'ja'
      ? { display: '表示と読みやすさ', practice: '練習体験' }
      : { display: 'Display and Reading', practice: 'Practice Experience' };
  if (section === 'display') return copy.display;
  if (section === 'practice') return copy.practice;
  if (section === 'memory') return locale === 'zh-CN' ? '记忆卡内容' : locale === 'ja' ? '記憶カードの内容' : 'Memory card content';
  if (section === 'account') return `${labels.account} / ${labels.aboutTitle}`;
  return labels.settings;
}

function isMobileTabRoute(route: AppRoute) {
  if (route.view === 'home' || (route.view === 'market' && !route.itemId) || (route.view === 'plan' && !route.itemId) || (route.view === 'history' && !route.itemId) || (route.view === 'settings' && !route.itemId)) {
    return true;
  }
  if (route.view === 'mixed') {
    return route.page === 'tips' && !route.itemId;
  }
  return false;
}

function mobileBackRoute(route: AppRoute): AppRoute {
  if (route.view === 'plan' && route.itemId) return { view: route.itemId === 'textbooks' ? 'home' : 'plan', page: 'questions' };
  if (route.view === 'market' && route.itemId) return { view: 'market', page: 'questions' };
  if (route.view === 'mixed' && route.page === 'tips' && route.itemId?.startsWith('opinion/')) return { view: 'mixed', page: 'tips', itemId: 'opinion' };
  if (route.view === 'history' && route.itemId) return { view: 'history', page: 'questions' };
  if (route.view === 'mixed' && route.page === 'tips' && route.itemId) return { view: 'mixed', page: 'tips' };
  if (['vocabulary', 'grammar', 'listening', 'reading'].includes(route.view)) {
    if (route.itemId) return { view: route.view, page: route.page };
    if (route.page !== 'words') return { view: route.view, page: 'words' };
    return { view: 'mixed', page: 'tips' };
  }

  if (route.view === 'mock-exams' && route.itemId) {
    return { view: 'mock-exams', page: 'questions' };
  }
  if (route.view === 'mock-exams') {
    return { view: 'home', page: 'questions' };
  }
  if (route.view === 'news-cycle' && route.itemId) {
    return { view: 'news-cycle', page: 'questions' };
  }
  if (route.view === 'news-cycle') {
    return { view: 'home', page: 'questions' };
  }
  if (route.view === 'mixed' && route.page !== 'tips') {
    return { view: 'home', page: 'questions' };
  }
  if (route.view === 'daily-practice') {
    return { view: 'home', page: 'questions' };
  }
  if ((route.view === 'vocabulary' || route.view === 'grammar') && route.page === 'wordbooks') {
    return { view: route.view, page: 'words' };
  }
  if (route.itemId && route.page === 'words' && ['vocabulary', 'grammar'].includes(route.view)) {
    return { view: route.view, page: 'words' };
  }
  if (['vocabulary', 'grammar', 'listening', 'reading', 'question-types'].includes(route.view)) {
    return { view: 'home', page: 'questions' };
  }
  if (route.view === 'captures') {
    return { view: 'history', page: 'questions' };
  }
  if (['history', 'insights', 'captures', 'capture', 'drafts', 'mistakes', 'memory'].includes(route.view)) {
    return { view: 'mixed', page: 'tips' };
  }
  if (route.view === 'settings' && route.itemId) {
    return { view: 'settings', page: 'questions' };
  }
  if (route.view === 'about' && route.itemId?.startsWith('guide-')) return { view: 'about', page: 'questions', itemId: 'guide' };
  if (route.view === 'about' && route.itemId) {
    return { view: 'about', page: 'questions' };
  }
  return { view: 'home', page: 'questions' };
}

function isDataManagementView(view: AppView) {
  return view === 'insights' || view === 'captures' || view === 'history' || view === 'drafts' || view === 'settings';
}

function dataTabForRoute(view: AppView): DataTab {
  if (view === 'history' || view === 'insights') return 'practice';
  if (view === 'drafts') return 'drafts';
  if (view === 'settings') return 'settings';
  return 'captures';
}

function desktopBackRoute(route: AppRoute): AppRoute | null {
  if (['vocabulary', 'grammar', 'listening', 'reading'].includes(route.view)) return mobileBackRoute(route);

  if (route.view === 'home') {
    return null;
  }
  if (route.view === 'history') {
    return route.itemId ? { view: 'history', page: 'questions' } : null;
  }
  if (route.itemId) {
    return { view: route.view, page: route.page };
  }
  if (supportsStudyPage(route.view) && route.page !== defaultDesktopStudyPage(route.view)) {
    return { view: route.view, page: defaultDesktopStudyPage(route.view) };
  }
  if (['vocabulary', 'grammar', 'listening', 'reading', 'mixed', 'daily-practice'].includes(route.view)) {
    return { view: 'home', page: 'questions' };
  }
  if (route.view === 'question-types') {
    return { view: 'home', page: 'questions' };
  }
  if (route.view === 'mock-exams') {
    return { view: 'home', page: 'questions' };
  }
  if (route.view === 'news-cycle') {
    return route.itemId ? { view: 'news-cycle', page: 'questions' } : { view: 'home', page: 'questions' };
  }
  if (route.view === 'captures') {
    return { view: 'history', page: 'questions' };
  }
  if (['history', 'insights', 'capture', 'drafts', 'mistakes', 'memory'].includes(route.view)) {
    return { view: 'mixed', page: 'tips' };
  }
  return { view: 'home', page: 'questions' };
}

function defaultDesktopStudyPage(view: AppView): StudyPage {
  if (view === 'daily-practice') return 'questions';
  return view === 'vocabulary' || view === 'grammar' || view === 'listening' || view === 'reading' ? 'words' : 'tips';
}

function routeBreadcrumbs(route: AppRoute, labels: Record<string, string>, activeDataTab?: DataTab, activeDraftTitle?: string, detailTitle?: string, locale: Locale = 'zh-CN', listeningDetailReference?: string): Array<{ label: string; route?: AppRoute }> {
  const crumbs: Array<{ label: string; route?: AppRoute }> = [
    { label: labels.navHome, route: { view: 'home', page: 'questions' } },
  ];

  if (['vocabulary', 'grammar', 'listening', 'reading', 'mixed', 'daily-practice', 'question-types'].includes(route.view)) {
    crumbs[0] = { label: '练习', route: { view: 'mixed', page: 'tips' } };
    if (route.view === 'mixed') {
      if (route.page !== 'tips' || route.itemId) crumbs.push({ label: mobileAppTitle(route, labels, 'zh-CN'), route });
      return crumbs;
    }
    if (route.view === 'question-types') {
      crumbs.push({ label: labels.navQuestionTypes });
      return crumbs;
    }
    crumbs.push({ label: moduleLabelFor(route.view, labels), route: { view: route.view, page: 'words' } });
    if (supportsStudyPage(route.view)) {
      if (route.page !== 'words') crumbs.push({ label: studyPageLabelFor(route.view, route.page, labels), route: { view: route.view, page: route.page } });
      if (route.itemId) crumbs.push({ label: route.view === 'listening' ? listeningDetailReference || '详情' : detailTitle || '详情', route });
    }
    return crumbs;
  }

  if (route.view === 'mock-exams') {
    crumbs.push({ label: labels.navMockExams });
    return crumbs;
  }

  if (route.view === 'news-cycle') {
    crumbs.push({ label: '新闻练习', route: route.itemId ? { view: 'news-cycle', page: 'questions' } : undefined });
    if (route.itemId) crumbs.push({ label: route.itemId });
    return crumbs;
  }

  if (route.view === 'about') {
    crumbs.push({ label: labels.aboutTitle, route: route.itemId ? { view: 'about', page: 'questions' } : undefined });
    if (isAboutSection(route.itemId) && route.itemId.startsWith('guide-')) crumbs.push({ label: aboutSectionTitle('guide', locale), route: { view: 'about', page: 'questions', itemId: 'guide' } });
    if (isAboutSection(route.itemId)) crumbs.push({ label: aboutSectionTitle(route.itemId, locale), route });
    return crumbs;
  }

  if (['history', 'drafts', 'settings', 'insights'].includes(route.view)) {
    crumbs.push({ label: labels.navMine, route: { view: 'insights', page: 'questions' } });
    const visibleTab = activeDataTab ?? dataTabForRoute(route.view);
    if (route.view !== 'insights' || visibleTab !== 'captures') {
      crumbs.push({ label: dataTabLabel(visibleTab, labels) });
    }
    if (visibleTab === 'drafts' && activeDraftTitle) {
      crumbs.push({ label: labels.draftPreview });
    }
    return crumbs;
  }

  crumbs.push({ label: moduleLabelFor(route.view, labels) });
  return crumbs;
}

function dataTabLabel(tab: DataTab, labels: Record<string, string>) {
  if (tab === 'captures') return labels.dataCapturesTab;
  if (tab === 'practice') return labels.navStatsHome;
  if (tab === 'drafts') return labels.dataDraftsTab;
  return labels.settings;
}

function moduleLabelFor(view: AppView, labels: Record<string, string>) {
    switch (view) {
    case 'vocabulary':
      return labels.navVocabulary;
    case 'grammar':
      return labels.navGrammar;
    case 'listening':
      return labels.navListening;
    case 'reading':
      return labels.navReading;
    case 'mixed':
      return labels.navMixed;
    case 'daily-practice':
      return labels.dailyPracticeTitle;
    case 'news-cycle':
      return '新闻练习';
    case 'plan':
      return labels.navPlan;
    case 'capture':
      return labels.navCapture;
    case 'about':
      return labels.aboutTitle ?? labels.brand;
    default:
      return labels.brand;
  }
}

function studyPageLabelFor(view: AppView, page: StudyPage, labels: Record<string, string>) {
  if (page === 'tips') return labels.navQuestionTypes;
  if (page === 'questions') return labels.questionPage;
  if (page === 'review') return labels.reviewPage;
  if (page === 'wordbooks') return labels.wordbookManage;
  if (page === 'words') return view === 'mixed' ? labels.mixedHubAllEntries : view === 'listening' || view === 'reading' ? labels.questionBankPage : labels.wordPage;
  return labels.questionPage;
}

function searchItems(items: VocabItem[], query: string, locale: Locale, labels: Record<string, string>, listening: ListeningQuestion[], readingQuestions: ReadingQuestion[]): SearchResult[] {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) {
    return [];
  }

  const vocabularyResults = items
    .map((item): SearchResult | null => {
      const moduleLabel = item.deck === 'grammar_expression' ? labels.searchModuleGrammar : labels.searchModuleVocabulary;
      const primaryFields = [item.original, item.reading, item.meaning_ja, item.paraphrase_ja, itemMeaning(item, locale)];
      const secondaryFields = [
        item.meaning_zh,
        item.core_memory,
        item.explanation_zh,
        item.source?.sentence,
        ...itemPatternTexts(item),
        ...(item.patterns?.flatMap((pattern) => [pattern.connection_zh, pattern.meaning_zh]) ?? []),
        ...(item.points?.flatMap((point) => [point.label, point.detail_zh]) ?? []),
        ...(item.images?.map((image) => image.caption) ?? []),
        itemMemory(item, locale),
        itemExplanation(item, locale),
        item.jlpt_level,
        item.part_of_speech,
        item.type,
        ...(item.tags ?? []),
        ...(item.examples?.flatMap((example) => [example.ja, example.zh]) ?? []),
        ...(item.comparisons?.flatMap((comparison) => [comparison.target, comparison.difference_zh]) ?? []),
      ];
      const fields = [...primaryFields, ...secondaryFields].filter(Boolean) as string[];
      const matches = fields.filter((field) => normalizeSearchText(field).includes(normalizedQuery));
      if (!matches.length) {
        return null;
      }

      const original = normalizeSearchText(item.original);
      const reading = normalizeSearchText(item.reading ?? '');
      const score =
        original === normalizedQuery || reading === normalizedQuery
          ? 100
          : original.startsWith(normalizedQuery) || reading.startsWith(normalizedQuery)
            ? 80
            : primaryFields.some((field) => field && normalizeSearchText(field).includes(normalizedQuery))
              ? 60
              : 30;

      return {
        item,
        id: item.id,
        view: item.deck === 'grammar_expression' ? 'grammar' : 'vocabulary',
        title: item.original,
        subtitle: itemMeaning(item, locale),
        moduleLabel,
        matches: unique(matches).slice(0, 3),
        score,
      };
    })
    .filter((result): result is SearchResult => Boolean(result));
  const questionResults = (['listening', 'reading'] as const).flatMap((view) => {
    const questions = view === 'listening' ? listening : readingQuestions;
    return questions.flatMap((question): SearchResult[] => {
      const fields = [question.title, question.question, ...question.choices, question.explanation, 'passage' in question ? question.passage : ''];
      const matches = fields.filter((field) => normalizeSearchText(field).includes(normalizedQuery));
      if (!matches.length) return [];
      return [{ id: question.id, view, title: question.title, subtitle: question.question,
        moduleLabel: view === 'listening' ? labels.navListening : labels.navReading,
        matches: unique(matches).slice(0, 3), score: normalizeSearchText(question.title) === normalizedQuery ? 100 : normalizeSearchText(question.title).includes(normalizedQuery) ? 60 : 30 }];
    });
  });
  return [...vocabularyResults, ...questionResults].sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, 'ja'));
}

function normalizeSearchText(value: string) {
  return katakanaToHiragana(value.normalize('NFKC'))
    .toLocaleLowerCase()
    .replace(/\s+/g, '')
    .trim();
}

function katakanaToHiragana(value: string) {
  return value.replace(/[\u30a1-\u30f6]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60));
}

function moduleSummaries(items: VocabItem[], labels: Record<string, string>) {
  return [
    {
      view: 'vocabulary' as const,
      title: labels.moduleVocabularyTitle,
      body: labels.moduleVocabularyBody,
      count: items.filter((item) => item.deck !== 'grammar_expression').length,
    },
    {
      view: 'grammar' as const,
      title: labels.moduleGrammarTitle,
      body: labels.moduleGrammarBody,
      count: items.filter((item) => item.deck === 'grammar_expression').length,
    },
    {
      view: 'listening' as const,
      title: labels.moduleListeningTitle,
      body: labels.moduleListeningBody,
      count: 0,
    },
    {
      view: 'reading' as const,
      title: labels.moduleReadingTitle,
      body: labels.moduleReadingBody,
      count: 0,
    },
  ];
}

function LoadingScreen() {
  return (
    <main className="cute-shell flex min-h-[100dvh] items-center justify-center px-5 text-[#28312d]" aria-label="Loading">
      <p className="cute-brand text-xl">JLPT Review</p>
    </main>
  );
}

function LoginScreen({
  firebase, onGoogle,
  error,
  loading,
  onSubmit,
}: {
  error: string;
  loading: boolean;
  firebase: boolean;
  onGoogle: () => void;
  onSubmit: (mode: 'login' | 'register', username: string, password: string) => void;
}) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  if (firebase) return <LoginLanding error={error} loading={loading} onGoogle={onGoogle}/>;

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(mode, username, password);
  }

  return (
    <main className="cute-shell flex min-h-[100dvh] items-start justify-center px-5 py-10 text-[#28312d] sm:items-center sm:px-8 sm:py-12 lg:px-12">
      <section className="cute-card w-full max-w-md bg-transparent sm:max-w-[420px] sm:border sm:p-8 lg:max-w-sm">
        <h1 className="cute-brand text-2xl">JLPT Review</h1>

        {firebase ? <div className="mt-6 space-y-4"><p>使用 Google 账号登录</p><button type="button" className="cute-button-primary h-12 w-full rounded-2xl" disabled={loading} onClick={onGoogle}>{loading ? '正在登录…' : '使用 Google 登录'}</button>{error && <p role="alert">{error}</p>}</div> : <>
        <p className="mt-3 text-sm">本地部署：首次使用请创建自己的账号密码。</p>
        <div className="mt-6 grid grid-cols-2 gap-2">
          <SegmentButton active={mode === 'login'} onClick={() => setMode('login')}>
            Login
          </SegmentButton>
          <SegmentButton active={mode === 'register'} onClick={() => setMode('register')}>
            Register
          </SegmentButton>
        </div>

        <form className="mt-6 space-y-5" onSubmit={submit}>
          <label className="block text-sm font-semibold text-[#654e58]">
            Username
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="mt-2 h-12 w-full rounded-2xl border border-[#efd1db] bg-white/90 px-3 text-base outline-none focus:border-[#d95f8a]"
              autoComplete="username"
              pattern="[A-Za-z0-9_\-]{3,32}"
              required
            />
          </label>
          <label className="block text-sm font-semibold text-[#654e58]">
            Password
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 h-12 w-full rounded-2xl border border-[#efd1db] bg-white/90 px-3 text-base outline-none focus:border-[#d95f8a]"
              type="password"
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              minLength={4}
              required
            />
          </label>
          {error ? <p className="rounded-2xl border border-[#f0cf80] bg-[#fff8df] p-3 text-sm font-semibold text-[#775516]">{error}</p> : null}
          <a href="#/about" className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-2xl border border-[#efd1db] bg-white px-4 py-2 text-sm font-semibold text-[#654e58] hover:bg-[#fff0f5]">
            查看应用介绍（不登录可读）
          </a>
          <button type="submit" disabled={loading} className="cute-button-primary h-12 w-full rounded-2xl px-4 text-sm font-semibold text-white disabled:opacity-60">
            {loading ? 'Processing...' : mode === 'register' ? 'Create account' : 'Login'}
          </button>
        </form></>}
      </section>
    </main>
  );
}

function SegmentButton({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-10 min-w-0 rounded-md border px-3 py-2 text-sm font-semibold break-words ${
        active ? 'border-[#d95f8a] bg-[#d95f8a] text-white' : 'border-[#efd1db] bg-white text-[#654e58] hover:bg-[#fff0f5]'
      }`}
    >
      {children}
    </button>
  );
}

function DesktopLocationBar({
  route,
  labels,
  backRoute,
  backLabel: explicitBackLabel,
  backAction,
  activeDataTab,
  activeDraftTitle,
  onNavigate,
}: {
  route: AppRoute;
  labels: Record<string, string>;
  backRoute: AppRoute | null;
  backLabel?: string;
  backAction?: () => void;
  activeDataTab?: DataTab;
  activeDraftTitle?: string;
  onNavigate: (route: AppRoute) => void;
}) {
  const crumbs = routeBreadcrumbs(route, labels, activeDataTab, activeDraftTitle);
  const dataContextLabels = isDataManagementView(route.view)
    ? [dataTabLabel(activeDataTab ?? dataTabForRoute(route.view), labels), activeDraftTitle ? labels.draftPreview : undefined].filter(Boolean)
    : null;
  const backLabel = explicitBackLabel ?? (crumbs.length > 1 ? crumbs[crumbs.length - 2].label : labels.navHome);
  const canGoBack = Boolean(backRoute || backAction);

  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <button
        type="button"
        disabled={!canGoBack}
        onClick={() => {
          if (backAction) {
            backAction();
            return;
          }
          if (backRoute) onNavigate(backRoute);
        }}
        aria-label={backLabel}
        title={backLabel}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#a84269] hover:bg-[#fff0f5] disabled:cursor-not-allowed disabled:text-[#cbb6bf] disabled:hover:bg-transparent"
      >
        <ArrowLeft size={18} />
      </button>
      <nav className="flex min-w-0 items-center gap-1 text-sm font-semibold" aria-label={labels.mobileNavigation}>
        {dataContextLabels ? dataContextLabels.map((label, index) => {
          const isLast = index === dataContextLabels.length - 1;
          return (
            <span key={`${label}-${index}`} className="flex min-w-0 items-center gap-1">
              {index > 0 ? <span className="text-[#c8aebb]">/</span> : null}
              <span className={`truncate px-1.5 py-1 ${isLast ? 'max-w-40 text-[#3d3036]' : 'max-w-32 text-[#7a6a70]'}`} aria-current={isLast ? 'page' : undefined}>
                {label}
              </span>
            </span>
          );
        }) : crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;
          return (
            <span key={`${crumb.label}-${index}`} className="flex min-w-0 items-center gap-1">
              {index > 0 ? <span className="text-[#c8aebb]">/</span> : null}
              {crumb.route && !isLast ? (
                <button
                  type="button"
                  onClick={() => onNavigate(crumb.route as AppRoute)}
                  className="max-w-32 truncate rounded-md px-1.5 py-1 text-[#7a6a70] hover:bg-[#fff0f5] hover:text-[#a84269]"
                >
                  {crumb.label}
                </button>
              ) : (
                <span className="max-w-40 truncate px-1.5 py-1 text-[#3d3036]" aria-current="page">
                  {crumb.label}
                </span>
              )}
            </span>
          );
        })}
      </nav>
    </div>
  );
}

function normalizeWordbooks(value: Wordbook[] | undefined) {
  const seen = new Set<string>();
  return [...(value?.length ? value : fallbackWordbooks)]
    .filter((wordbook) => wordbook?.id && wordbook.title && (wordbook.deck === 'n1_vocab' || wordbook.deck === 'name_reading' || wordbook.deck === 'grammar_expression'))
    .filter((wordbook) => {
      if (seen.has(wordbook.id)) return false;
      seen.add(wordbook.id);
      return true;
    });
}

function EmptyModule({ labels }: { labels: Record<string, string> }) {
  return (
    <section className="cute-card min-w-0 border border-dashed p-6">
      <h2 className="text-2xl font-semibold">{labels.moduleEmptyTitle}</h2>
      <p className="mt-3 text-sm leading-7 text-[#5f625b]">{labels.moduleEmptyBody}</p>
    </section>
  );
}

function HomeAction({
  active,
  eyebrow,
  title,
  body,
  onClick,
}: {
  active: boolean;
  eyebrow: string;
  title: string;
  body: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border p-4 text-left shadow-sm transition ${
        active ? 'border-[#d95f8a] bg-[#fff0f5]' : 'border-[#efd1db] bg-white hover:bg-[#fff7fb]'
      }`}
    >
      <p className="text-xs font-semibold uppercase text-[#856033]">{eyebrow}</p>
      <h2 className="mt-2 text-xl font-semibold">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-[#62645f]">{body}</p>
    </button>
  );
}

function readPracticeResume(userId: number): { hash?: string; practiceId?: string; questionId?: string } {
  try {
    const value = JSON.parse(localStorage.getItem(`jlpt-practice-resume:${userId}`) ?? '{}');
    if (!value || typeof value !== 'object') return {};
    return {
      hash: typeof value.hash === 'string' && /^#\/[a-z-]+(?:\/[^\s]*)?$/.test(value.hash) ? value.hash : undefined,
      practiceId: typeof value.practiceId === 'string' ? value.practiceId : undefined,
      questionId: typeof value.questionId === 'string' ? value.questionId : undefined,
    };
  } catch { return {}; }
}
