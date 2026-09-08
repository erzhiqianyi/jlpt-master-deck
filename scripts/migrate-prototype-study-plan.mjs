import { getDb, getStudyPlan, saveGeneratedStudyPlan, saveStudyPlanProfile } from '../server/storage.mjs';

const username = process.argv[2];
if (!username) throw new Error('Usage: npm run plan:migrate-prototype -- <username>');
const db = getDb();
const user = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
if (!user) throw new Error(`User not found: ${username}`);

const current = getStudyPlan(user.id);
const completedById = new Map(current.tasks.filter((task) => task.status === 'completed').map((task) => [task.id, task]));
const completedByDateModule = new Map();
for (const task of current.tasks.filter((item) => item.status === 'completed')) {
  const key = `${task.date}:${task.module}`;
  const bucket = completedByDateModule.get(key) ?? [];
  bucket.push(task);
  completedByDateModule.set(key, bucket);
}

const books = [
  {
    id: 'shin-kanzen-grammar', module: 'grammar', title: '新完全マスター N1 文法', sourceLabel: '新完全マスター N1 文法',
    catalog: ['时间关系', '范围的开始与限度', '限定・非限定', '附加・并列', '相关・对应', '无关・排除', '例示・话题', '程度・比较', '选择・取舍', '主张・断定', '评价・感想', '可能・不可能', '难易・倾向', '状态・样子', '时间与场面', '原因・理由', '逆接・让步', '假定条件', '目的・手段', '敬语与书面表达'].map((title, index) => ({ title: `第${index + 1}课・${title}`, scope: `目录第 ${index + 1} 章`, focus: '整理接续格式、例句、语域与使用限制' })),
  },
  {
    id: 'shin-kanzen-reading', module: 'reading', title: '新完全マスター N1 読解', sourceLabel: '新完全マスター N1 読解',
    catalog: [
      ['第1部・对比与换言', 'p.4–19', '标出对比词和换言线索'], ['第1部・比喻与疑问提示', 'p.20–31', '抓住论点提示并写一句主旨'], ['第1部・因果关系', 'p.32–43', '区分事实原因与作者判断'], ['第1部・指示词定位', 'p.44–55', '还原指示词指向的范围'], ['第1部・主张与举例', 'p.56–67', '区分核心结论与说明例子'], ['第1部・选项范围判断', 'p.68–79', '排除绝对化和范围扩大的选项'], ['第2部・短文内容理解', 'p.82–95', '在目标时间内完成 3 篇短文'], ['第2部・中文结构识别', 'p.96–111', '先划分段落功能再定位答案'], ['第2部・长文主张理解', 'p.112–129', '记录转折后的评价与结论'], ['第2部・抽象论说文', 'p.130–145', '把抽象概念换写成一句白话'], ['第3部・综合理解', 'p.148–163', '比较两篇文章的共同点与差异'], ['第3部・信息检索', 'p.164–177', '先读条件，再扫描表格与通知'],
    ].map(([title, scope, focus]) => ({ title, scope, focus })),
  },
  {
    id: 'shin-kanzen-listening', module: 'listening', title: '新完全マスター N1 聴解', sourceLabel: '新完全マスター N1 聴解',
    catalog: [
      ['课题理解・行动与顺序', '第1单元', '听清最终行动以及先后顺序'], ['课题理解・条件筛选', '第2单元', '记录人物、时间、地点和限制条件'], ['要点理解・原因', '第3单元', '锁定原因与最终决定'], ['要点理解・意见', '第4单元', '区分事实陈述和个人评价'], ['概要理解・主题', '第5单元', '判断整段话题和立场'], ['概要理解・主张', '第6单元', '捕捉转折、总结和强调表达'], ['即时应答・日常表达', '第7单元', '根据语气选择自然回应'], ['即时应答・敬语方向', '第8单元', '判断谁为谁实施动作'], ['综合理解・多人对话', '第9单元', '分别记录人物意见与最后决定'], ['综合理解・条件比较', '第10单元', '排除不满足条件的方案'],
    ].map(([title, scope, focus]) => ({ title, scope, focus })),
  },
];

