import { useState } from 'react';
import { typePracticeCandidates, practiceKindName } from '../../domain/typePractice';
import { itemInWordbook, wordbooksForFamily } from '../../domain/wordbooks';
import { officialN1QuestionTypes } from '../../data/questionTypes';
import { CircleCheck, RefreshCw, ChevronRight } from 'lucide-react';
import { listeningPracticeKey } from '../../domain/listeningPractice';
import type { AppView, ListeningQuestion, Locale, ProgressEntry, ProgressState, ReadingQuestion, StudyPage, VocabItem, Wordbook } from '../../types';
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

export function StudyModulesHub({ locale, labels, onNavigate, items, progress, readingQuestions, listeningQuestions, wordbooks = [], onTypePractice }: {
  locale: Locale; labels: Record<string, string>; onNavigate: (view: AppView, page?: StudyPage) => void;
  items?: VocabItem[]; progress?: ProgressState; readingQuestions?: ReadingQuestion[]; listeningQuestions?: ListeningQuestion[]; wordbooks?: Wordbook[]; onTypePractice?: (module: LibraryModule, kind: string, book: string) => void;
}) {
  const [books, setBooks] = useState<Record<string, string>>({});
  const counts = libraryModuleCounts(items ?? [], readingQuestions ?? [], listeningQuestions ?? [], progress ?? {});
  const cards = [
    { view: 'vocabulary' as const, title: locale === 'zh-CN' ? '词汇' : labels.navVocabulary, unit: locale === 'zh-CN' ? '词' : locale === 'ja' ? '語' : 'words', available: items !== undefined },
    { view: 'grammar' as const, title: labels.navGrammar, unit: locale === 'zh-CN' ? '项' : locale === 'ja' ? '項目' : 'entries', available: items !== undefined },
    { view: 'reading' as const, title: labels.navReading, unit: locale === 'zh-CN' ? '篇' : locale === 'ja' ? '篇' : 'passages', available: readingQuestions !== undefined },
    { view: 'listening' as const, title: labels.navListening, unit: locale === 'zh-CN' ? '套' : locale === 'ja' ? '本' : 'recordings', available: listeningQuestions !== undefined },
  ];
  const descriptions: Record<LibraryModule, string> = locale === 'zh-CN'
    ? { vocabulary: '按单词本与标签整理词汇，查看读音、例句和记忆重点。', grammar: '按语法本与标签浏览表达，比较用法和易混点。', reading: '阅读文章与题目，查看原文、答案和逐题解析。', listening: '按音频浏览听力材料，练习听辨并回顾原文。' }
    : locale === 'ja'
      ? { vocabulary: '単語帳やタグから、読み方・例文・要点を確認。', grammar: '文法帳やタグから、用法と似た表現を比較。', reading: '文章と問題を読み、解答と解説を確認。', listening: '音声ごとに問題を解き、スクリプトで復習。' }
      : { vocabulary: 'Browse wordbooks and tags for readings, examples and memory notes.', grammar: 'Explore grammar books and tags to compare usage and similar expressions.', reading: 'Read passages and questions, then review answers and explanations.', listening: 'Browse audio materials, practice listening and review transcripts.' };
  const studiedLabel = (view: LibraryModule) => locale === 'zh-CN' ? (view === 'reading' || view === 'listening' ? '已练' : '已学') : locale === 'ja' ? '学習済み' : 'studied';
  return <main className="primary-library" aria-label={locale === 'zh-CN' ? '题库' : labels.homeStudyArea}>
    {cards.map(({ view, title, unit, available }) => {
      const StatusIcon = view === 'reading' || view === 'listening' ? RefreshCw : CircleCheck;
      const count = counts[view];
      return <section key={view} className="library-module-card"><button type="button" className="library-module-tile" onClick={() => onNavigate(view, 'words')}>
        <img className="library-module-art" src={`/images/library/${view}.png`} alt="" />
        <span className="library-module-heading"><strong>{title}</strong><ChevronRight size={20} aria-hidden="true" /></span>
        <span className="library-module-description">{descriptions[view]}</span>
        {available ? <span className="library-module-count"><span>{count.total} {unit}</span>{progress !== undefined ? <><span aria-hidden="true">·</span><span className="library-module-studied" aria-label={`${studiedLabel(view)} ${count.studied}`} title={`${studiedLabel(view)} ${count.studied}`}><span className="library-status-label">{studiedLabel(view)}</span><StatusIcon size={19} aria-hidden="true" /><span>{count.studied}</span></span></> : null}</span> : null}
      </button>
      <div className="library-module-details">
        {(view === 'vocabulary' || view === 'grammar') && <><h3>{locale === 'zh-CN' ? (view === 'grammar' ? '语法本' : '单词本') : locale === 'ja' ? '学習帳' : 'Books'}</h3><div className="library-book-list"><button aria-pressed={!books[view] || books[view] === 'all'} onClick={() => setBooks(current => ({...current, [view]:'all'}))}>{locale === 'zh-CN' ? '全部' : locale === 'ja' ? 'すべて' : 'All'} · {count.total}</button>{wordbooksForFamily(wordbooks,view).map(book => <button key={book.id} aria-pressed={books[view]===book.id} onClick={() => setBooks(current=>({...current,[view]:book.id}))}>{book.title} · {(items ?? []).filter(item => (view === 'grammar') === (item.deck === 'grammar_expression') && itemInWordbook(item,book.id)).length}</button>)}</div></>}
        <h3>{locale === 'zh-CN' ? '题型 · 题数' : locale === 'ja' ? '問題形式 · 問題数' : 'Question types · Counts'}</h3>
        <div className="library-type-list">{(() => {
          const candidates=typePracticeCandidates(view,items??[],readingQuestions??[],listeningQuestions??[],books[view]??'all');
          const kinds=[...new Set([...officialN1QuestionTypes.filter(type=>type.section === view || (view==='vocabulary' && type.section==='vocabulary')).map(type=>type.id),...candidates.map(q=>q.kind)])];
          // Vocabulary/grammar use the actual generator kind identifiers.
          const supported=view==='vocabulary'?['kanji_to_kana','kana_to_kanji','moji_goi','meaning','usage','word_formation']:view==='grammar'?['grammar','grammar-composition','grammar-text']:kinds;
          return supported.map(kind=>{const total=candidates.filter(q=>q.kind===kind).length;return <button key={kind} disabled={!total || !onTypePractice} onClick={()=>onTypePractice?.(view,kind,books[view]??'all')}><span>{practiceKindName(kind,locale)}</span><span>{total} {locale==='zh-CN'?'题':locale==='ja'?'問':'questions'}<ChevronRight size={14}/></span></button>;});
        })()}</div>
      </div></section>;
    })}
  </main>;
}
