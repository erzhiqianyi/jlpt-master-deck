import { readingQuestionKind, indexedPracticeKind } from '../../domain/typePractice';
import { useMemo, useState } from 'react';
import { buildQuestionIndex, buildQuestions } from '../../domain/questions';
import { filterableTags, itemInWordbook, wordbooksForFamily } from '../../domain/wordbooks';
import { officialN1QuestionTypes } from '../../data/questionTypes';
import type { ListeningQuestion, Locale, Question, ReadingQuestion, VocabItem, Wordbook } from '../../types';
import './TypePracticeSetup.css';
export type TypePracticeSelection = { module: 'vocabulary' | 'grammar' | 'reading' | 'listening'; title: string; questions: Question[]; reading: ReadingQuestion[]; listening: ListeningQuestion[] };
export function sampleQuestions<T>(pool: T[], count: number): T[] {
  const result = [...pool];
  for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
  return result.slice(0, count);
}
export type TypePracticeDefaults = { module?: TypePracticeSelection['module']; book?: string; kind?: string; tag?: string; itemIds?: string[] };
export function TypePracticeSetup({ items, wordbooks, reading, listening, locale, onStart, defaults = {} }: { items: VocabItem[]; wordbooks: Wordbook[]; reading: ReadingQuestion[]; listening: ListeningQuestion[]; locale: Locale; onStart: (selection: TypePracticeSelection) => void; defaults?: TypePracticeDefaults }) {
  const [module, setModule] = useState<TypePracticeSelection['module']>(defaults.module ?? 'vocabulary');
  const [kind, setKind] = useState(defaults.kind ?? 'all'); const [book, setBook] = useState(defaults.book ?? 'all'); const [tag, setTag] = useState(defaults.tag ?? 'all'); const [count, setCount] = useState(10);
  const t = (zh: string, ja: string, en: string) => locale === 'zh-CN' ? zh : locale === 'ja' ? ja : en;
  const moduleNames = { vocabulary: t('单词', '単語', 'Vocabulary'), grammar: t('语法', '文法', 'Grammar'), reading: t('阅读', '読解', 'Reading'), listening: t('听力', '聴解', 'Listening') };
  const kindNames: Record<string, string> = { 'listening-expression':t('发话表达（N3–N5）','発話表現（N3–N5）','Verbal expression (N3–N5)'), grammar: t('语法选择', '文法選択', 'Grammar selection'), kanji_to_kana: t('汉字读音', '漢字読み', 'Kanji reading'), kana_to_kanji: t('汉字表记', '漢字表記', 'Kanji spelling'), moji_goi: t('语境规定', '文脈規定', 'Context'), meaning: t('近义替换', '言い換え', 'Paraphrase'), usage: t('用法', '用法', 'Usage'), word_formation: t('词语构成', '語形成', 'Word formation'), 'reading-basic-training':t('基础训练','基礎練習','Basic training'),unclassified: t('未分类', '未分類', 'Unclassified') };
  for (const type of officialN1QuestionTypes) kindNames[type.id] = type.name[locale];
  const library = items.filter(item => (module === 'grammar') === (item.deck === 'grammar_expression') && item.type !== 'proper_name');
  const scopedItems = library.filter(item => (!defaults.itemIds || module !== defaults.module || defaults.itemIds.includes(item.id)) && itemInWordbook(item, book) && (tag === 'all' || filterableTags(item).includes(tag)));
  const readingKind = readingQuestionKind;
  const index = useMemo(() => buildQuestionIndex(scopedItems).map(q=>({...q,kind:indexedPracticeKind(q)})), [scopedItems]);
  const candidates = module === 'reading' ? reading.filter(q => tag === 'all' || q.tags?.includes(tag)).map(q => ({ id: q.id, kind: readingKind(q) })) : module === 'listening' ? listening.map(q => ({ id: q.id, kind: q.questionTypeId })) : index;
  const kinds = [...new Set(candidates.map(q => q.kind))];
  const pool = candidates.filter(q => kind === 'all' || q.kind === kind);
  const tags = [...new Set(module === 'reading' ? reading.flatMap(q => q.tags ?? []) : library.filter(item => itemInWordbook(item, book)).flatMap(filterableTags))].sort();
  const books = wordbooksForFamily(wordbooks, module === 'grammar' ? 'grammar' : 'vocabulary');
  function start() {
    const ids = new Set(sampleQuestions(pool, count).map(q => q.id));
    const title = `${t('题型练习', '問題形式別練習', 'Question type practice')} · ${moduleNames[module]} · ${kindNames[kind] ?? t('全部题型', 'すべての形式', 'All types')}`;
    const selected = { module, title, questions: sampleQuestions(buildQuestions(scopedItems, locale).filter(q => ids.has(q.id)), count), reading: sampleQuestions(reading.filter(q => ids.has(q.id)), count), listening: sampleQuestions(listening.filter(q => ids.has(q.id)), count) };
    onStart(selected);
  }
  return <main className="type-practice-setup"><h1>{t('题型练习', '問題形式別練習', 'Question type practice')}</h1><p>{t('组合选择题型与范围，再随机抽取一组题目。', '形式と範囲を選んで、問題をランダムに抽出します。', 'Choose a type and scope, then draw a random set.')}</p>
    <div className="type-practice-modules" role="group" aria-label={t('模块', '分野', 'Module')}>{Object.entries(moduleNames).map(([value, name]) => <button key={value} aria-pressed={module === value} onClick={() => { setModule(value as typeof module); setBook('all'); setTag('all'); setKind('all'); }}>{name}</button>)}</div>
    <div className="type-practice-fields">
      {(module === 'vocabulary' || module === 'grammar') && <label>{module === 'grammar' ? t('语法本', '文法帳', 'Grammar book') : t('单词本', '単語帳', 'Wordbook')}<select value={book} onChange={e => { setBook(e.target.value); setTag('all'); setKind('all'); }}><option value="all">{t('全部', 'すべて', 'All')}</option>{books.map(b => <option key={b.id} value={b.id}>{b.title}</option>)}</select></label>}
      {module !== 'listening' && <label>{t('标签', 'タグ', 'Tag')}<select value={tag} onChange={e => { setTag(e.target.value); setKind('all'); }}><option value="all">{t('全部标签', 'すべてのタグ', 'All tags')}</option>{tags.map(value => <option key={value}>{value}</option>)}</select></label>}
      <label>{t('题型', '問題形式', 'Question type')}<select value={kind} onChange={e => setKind(e.target.value)}><option value="all">{t('全部题型', 'すべての形式', 'All types')}</option>{kinds.map(value => <option key={value} value={value}>{kindNames[value] ?? value} · {candidates.filter(q => q.kind === value).length}</option>)}</select></label>
      <label>{t('题量', '問題数', 'Set size')}<select value={count} onChange={e => setCount(Number(e.target.value))}>{[5, 10, 20, 30].map(n => <option key={n} value={n}>{n}</option>)}</select></label>
    </div>
    {module === 'reading' && candidates.some(q => q.kind === 'unclassified') && <p className="type-practice-note">{t('尚无明确题型标签的阅读题归入“未分类”，不会猜测题型。', '形式タグのない問題は「未分類」です。', 'Reading questions without an explicit type tag are unclassified.')}</p>}
    <section className="type-practice-summary"><strong>{t('符合条件', '該当問題', 'Matching questions')} {pool.length} · {t('本次抽取', '今回の問題数', 'This set')} {Math.min(count, pool.length)}</strong><p>{t('随机抽取，不重复凑题；开始后固定本轮题目与顺序。', '重複せず抽出し、開始後は問題と順序を固定します。', 'No duplicates. Questions and order stay fixed during the session.')}</p><button disabled={!pool.length} onClick={start}>{t('开始练习', '練習を始める', 'Start practice')}</button></section>
  </main>;
}