const profile = {
  ...current.profile,
  startDate: '2026-09-01',
  examDate: '2026-12-06',
  studyDaysPerWeek: 7,
  dailyMinutes: 90,
  materials: books.map((book) => ({ id: book.id, title: book.title, module: book.module, currentPosition: book.catalog.map((unit) => `${unit.title}｜${unit.scope}｜${unit.focus}`).join('\n') })),
  materialStartStatus: 'in_progress',
  phaseStrategy: '2026-09-01 到 2026-10-18 教材基础；2026-10-19 到 2026-11-15 弱项强化；2026-11-16 到 2026-12-05 真题模拟与次日复盘；2026-12-06 正式考试。',
  postMaterialStrategy: '强化期按错题类型限时补强；模拟期完成整套正式计时、次日错因分析与同题型二刷。',
  goal: '以 2026-12-06 JLPT N1 为目标，先按三本《新完全マスター》目录建立基础，再进入弱项限时强化，最后完成三次真题规格模拟、次日分析与同类补强。',
};

const phases = [
  { id: 'foundation', startDate: '2026-09-01', endDate: '2026-10-18', focus: '教材基础', points: ['三本教材按目录同步推进', '每天保留文法、读解、听解三条任务', '记录接续、依据位置与漏听点'], goal: '完成三本教材的一轮目录学习并留下可复盘证据。' },
  { id: 'intensive', startDate: '2026-10-19', endDate: '2026-11-15', focus: '弱项强化', points: ['按错题类型限时补强', '读解记录定位时间与犹豫选项', '听解错题二刷并标记转折'], goal: '把高频错误收束到具体题型，并提高限时完成稳定性。' },
  { id: 'mock', startDate: '2026-11-16', endDate: '2026-12-05', focus: '真题模拟', points: ['11月16日、23日、29日整套计时', '模拟次日拆分耗时与错因', '未来三天完成同题型补强'], goal: '建立正式考试节奏，完成模拟、分析、补强闭环。' },
  { id: 'exam', startDate: '2026-12-06', endDate: '2026-12-06', focus: '正式考试', points: ['只做轻量热身', '确认准考证、路线、时间与文具'], goal: '以稳定状态完成 JLPT N1 正式考试。' },
];

const tasks = [];

function addFoundationTasks(date) {
  const index = daysBetween(profile.startDate, date);
  for (const [book, minutes] of [[books[0], 30], [books[1], 30], [books[2], 15]]) {
    const unit = book.catalog[index % book.catalog.length];
    const round = Math.floor(index / book.catalog.length) + 1;
    addTask({ id: `prototype-${date}-${book.module}`, date, module: book.module, minutes, title: `${unit.title}${round > 1 ? `・第${round}轮` : ''}`, detail: `${unit.scope} · ${unit.focus}`, sourceLabel: book.sourceLabel, materialId: book.id });
  }
}

const intensiveThemes = [
  ['时间・条件表达', '短文主张理解', '课题理解'], ['限定・程度表达', '中文结构与指示词', '要点理解'], ['原因・逆接表达', '长文观点定位', '概要理解'], ['评价・断定表达', '综合理解', '即时应答'], ['敬语・书面表达', '信息检索', '综合理解'],
];
function addIntensiveTasks(date) {
  const index = daysBetween('2026-10-19', date);
  const theme = intensiveThemes[index % intensiveThemes.length];
  const round = Math.floor(index / intensiveThemes.length) + 1;
  addTask({ id: `prototype-${date}-grammar`, date, module: 'grammar', minutes: 30, title: `${theme[0]}・第${round}轮限时`, detail: '完成形式判断与句子重组各一组；按接续、语义或语域标记错因。', sourceLabel: '文法强化' });
  addTask({ id: `prototype-${date}-reading`, date, module: 'reading', minutes: 35, title: `${theme[1]}・限时训练`, detail: '记录定位时间、超时位置与两个最犹豫的选项，并在结束后复盘。', sourceLabel: '读解强化' });
  addTask({ id: `prototype-${date}-listening`, date, module: 'listening', minutes: 25, title: `${theme[2]}・错题二刷`, detail: '先按正式速度作答，再复听错题；记录漏听词、转折和最终决定。', sourceLabel: '听解强化' });
}

