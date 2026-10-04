/** Isolated responsive fixture. Synthetic state only; no authentication or API writes. */
import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import { Home, BarChart3, Compass, Library, FileText, BookOpen } from 'lucide-react';
import { LearningList, LearningListFrame, LearningListRow } from '../../src/components/LearningList';
import { ConfirmationProvider } from '../../src/components/ConfirmationProvider';
import { PageChromeProvider } from '../../src/components/PageChrome';
import { MobileBottomNavigation, MobileAppHeader, DesktopPageHeader } from '../../src/features/navigation/MobileNavigation';
import { AuthoringNavigationProvider, type AuthoringLocation } from '../../src/components/AuthoringNavigation';
import { ModuleActionBar } from '../../src/components/ModuleActionBar';
import { HomeDashboard } from '../../src/features/home/HomeDashboard';
import { StudyModulesHub } from '../../src/features/home/StudyModulesHub';
import { PlanCalendar } from '../../src/features/plan/PlanCalendar';
import { MixedPracticeHub } from '../../src/features/practice/MixedPracticeHub';
import { PracticePanel, PracticeReviewPanel } from '../../src/features/practice/StudyPanels';
import { CapturePanel } from '../../src/features/capture/CapturePanel';
import { SettingsView } from '../../src/features/settings/SettingsView';
import { translations } from '../../src/i18n/translations';
import { createDefaultStudyPlanProfile, localDateString } from '../../src/domain/studyPlan';
import { deckLabelsFor } from '../../src/domain/questions';
import type { DisplaySettings, Question, StudyPlanDocument } from '../../src/types';
import '../../src/styles.css';
import '../../src/components/LearningList.css';
import '../../src/components/WorkspaceLayout.css';
import '../../src/components/EntryNavigation.css';
import '../../src/components/PageTemplates.css';
import '../../src/features/home/LightWorkspace.css';
import '../../src/components/UnifiedResponsive.css';

