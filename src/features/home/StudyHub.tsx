// 学習（v3）：4 分野のライブラリと題庫、問題形式の案内、公式サンプル、総合練習・模擬試験への入口。
import { useEffect, useMemo, useState } from 'react';
import { BookA, BookOpenText, Captions, ClipboardList, FileText, Headphones, Languages, Shuffle } from 'lucide-react';
import { NavigationCard } from '../../components/NavigationCard';
import { createV3Client } from '../../v3/client';
import type { StudyOverview } from '../../v3/types';
import type { AppView, Locale, StudyPage } from '../../types';

const TEXT = {
  'zh-CN': { library: '学习库', vocabulary: '词汇', grammar: '语法', reading: '阅读', listening: '听力', words: '单词本与词条', grammarWords: '语法条目', bank: '题库', types: '题型说明', typesHint: 'JLPT 各题型的做法与提示',
    samples: '官方样题', practice: '练习', mixed: '综合练习', mixedHint: '从所有已审查的题目里抽题', mock: '模拟考试', mockHint: 'AI 组卷的整套试题', count: (n: number) => `${n} 个知识点` },
  ja: { library: '学習ライブラリ', vocabulary: '語彙', grammar: '文法', reading: '読解', listening: '聴解', words: '単語帳と見出し語', grammarWords: '文法項目', bank: '問題集', types: '問題形式の案内', typesHint: 'JLPT の各問題形式の解き方とコツ',
    samples: '公式サンプル', practice: '練習', mixed: '総合練習', mixedHint: '審査済みの全問題から出題', mock: '模擬試験', mockHint: 'AI が組んだ一式の試験', count: (n: number) => `${n} 項目` },
  en: { library: 'Library', vocabulary: 'Vocabulary', grammar: 'Grammar', reading: 'Reading', listening: 'Listening', words: 'Wordbooks and entries', grammarWords: 'Grammar points', bank: 'Question bank', types: 'Question types', typesHint: 'How each JLPT question type works',
    samples: 'Official samples', practice: 'Practice', mixed: 'Mixed practice', mixedHint: 'Draw from every reviewed question', mock: 'Mock exams', mockHint: 'Full exams assembled by your AI', count: (n: number) => `${n} items` },
} as const;

export function StudyHub({ token, locale, onNavigate }: { token: string; locale: Locale; onNavigate: (view: AppView, page?: StudyPage, itemId?: string) => void }) {
  const client = useMemo(() => createV3Client(token), [token]);
  const t = TEXT[locale];
  const [stats, setStats] = useState<StudyOverview | null>(null);
  useEffect(() => { client.stats({ days: 1 }).then(setStats).catch(() => undefined); }, [client]);
  const total = stats ? t.count(stats.knowledge.total) : null;
  return (
    <section className="library study-hub">
      <section className="settings-nav-group" aria-label={t.library}>
        <h2>{t.library}{total ? <small> · {total}</small> : null}</h2>
        <NavigationCard icon={<BookA size={22} />} title={t.vocabulary} description={t.words} onOpen={() => onNavigate('vocabulary', 'words')} />
        <NavigationCard icon={<Languages size={22} />} title={t.grammar} description={t.grammarWords} onOpen={() => onNavigate('grammar', 'words')} />
        <NavigationCard icon={<BookOpenText size={22} />} title={t.reading} description={t.bank} onOpen={() => onNavigate('reading', 'bank')} />
        <NavigationCard icon={<Headphones size={22} />} title={t.listening} description={t.bank} onOpen={() => onNavigate('listening', 'bank')} />
      </section>
      <section className="settings-nav-group" aria-label={t.practice}>
        <h2>{t.practice}</h2>
        <NavigationCard icon={<Shuffle size={22} />} title={t.mixed} description={t.mixedHint} onOpen={() => onNavigate('mixed', 'questions')} />
        <NavigationCard icon={<ClipboardList size={22} />} title={t.mock} description={t.mockHint} onOpen={() => onNavigate('mock-exams')} />
        <NavigationCard icon={<Captions size={22} />} title={t.types} description={t.typesHint} onOpen={() => onNavigate('question-types')} />
        <NavigationCard icon={<FileText size={22} />} title={t.samples} description={`${t.grammar} · ${t.reading} · ${t.listening}`} onOpen={() => onNavigate('grammar', 'samples')} />
      </section>
    </section>
  );
}
