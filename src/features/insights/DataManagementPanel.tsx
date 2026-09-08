import { NotebookPen, History, FileCheck2 } from 'lucide-react';
import { type ReactNode } from 'react';
import type { LearningCapture, LearningCaptureStatus, Locale, PracticeAttempt, Question, VocabItem } from '../../types';
import { HistoryPanel } from '../history/HistoryPanel';
import { PracticeReviewPanel } from '../practice/StudyPanels';

export type DataTab = 'captures' | 'practice' | 'drafts' | 'settings';

export function DataManagementPanel({ labels, locale, captures, attempts, questions, draftsContent, settingsContent, activeTab, isHome, detailOpen, recordSection, activeCaptureId, onActiveCaptureChange, activeAttemptId, onActiveAttemptChange, attemptQuestionDetailOpen, onAttemptQuestionDetailChange, onCaptureStatus, items, showRuby }: {
  items: VocabItem[];
  showRuby: boolean;
  labels: Record<string, string>;
  locale: Locale;
  captures: LearningCapture[];
  attempts: PracticeAttempt[];
  questions: Question[];
  draftsContent: ReactNode;
  settingsContent?: ReactNode;
  activeTab: DataTab;
  isHome: boolean;
  detailOpen: boolean;
  recordSection?: 'home' | 'today' | 'history';
  activeCaptureId?: string | null;
  onActiveCaptureChange?: (id: string | null) => void;
  activeAttemptId?: string | null;
  onActiveAttemptChange?: (id: string | null) => void;
  attemptQuestionDetailOpen?: boolean;
  onAttemptQuestionDetailChange?: (open: boolean) => void;
  onCaptureStatus: (id: string, status: LearningCaptureStatus) => Promise<void>;
}) {
  const names = locale === 'zh-CN' ? ['学习笔记', '练习记录', '待确认的练习'] : locale === 'ja' ? ['学習メモ', '練習履歴', '練習の下書き'] : ['My notes', 'Practice log', 'Practice drafts'];
  const descriptions = locale === 'zh-CN' ? ['回看记下的单词、语法和学习笔记', '看看答过的题目和练习结果', '查看准备好的题目，确认后再练习'] : locale === 'ja' ? ['単語・文法・メモを振り返る', '解いた問題と結果を見る', '準備された問題を確認する'] : ['Revisit words, grammar and study notes', 'Review completed questions and results', 'Check prepared questions before practice'];
  const entries = [
    { tab: 'captures', route: 'captures', icon: NotebookPen },
    { tab: 'practice', route: 'history', icon: History },
    { tab: 'drafts', route: 'drafts', icon: FileCheck2 },
  ];
  const visibleTab = isHome ? 'practice' : activeTab;
  const activeIndex = entries.findIndex((entry) => entry.tab === visibleTab);
  const heading = isHome
    ? {
        eyebrow: labels.navStatsHome,
        title: labels.navStatsHome,
        body: locale === 'zh-CN'
          ? '查看今天、历史练习和输入记录。'
          : locale === 'ja'
            ? '今日・練習履歴・入力履歴を確認します。'
            : 'Check today, practice history and input records.',
      }
    : {
        eyebrow: labels.navStatsHome,
        title: names[activeIndex],
        body: descriptions[activeIndex],
      };
  const selectedAttempt = attempts.find((attempt) => attempt.id === activeAttemptId);
  if (visibleTab === 'practice' && selectedAttempt) {
    const attemptQuestions = selectedAttempt.questionIds.flatMap((id) => {
      const question = questions.find((entry) => entry.id === id);
      return question ? [question] : [];
    });
    return <>
      {attemptQuestions.length < selectedAttempt.questionIds.length ? <p className="text-sm text-[#68716c]">{locale === 'zh-CN' ? '部分原题暂不可用，答题记录仍保留。' : locale === 'ja' ? '一部の問題を表示できません。解答履歴は保存されています。' : 'Some original questions are unavailable; answer records are preserved.'}</p> : null}
      <PracticeReviewPanel key={selectedAttempt.id} attempt={selectedAttempt} questions={attemptQuestions} answers={{}} items={items} labels={{ ...labels, backToPractice: labels.historyBackToAttempts }} locale={locale} showRuby={showRuby} onRestart={() => {}} onBackToPractice={() => onActiveAttemptChange?.(null)} />
    </>;
  }
  return (
    <section className={`data-management-panel mx-auto w-full max-w-5xl py-2 md:py-5`}>
      {!detailOpen ? <header className="gentle-records-heading gentle-section-heading">
        <p>{heading.eyebrow}</p>
        <h1>{heading.title}</h1>
        {isHome || visibleTab !== 'captures' ? <span>{heading.body}</span> : null}
        {!isHome && activeTab === 'captures' ? <a href="#/capture" className="gentle-back">{locale === 'zh-CN' ? '＋ 记一点新内容' : locale === 'ja' ? '学習メモを追加' : 'Add a study note'}</a> : null}
      </header> : null}
      <>
      {activeTab === 'captures' ? <HistoryPanel labels={labels} locale={locale} captures={captures} attempts={attempts} questions={questions} onCaptureStatus={onCaptureStatus} embedded mode="captures" selectedCaptureId={activeCaptureId} onSelectedCaptureChange={onActiveCaptureChange} /> : null}
      {visibleTab === 'practice' ? <HistoryPanel labels={labels} locale={locale} captures={captures} attempts={attempts} questions={questions} onCaptureStatus={onCaptureStatus} embedded mode="practice" recordSection={recordSection} selectedAttemptId={activeAttemptId} onSelectedAttemptChange={onActiveAttemptChange} attemptQuestionDetailOpen={attemptQuestionDetailOpen} onAttemptQuestionDetailChange={onAttemptQuestionDetailChange} /> : null}
      {activeTab === 'drafts' ? <div className="pt-5">{draftsContent}</div> : null}
      {activeTab === 'settings' ? <div className="pt-5">{settingsContent}</div> : null}
      </>
    </section>
  );
}