import { GuideBook } from '../../src/features/about/GuideBook';
import { ListeningPanel } from '../../src/features/listening/ListeningPanel';
import { ReadingPanel } from '../../src/features/reading/ReadingPanel';
import { HistoryPanel } from '../../src/features/history/HistoryPanel';
import { MarketPanel } from '../../src/features/market/MarketPanel';
const labels = translations['zh-CN'];
const question: Question = { id:'qa-q1', itemId:'qa-item', kind:'grammar', title:'文法练习', prompt:'経験を（　）、新しい方法を考えた。', choices:['もとに','ために','ように','かわりに'], answer:'もとに', context:'経験をもとに、新しい方法を考えた。', correctReason:'「をもとに」表示以经验或资料为基础。', memoryPoint:'名词 + をもとに', choiceAnalysis: [{choice:'ために',correct:false,explanation:'「ために」表达目的；这里说明的是判断基础。'}] };
const plan: StudyPlanDocument = {profile:createDefaultStudyPlanProfile(),status:'ready',tasks:[{id:'qa-task', date:localDateString(new Date()),title:'复习今天的语法与词汇',minutes:15,module:'grammar',status:'pending'}],phases:[],dailySummaries:[]};
const shared = {format:'jlpt-share',version:1,kind:'practice',title:'N1 文法・範囲の始まり・限度',description:'学习范围、起点与终止表达，整理接续与辨析练习。这里是用于验证两行简介展开、收起和阅读内容位置的合成文本。不会更改正式账号。',questions:[{prompt:question.prompt,choices:question.choices,answer:question.answer,correctReason:question.correctReason}]};
const share = {id:'qa-share',kind:'practice',title:shared.title,description:shared.description,count:1,mine:true};
// This fixture never reaches a real API. It renders only explicitly synthetic data.
window.fetch = async (input) => new Response(JSON.stringify(String(input).includes('/api/tts/providers') ? {providers:[]} : String(input).includes('/api/tts/credentials') ? {credentials:[]} : String(input).includes('/api/market/qa-share') ? {package:shared} : {shares:[share]}),{status:200,headers:{'Content-Type':'application/json'}});
const initialSettings: DisplaySettings = {showReviewRuby:true,showExplanationRuby:true,memoryCardWordSpacing:true,locale:'zh-CN',fontSize:'standard',memoryCardFrontFields:[],memoryCardBackFields:[],feedbackMode:'immediate',questionTypeTips:{},customQuestionTypeTips:[],ttsProvider:'browser'};
function Fixture() {
 const params = new URLSearchParams(location.search);
 const clean = params.get('clean') === '1';
 const [screen,setScreen] = useState(params.get('screen') || 'home');
 useEffect(() => { const change = () => { if (location.hash === '#/mixed/tips/topics') setScreen('mixed'); else if(location.hash === '#/mixed/tips') setScreen('practice-home'); }; window.addEventListener('hashchange',change); return () => window.removeEventListener('hashchange',change); }, []);
 const [shareId,setShareId] = useState<string | undefined>(()=>location.hash.startsWith('#/market/') ? location.hash.split('/')[2] : undefined);
 useEffect(()=>{const change=()=>setShareId(location.hash.startsWith('#/market/') ? location.hash.split('/')[2] : undefined);window.addEventListener('hashchange',change);return()=>window.removeEventListener('hashchange',change);},[]);
 const [notice,setNotice] = useState('');
 const [localScreen,setLocalScreen] = useState<AuthoringLocation | null>(null);
 const [settings,setSettings] = useState(initialSettings);
 const [contentId,setContentId] = useState<string | undefined>();
 const [section,setSection] = useState(new URLSearchParams(location.search).get('section') || '');
 const action = (label:string) => () => setNotice(label);
 const navigate = (view:string) => {setNotice(`打开 ${view}`); if(['home','study','mixed','capture','settings','plan','result','practice'].includes(view)) setScreen(view);};
 const primary = ['home','practice-home','market','records','study'].includes(screen) && !localScreen && !shareId;
 const title = screen==='guide' ? ({mcp:'认识 MCP',connect:'接入与验证',guide:'学习协作指引',automation:'定时任务说明'} as Record<string,string>)[section] || 'AI 助手' : screen==='settings' && section ? ({display:'显示与阅读',practice:'练习体验',memory:'记忆卡内容',pronunciation:'发音朗读',account:'用户'} as Record<string,string>)[section] : shareId ? '分享详情' : contentId ? (screen==='listening' ? '听力作答' : '阅读原文') : ({home:'今日','practice-home':'练习',mixed:'专项练习',market:'发现',records:'记录',study:'题库',catalog:'词汇',reading:'阅读',listening:'听力',actions:'语法',practice:'专项练习',result:'答案解析',settings:'设置',plan:'学习计划',capture:'添加输入'} as Record<string,string>)[screen] || screen;
 const navItems = [{view:'home',label:'今日',icon:Home},{view:'mixed',label:'练习',icon:FileText},{view:'market',label:'发现',icon:Compass},{view:'history',label:'记录',icon:BarChart3},{view:'study',label:'题库',icon:Library}];
 const common = {labels,locale:'zh-CN' as const};
 return <ConfirmationProvider><PageChromeProvider><AuthoringNavigationProvider onChange={setLocalScreen}><main className="cute-shell light-workspace" data-bottom-navigation={primary ? "visible" : "hidden"}>{!clean && <nav aria-label="QA fixture" style={{display:'flex',flexWrap:'wrap',gap:8,padding:12}}>{['home','study','mixed','actions','result','capture','settings','plan','practice','catalog'].map(s=><button key={s} style={{minHeight:44,padding:'8px 12px',border:'1px solid #aaa'}} onClick={()=>setScreen(s)}>{s}</button>)}</nav>} {!clean && <p role="status" style={{padding:'0 16px'}}>{notice || '合成测试数据 · 不会读写正式账号'}</p>}<MobileAppHeader title={localScreen?.label || title} showBack={!primary} backLabel="返回" onBack={()=>localScreen ? localScreen.close() : shareId ? (setShareId(undefined), location.hash='#/market') : setScreen(screen==='mixed' || screen==='practice' ? 'practice-home' : 'home')} onSettings={()=>setScreen('settings')} settingsLabel="设置"/><DesktopPageHeader title={localScreen?.label || title} labels={labels} showBack={!primary} onBack={()=>localScreen ? localScreen.close() : shareId ? (setShareId(undefined), location.hash='#/market') : setScreen(screen==='mixed' || screen==='practice' ? 'practice-home' : 'home')}/><section className="app-content" style={{maxWidth:980,margin:'0 auto',padding:16}}>
 {screen==='home' && <HomeDashboard {...common} token="" username="测试学习者" dueItems={[]} plan={plan} todayPractices={[]} onOpenReviewItem={action('review')} onOpenDraft={action('draft')} onNavigate={navigate} onStartDailyPractice={action('start')} onCreateDailyPractice={action('prepare')} onOpenPracticeHistory={action('history')} onStartMock={action('mock')} onTaskStatus={async()=>{throw new Error('测试：保存失败')}}/>}
 {screen==='study' && <StudyModulesHub {...common} items={[]} progress={{}} readingQuestions={[]} listeningQuestions={[]} onNavigate={view=>setScreen(view==='listening' || view==='reading' ? view : 'catalog')}/>}
 {screen==='actions' && <ModuleActionBar label="语法" primary={{label:'开始练习',onClick:action('开始练习')}} actions={[{key:'add',label:'添加单词',onClick:action('添加单词')},{key:'tips',label:'学习方法',onClick:action('学习方法')},{key:'disabled',label:'不可用操作',disabled:true,onClick:action('不应触发')}]} contentActions={[{key:'import',label:'导入内容',onClick:action('导入内容')}]} onAsk={async()=>{setNotice('提问保存成功')}}/>}
 {(screen==='mixed' || screen==='practice-home') && <MixedPracticeHub {...common} questions={[question]} items={[]} progress={{}} modules={[]} captures={[]} drafts={[]} listeningQuestions={[]} readingQuestions={[]} studyPlan={plan} groupKey={screen === 'mixed' ? 'topics' : undefined} topicEntries={[{key:'qa-topic',body:'',icon:BookOpen,tone:'green',title:'第1課〜第4課・総合文法：即時・継続・並列・範囲表現',count:60,status:'ready',completedCount:0,modules:['grammar'],action:()=>setScreen('practice')},{key:'qa-pending',body:'',icon:BookOpen,tone:'green',title:'第7課・付随行動：順便・兼目的・長期並行',status:'pending',modules:['grammar'],action:action('待确认')}]} onStart={()=>setScreen('practice')} onStartMock={action('模拟考试')} onNavigate={(view)=>view==='mixed' ? setScreen('mixed') : navigate(view)} onStartModule={action('专项练习')}/>}
 {screen==='catalog' && <LearningListFrame className="ledger-word-index ledger-entry-index" label="词汇列表" locale="zh-CN"><LearningList><LearningListRow title="経験" reading="けいけん" description="经验" onOpen={action('词汇详情')}/><LearningListRow title="判断" reading="はんだん" description="判断" onOpen={action('词汇详情')}/></LearningList></LearningListFrame>}
 {screen==='practice' && <PracticePanel activeQuestion={question} questions={[question]} questionsLength={1} activeIndex={0} answeredCount={notice==='answered' ? 1 : 0} complete={false} feedbackMode="batch" answers={notice==='answered' ? {'qa-q1':{selected:'もとに',correct:true}} : {}} items={[]} labels={labels} questionTypeLabel="语法练习" settings={settings} onAnswer={action('answered')} onPrev={()=>{}} onNext={()=>{}} onJump={()=>{}} onRestart={action('')} onPracticeHome={()=>setScreen('mixed')} onPrepareReview={async()=>{}} onReview={()=>{}} analysisStatus="idle"/>}
 {screen==='result' && <PracticeReviewPanel {...common} questions={[question]} answers={{'qa-q1':{selected:'ために',correct:false}}} items={[]} practiceTitle="今日语法练习" showRuby={false} onRestart={action('重新练习')} onBackToPractice={action('返回练习')}/>}
 {screen==='capture' && <CapturePanel labels={labels} deckLabels={deckLabelsFor('zh-CN')} wordbooks={[]} onSave={async()=>{throw new Error('测试：保存失败，正文应保留')}} onCreateWordbook={async()=>null} onOpenHistory={action('输入记录')}/>}
 {screen==='guide' && <GuideBook section={section || 'mcp'} locale="zh-CN" username="测试学习者"/>}
 {screen==='settings' && <SettingsView labels={labels} settings={settings} username="测试学习者" authToken="" activeSection={section} onOpenSection={setSection} onLogout={action('退出')} onUpdateSettings={setSettings}/>}
 {screen==='plan' && <PlanCalendar {...common} tasks={plan.tasks} summaries={[]} evidence={[]} onTaskStatus={async()=>{throw new Error('测试：任务更新失败')}}/>}
 {screen==='records' && <HistoryPanel {...common} embedded mode="practice" captures={[]} attempts={[]} questions={[]} draftCount={0} onCaptureStatus={async()=>{}}/>}
 {screen==='market' && <MarketPanel {...common} token="synthetic" initialShareId={shareId} settings={settings} onAdded={async()=>{}}/>}
 {screen==='listening' && <ListeningPanel {...common} mode="library" token="synthetic" activeQuestionId={contentId} onOpenQuestion={setContentId} onBackToLibrary={()=>setContentId(undefined)} questions={[{id:'audio1',title:'持っていく',questionTypeId:'listening-basic-training',question:'誰が持っていきますか。',choices:['男','女'],answerIndex:1,explanation:'女が持っていきます。',transcript:'男：これ、持っていってくれない？\n女：わかった。',audioFileName:'shinkanzen_chokai_n1_CD-A_010.mp3',audioSize:100,audioMime:'audio/mpeg',createdAt:'2026-10-04'} as any]} onPractice={()=>setScreen('practice')} onCreate={async()=>{}} onUpdate={async()=>{}} onDelete={async()=>{}}/>}
 {screen==='reading' && <ReadingPanel {...common} mode="library" activeQuestionId={contentId} onBackToLibrary={()=>setContentId(undefined)} questions={[{id:'reading1',title:'個人化とリーダーシップ',passage:'自分で判断することは大切だ。しかし、人の話を聞くことも欠かせない。\n経験をもとに、新しい方法を考える。',question:'筆者の考えはどれか。',choices:['自分で判断すればよい。','人の話も聞く必要がある。'],answerIndex:1,explanation:'「人の話を聞くことも欠かせない」と述べている。',createdAt:'2026-10-04',tags:[]} as any]} onPractice={()=>setScreen('practice')} onRecordPractice={async()=>{}} onCreate={async()=>{}} onDelete={async()=>{}}/>}
 </section>{primary && <MobileBottomNavigation items={navItems as any} activeView={(screen==='records' ? 'history' : screen==='practice-home' ? 'mixed' : screen) as any} onNavigate={view=>setScreen(view==='mixed' ? 'practice-home' : view==='history' ? 'records' : view)} navigationLabel="选择模块"/>}</main></AuthoringNavigationProvider></PageChromeProvider></ConfirmationProvider>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
