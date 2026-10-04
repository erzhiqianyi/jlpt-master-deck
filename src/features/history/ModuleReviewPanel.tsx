import '../practice/practice-layout.css';
import { LearningList, LearningListFrame, LearningListHeader, LearningListRow } from '../../components/LearningList';
import { ModuleActionBar } from '../../components/ModuleActionBar';
import { listeningAudioRouteId, listeningPracticeKey } from '../../domain/listeningPractice';
import type { ListeningQuestion, Locale, ProgressState, ReadingQuestion } from '../../types';

export function ModuleReviewPanel({ module, locale, readingQuestions, listeningQuestions, progress, onOpen, onPractice }: {
  module: 'reading' | 'listening'; locale: Locale; readingQuestions: ReadingQuestion[];
  listeningQuestions: ListeningQuestion[]; progress: ProgressState;
  onOpen: (id: string) => void; onPractice: () => void;
}) {
  const copy = locale === 'zh-CN'
    ? { title: module === 'reading' ? '阅读复习' : '听力复习', body: '查看已练材料，再次练习或阅读解析。', empty: '还没有练习记录', start: '开始练习', open: '打开材料与解析', count: '练习次数', correct: '答对', wrong: '答错', listeningNote: '听力记录按音频统计练习次数；历史选项答案未保存。', readingNote: '阅读记录显示累计作答结果；单次选项答案未保存。' }
    : locale === 'ja'
      ? { title: module === 'reading' ? '読解の復習' : '聴解の復習', body: '練習した教材を開いて、再練習や解説の確認ができます。', empty: '練習履歴はまだありません', start: '練習する', open: '教材と解説を開く', count: '練習回数', correct: '正解', wrong: '不正解', listeningNote: '聴解は音声ごとの練習回数を記録します。過去に選んだ回答は保存されません。', readingNote: '読解は累計の解答結果を表示します。各回に選んだ回答は保存されません。' }
      : { title: module === 'reading' ? 'Reading review' : 'Listening review', body: 'Reopen practiced materials to try again or read explanations.', empty: 'No practice records yet', start: 'Start practice', open: 'Open material and explanations', count: 'Practices', correct: 'Correct', wrong: 'Incorrect', listeningNote: 'Listening counts practices per audio. Historical answer choices are not saved.', readingNote: 'Reading shows cumulative results. Individual answer choices are not saved.' };
  const seen = new Set<string>();
  const entries = (module === 'reading' ? readingQuestions.map((item) => ({ id: item.id, key: item.id, title: item.title }))
    : listeningQuestions.map((item) => ({ id: listeningAudioRouteId(item), key: listeningPracticeKey(item), title: item.audioFileName || item.title })))
    .filter((entry) => { if (seen.has(entry.key)) return false; seen.add(entry.key); return Boolean(progress[entry.key]?.reviewCount); })
    .sort((left, right) => (progress[right.key]?.lastReviewedAt ?? '').localeCompare(progress[left.key]?.lastReviewedAt ?? ''));
  return <LearningListFrame locale={locale} className="study-module-review" label={copy.title}>
    <LearningListHeader count={`${entries.length}`}><p className="study-review-record-note">{module === 'reading' ? copy.readingNote : copy.listeningNote}</p></LearningListHeader>
    {entries.length ? <LearningList locale={locale}>{entries.map((entry) => {
      const record = progress[entry.key];
      return <LearningListRow key={entry.key} title={entry.title} locale={locale}
        description={`${copy.count}: ${record.reviewCount}${module === 'reading' ? ` · ${copy.correct}: ${record.correct} · ${copy.wrong}: ${record.wrong}` : ''}`}
        actionLabel={copy.open} onOpen={() => onOpen(entry.id)} />;
    })}</LearningList> : <p className="study-review-empty">{copy.empty}</p>}
    <ModuleActionBar locale={locale} label={copy.title} primary={{ label: copy.start, onClick: onPractice }} />
  </LearningListFrame>;
}
