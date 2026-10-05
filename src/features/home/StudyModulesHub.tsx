import { CircleCheck, RefreshCw, ChevronRight } from 'lucide-react';
import { listeningPracticeKey } from '../../domain/listeningPractice';
import type { AppView, ListeningQuestion, Locale, ProgressEntry, ProgressState, ReadingQuestion, StudyPage, VocabItem } from '../../types';
import './HomeDashboard.css';

type LibraryModule = 'vocabulary' | 'grammar' | 'reading' | 'listening';
type ModuleCount = { total: number; studied: number };

/** Only saved answers or completed reviews count as studied. Opening a detail does not. */
function hasStudied(progress: ProgressEntry | undefined) {
  return Boolean(progress && ((progress.reviewCount ?? 0) > 0 || progress.correct + progress.wrong > 0));
}

export function libraryModuleCounts(items: VocabItem[], readingQuestions: ReadingQuestion[], listeningQuestions: ListeningQuestion[], progress: ProgressState): Record<LibraryModule, ModuleCount> {
  const vocabulary = items.filter(item => item.deck !== 'grammar_expression');
  const grammar = items.filter(item => item.deck === 'grammar_expression');
  // Match the reading and listening libraries' actual passage/audio grouping.
  const passages = new Map<string, ReadingQuestion[]>();
  for (const question of readingQuestions) {
    const key = question.passage.replace(/\r\n?/g, '\n').trim() || question.id;
    passages.set(key, [...(passages.get(key) ?? []), question]);
  }
  const audioKeys = new Set(listeningQuestions.map(listeningPracticeKey));
  return {
    vocabulary: { total: vocabulary.length, studied: vocabulary.filter(item => hasStudied(progress[item.id])).length },
    grammar: { total: grammar.length, studied: grammar.filter(item => hasStudied(progress[item.id])).length },
    reading: { total: passages.size, studied: [...passages.values()].filter(group => group.some(question => hasStudied(progress[question.id]))).length },
    listening: { total: audioKeys.size, studied: [...audioKeys].filter(key => hasStudied(progress[key])).length },
  };
}

export function StudyModulesHub({ locale, labels, onNavigate, items, progress, readingQuestions, listeningQuestions }: {
  locale: Locale; labels: Record<string, string>; onNavigate: (view: AppView, page?: StudyPage) => void;
  items?: VocabItem[]; progress?: ProgressState; readingQuestions?: ReadingQuestion[]; listeningQuestions?: ListeningQuestion[];
}) {
  const counts = libraryModuleCounts(items ?? [], readingQuestions ?? [], listeningQuestions ?? [], progress ?? {});
  const cards = [
    { view: 'vocabulary' as const, title: locale === 'zh-CN' ? '词汇' : labels.navVocabulary, unit: locale === 'zh-CN' ? '词' : locale === 'ja' ? '語' : 'words', available: items !== undefined },
    { view: 'grammar' as const, title: labels.navGrammar, unit: locale === 'zh-CN' ? '项' : locale === 'ja' ? '項目' : 'entries', available: items !== undefined },
    { view: 'reading' as const, title: labels.navReading, unit: locale === 'zh-CN' ? '篇' : locale === 'ja' ? '篇' : 'passages', available: readingQuestions !== undefined },
    { view: 'listening' as const, title: labels.navListening, unit: locale === 'zh-CN' ? '套' : locale === 'ja' ? '本' : 'recordings', available: listeningQuestions !== undefined },
  ];
  const studiedLabel = (view: LibraryModule) => locale === 'zh-CN' ? (view === 'reading' || view === 'listening' ? '已练' : '已学') : locale === 'ja' ? '学習済み' : 'studied';
  return <main className="primary-library" aria-label={locale === 'zh-CN' ? '题库' : labels.homeStudyArea}>
    {cards.map(({ view, title, unit, available }) => {
      const StatusIcon = view === 'reading' || view === 'listening' ? RefreshCw : CircleCheck;
      const count = counts[view];
      return <button type="button" key={view} className="library-module-tile" onClick={() => onNavigate(view, 'words')}>
        <img className="library-module-art" src={`/images/library/${view}.png`} alt="" />
        <span className="library-module-heading"><strong>{title}</strong><ChevronRight size={20} aria-hidden="true" /></span>
        {available ? <span className="library-module-count"><span>{count.total} {unit}</span>{progress !== undefined ? <><span aria-hidden="true">·</span><span className="library-module-studied" aria-label={`${studiedLabel(view)} ${count.studied}`} title={`${studiedLabel(view)} ${count.studied}`}><StatusIcon size={19} aria-hidden="true" /><span>{count.studied}</span></span></> : null}</span> : null}
      </button>;
    })}
  </main>;
}