const mockDates = ['2026-11-16', '2026-11-23', '2026-11-29'];
const reviewDates = ['2026-11-17', '2026-11-24', '2026-11-30'];
const weakRotations = [['文法接续与句子重组', '读解长文超时', '听解即时应答'], ['词汇语境与近义词', '读解综合理解', '听解概要理解'], ['文法语域与限制', '读解信息检索', '听解课题理解']];
function addMockPhaseTasks(date) {
  if (mockDates.includes(date)) {
    const round = mockDates.indexOf(date) + 1;
    addTask({ id: `prototype-${date}-mock-main`, date, module: 'other', minutes: 110, title: `第 ${round} 次・言语知识与读解`, detail: '使用你持有的真题或官方样题，连续完成 110 分钟，不中途查词。', sourceLabel: '整套模拟', workloadKind: 'full_mock' });
    addTask({ id: `prototype-${date}-mock-listening`, date, module: 'listening', minutes: 55, title: `第 ${round} 次・听解`, detail: '按正式节奏完成 55 分钟；只记录题号与把握度，不暂停音频。', sourceLabel: '整套模拟', workloadKind: 'full_mock' });
    addTask({ id: `prototype-${date}-mock-mark`, date, module: 'other', minutes: 20, title: '标记超时、猜测与失分题', detail: '当天只做快速标记，详细错因分析安排在次日。', sourceLabel: '快速标记', workloadKind: 'full_mock' });
    return;
  }
  if (reviewDates.includes(date)) {
    addTask({ id: `prototype-${date}-review-data`, date, module: 'other', minutes: 25, title: '按科目拆分耗时与正确率', detail: '整理言语知识、读解与听解的正确率，标出超时区间和低把握题。', sourceLabel: '模拟复盘' });
    addTask({ id: `prototype-${date}-review-errors`, date, module: 'other', minutes: 35, title: '逐题判断知识、定位或听取错误', detail: '每道错题只选择一个主要错因，并保存原题型与依据。', sourceLabel: '错因分析' });
    addTask({ id: `prototype-${date}-review-remedy`, date, module: 'other', minutes: 20, title: '生成三科同题型二刷清单', detail: '文法、读解、听解各选择最弱题型，安排未来三天复习。', sourceLabel: '补强清单' });
    return;
  }
  const rotation = weakRotations[daysBetween('2026-11-16', date) % weakRotations.length];
  addTask({ id: `prototype-${date}-grammar`, date, module: 'grammar', minutes: 25, title: rotation[0], detail: '只复习模拟结果暴露的高频错误，不扩充新的知识范围。', sourceLabel: '言语知识' });
  addTask({ id: `prototype-${date}-reading`, date, module: 'reading', minutes: 30, title: rotation[1], detail: '完成 2–3 道同题型题，比较定位速度和选项排除依据。', sourceLabel: '读解' });
  addTask({ id: `prototype-${date}-listening`, date, module: 'listening', minutes: 20, title: rotation[2], detail: '完成一组同题型训练，复听仅限错题与低把握题。', sourceLabel: '听解' });
}

function addTask(task) {
  const previous = completedById.get(task.id) ?? completedByDateModule.get(`${task.date}:${task.module}`)?.shift();
  tasks.push({ ...task, status: previous ? 'completed' : 'pending', ...(previous?.completedAt ? { completedAt: previous.completedAt } : {}) });
}
function parseDate(value) { return new Date(`${value}T00:00:00Z`); }
function addDays(date, days) { const next = new Date(date); next.setUTCDate(next.getUTCDate() + days); return next; }
function dateKey(date) { return date.toISOString().slice(0, 10); }
function daysBetween(start, end) { return Math.floor((parseDate(end) - parseDate(start)) / 86_400_000); }

for (let date = parseDate(profile.startDate); date <= parseDate('2026-12-05'); date = addDays(date, 1)) {
  const key = dateKey(date);
  if (key <= '2026-10-18') addFoundationTasks(key);
  else if (key <= '2026-11-15') addIntensiveTasks(key);
  else addMockPhaseTasks(key);
}
addTask({ id: 'prototype-2026-12-06-exam', date: '2026-12-06', module: 'other', minutes: 30, title: 'JLPT N1 正式考试日：轻量热身与流程确认', detail: '不再学习新内容；确认准考证、路线、时间和文具，轻读错题摘要并保持听力耳感。', sourceLabel: '正式考试' });

// Use a temporary date window that contains both the old and prototype plans.
// This keeps storage validation active for accounts with legacy tasks as well as
// accounts whose empty default profile starts after the prototype start date.
saveStudyPlanProfile(user.id, {
  ...current.profile,
  startDate: current.profile.startDate < profile.startDate ? current.profile.startDate : profile.startDate,
  examDate: current.profile.examDate > profile.examDate ? current.profile.examDate : profile.examDate,
});
saveGeneratedStudyPlan(user.id, { phases, tasks });
saveStudyPlanProfile(user.id, profile);
const saved = saveGeneratedStudyPlan(user.id, { phases, tasks });
console.log(JSON.stringify({ userId: user.id, phases: saved.phases.length, tasks: saved.tasks.length, completed: saved.tasks.filter((task) => task.status === 'completed').length, startDate: saved.profile.startDate, examDate: saved.profile.examDate }, null, 2));
