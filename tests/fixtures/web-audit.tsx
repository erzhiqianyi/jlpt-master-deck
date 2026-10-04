/** Isolated responsive fixture. Synthetic state only; no authentication or API writes. */
import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { ConfirmationProvider } from '../../src/components/ConfirmationProvider';
import { PageChromeProvider } from '../../src/components/PageChrome';
import { MobileAppHeader, DesktopPageHeader } from '../../src/features/navigation/MobileNavigation';
import { AuthoringNavigationProvider, type AuthoringLocation } from '../../src/components/AuthoringNavigation';
import { ModuleActionBar } from '../../src/components/ModuleActionBar';
import { HomeDashboard } from '../../src/features/home/HomeDashboard';
import { StudyModulesHub } from '../../src/features/home/StudyModulesHub';
import { PlanCalendar } from '../../src/features/plan/PlanCalendar';
import { MixedPracticeHub } from '../../src/features/practice/MixedPracticeHub';
import { PracticeReviewPanel } from '../../src/features/practice/StudyPanels';
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

const labels = translations['zh-CN'];
const question: Question = { id:'qa-q1', itemId:'qa-item', kind:'grammar', title:'文法练习', prompt:'経験を（　）、新しい方法を考えた。', choices:['もとに','ために','ように','かわりに'], answer:'もとに', context:'経験をもとに、新しい方法を考えた。', correctReason:'「をもとに」表示以经验或资料为基础。', memoryPoint:'名词 + をもとに', choiceAnalysis: [{choice:'ために',correct:false,explanation:'「ために」表达目的；这里说明的是判断基础。'}] };
const plan: StudyPlanDocument = {profile:createDefaultStudyPlanProfile(),status:'ready',tasks:[{id:'qa-task', date:localDateString(new Date()),title:'复习今天的语法与词汇',minutes:15,module:'grammar',status:'pending'}],phases:[],dailySummaries:[]};
const initialSettings: DisplaySettings = {showReviewRuby:true,showExplanationRuby:true,memoryCardWordSpacing:true,locale:'zh-CN',fontSize:'standard',memoryCardFrontFields:[],memoryCardBackFields:[],feedbackMode:'immediate',questionTypeTips:{},customQuestionTypeTips:[],ttsProvider:'browser'};
function Fixture() {
 const params = new URLSearchParams(location.search);
 const [screen,setScreen] = useState(params.get('screen') || 'home');
 const [notice,setNotice] = useState('');
 const [localScreen,setLocalScreen] = useState<AuthoringLocation | null>(null);
 const [settings,setSettings] = useState(initialSettings);
 const [section,setSection] = useState('');
 const action = (label:string) => () => setNotice(label);
 const navigate = (view:string) => {setNotice(`打开 ${view}`); if(['home','study','mixed','capture','settings','plan','result'].includes(view)) setScreen(view);};
 const common = {labels,locale:'zh-CN' as const};
 return <ConfirmationProvider><PageChromeProvider><AuthoringNavigationProvider onChange={setLocalScreen}><main className="cute-shell light-workspace"><nav aria-label="QA fixture" style={{display:'flex',flexWrap:'wrap',gap:8,padding:12}}>{['home','study','mixed','actions','result','capture','settings','plan'].map(s=><button key={s} style={{minHeight:44,padding:'8px 12px',border:'1px solid #aaa'}} onClick={()=>setScreen(s)}>{s}</button>)}</nav><p role="status" style={{padding:'0 16px'}}>{notice || '合成测试数据 · 不会读写正式账号'}</p><MobileAppHeader title={localScreen?.label || screen} showBack={screen!=='home'} backLabel="返回" onBack={()=>localScreen ? localScreen.close() : setScreen('home')} onSettings={()=>setScreen('settings')} settingsLabel="设置"/><DesktopPageHeader title={localScreen?.label || screen} labels={labels} showBack={screen!=='home'} onBack={()=>localScreen ? localScreen.close() : setScreen('home')}/><section style={{maxWidth:980,margin:'0 auto',padding:16}}>
 {screen==='home' && <HomeDashboard {...common} token="" username="测试学习者" dueItems={[]} plan={plan} todayPractices={[]} onOpenReviewItem={action('review')} onOpenDraft={action('draft')} onNavigate={navigate} onStartDailyPractice={action('start')} onCreateDailyPractice={action('prepare')} onOpenPracticeHistory={action('history')} onStartMock={action('mock')} onTaskStatus={async()=>{throw new Error('测试：保存失败')}}/>}
 {screen==='study' && <StudyModulesHub {...common} onNavigate={navigate}/>}
 {screen==='actions' && <ModuleActionBar label="词汇资料" title="词汇" count="12 项" primary={{label:'开始练习',onClick:action('开始练习')}} actions={[{key:'add',label:'添加单词',onClick:action('添加单词')},{key:'tips',label:'学习方法',onClick:action('学习方法')},{key:'disabled',label:'不可用操作',disabled:true,onClick:action('不应触发')}]} contentActions={[{key:'import',label:'导入内容',onClick:action('导入内容')}]} onAsk={async()=>{setNotice('提问保存成功')}}/>}
 {screen==='mixed' && <MixedPracticeHub {...common} questions={[question]} items={[]} progress={{}} modules={[]} captures={[]} drafts={[]} listeningQuestions={[]} readingQuestions={[]} studyPlan={plan} onStart={action('综合练习')} onStartMock={action('模拟考试')} onNavigate={navigate} onStartModule={action('专项练习')}/>}
 {screen==='result' && <PracticeReviewPanel {...common} questions={[question]} answers={{'qa-q1':{selected:'ために',correct:false}}} items={[]} practiceTitle="今日语法练习" showRuby={false} onRestart={action('重新练习')} onBackToPractice={action('返回练习')}/>}
 {screen==='capture' && <CapturePanel labels={labels} deckLabels={deckLabelsFor('zh-CN')} wordbooks={[]} onSave={async()=>{throw new Error('测试：保存失败，正文应保留')}} onCreateWordbook={async()=>null} onOpenHistory={action('输入记录')}/>}
 {screen==='settings' && <SettingsView labels={labels} settings={settings} username="测试学习者" authToken="" activeSection={section} onOpenSection={setSection} onLogout={action('退出')} onUpdateSettings={setSettings}/>}
 {screen==='plan' && <PlanCalendar {...common} tasks={plan.tasks} summaries={[]} evidence={[]} onTaskStatus={async()=>{throw new Error('测试：任务更新失败')}}/>}
 </section></main></AuthoringNavigationProvider></PageChromeProvider></ConfirmationProvider>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
