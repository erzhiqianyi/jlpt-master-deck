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
  const visibleTab = isHome ? 'practice' : activeTab;
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
      {!detailOpen && !isHome && activeTab === 'captures' ? <header className="gentle-records-heading gentle-section-heading">
        <a href="#/capture" className="gentle-back">{locale === 'zh-CN' ? '＋ 记一点新内容' : locale === 'ja' ? '学習メモを追加' : 'Add a study note'}</a>
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
