import { BookOpen, BookA, Headphones, Captions, ArrowUpRight } from 'lucide-react';
import type { AppView, Locale, StudyPage } from '../../types';
export function StudyModulesHub({ locale, labels, onNavigate }: { locale: Locale; labels: Record<string,string>; onNavigate: (view: AppView, page?: StudyPage) => void }) {
  const cards = [
    { view: 'vocabulary' as const, title: locale === 'zh-CN' ? '词汇' : labels.navVocabulary, icon: BookA, page: 'words' as const },
    { view: 'grammar' as const, title: labels.navGrammar, icon: Captions, page: 'words' as const },
    { view: 'reading' as const, title: labels.navReading, icon: BookOpen, page: 'words' as const },
    { view: 'listening' as const, title: labels.navListening, icon: Headphones, page: 'words' as const },
  ];
  return <main className="light-library"><header className="light-heading"><h1>{labels.homeStudyArea}</h1></header><div className="light-entry-grid">{cards.map(({view,title,icon:Icon,page}) => <button key={view} className="light-entry" onClick={() => onNavigate(view,page)}><Icon size={27}/><h2>{title}</h2><ArrowUpRight size={18}/></button>)}</div><details className="light-more-practice"><summary>{locale === 'zh-CN' ? '更多工具' : locale === 'ja' ? 'その他のツール' : 'More tools'}</summary><div className="light-library-tools"><button onClick={() => onNavigate('grammar','bank')}>{labels.navBankManage}</button><button onClick={() => onNavigate('question-types')}>{labels.navQuestionTypes}</button><button onClick={() => onNavigate('settings')}>{labels.settings}</button></div></details></main>;
}
