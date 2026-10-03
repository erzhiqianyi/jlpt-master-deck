import { ArrowRight } from 'lucide-react';
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
  return <section className="mx-auto max-w-4xl py-4" aria-labelledby="module-review-heading">
    <header className="mb-5"><h1 id="module-review-heading" className="text-xl font-semibold">{copy.title}</h1><p className="mt-2 text-sm text-[#68716b]">{copy.body}</p></header>
    <p className="mb-4 text-sm text-[#68716b]">{module === 'reading' ? copy.readingNote : copy.listeningNote}</p>
    {entries.length ? <ul className="divide-y divide-[#ded6cf] border-y border-[#ded6cf]">{entries.map((entry) => {
      const record = progress[entry.key];
      return <li key={entry.key}><button type="button" className="flex min-h-16 w-full items-center justify-between gap-4 py-4 text-left" onClick={() => onOpen(entry.id)} aria-label={`${entry.title} · ${copy.open}`}>
        <span className="min-w-0"><strong className="block break-words">{entry.title}</strong><span className="mt-1 block text-sm text-[#68716b]">{copy.count}: {record.reviewCount}{module === 'reading' ? ` · ${copy.correct}: ${record.correct} · ${copy.wrong}: ${record.wrong}` : ''}</span></span><ArrowRight size={18} className="shrink-0" aria-hidden="true" />
      </button></li>;
    })}</ul> : <p className="py-8 text-center text-[#68716b]">{copy.empty}</p>}
    <button type="button" onClick={onPractice} className="cute-button-secondary mt-5 min-h-11 px-4">{copy.start}</button>
  </section>;
}
