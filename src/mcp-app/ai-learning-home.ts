import { App, applyDocumentTheme, applyHostStyleVariables } from '@modelcontextprotocol/ext-apps';
import type { McpUiHostContext } from '@modelcontextprotocol/ext-apps';
import './ai-learning-home.css';

type Home = {
  title: string; date: string;
  due: { total: number; vocabulary: number; grammar: number };
  reviewed_today: number;
  recent_practices: { id: string; title: string; date: string; questionCount: number; minutes: number }[];
  actions: { id: string; title: string; prompt: string }[];
};

const app = new App({ name: 'jlpt-ai-learning-home', version: '1.0.0' });
const root = document.getElementById('app')!;
let home: Home | null = null;
let error = '';
let busy = false;

const element = (tag: string, text = '', className = '') => {
  const node = document.createElement(tag);
  node.textContent = text;
  node.className = className;
  return node;
};
const button = (text = '', className = '') => {
  const node = document.createElement('button');
  node.type = 'button'; node.textContent = text; node.className = className;
  return node;
};

function accept(result: { isError?: boolean; structuredContent?: unknown }) {
  const data = result.structuredContent as Home | undefined;
  if (result.isError || !data?.due || !Array.isArray(data.actions)) {
    error = '无法读取学习首页，请检查账号连接后重试。'; render(); return;
  }
  home = data; error = ''; render();
}

async function load() {
  if (busy) return;
  busy = true; render();
  try { accept(await app.callServerTool({ name: 'get_ai_learning_home', arguments: {} })); }
  catch (cause) { error = cause instanceof Error ? cause.message : String(cause); }
  finally { busy = false; render(); }
}

async function ask(prompt: string) {
  if (busy) return;
  busy = true; render();
  try { await app.sendMessage({ role: 'user', content: [{ type: 'text', text: prompt }] }); }
  catch (cause) { error = cause instanceof Error ? cause.message : String(cause); }
  finally { busy = false; render(); }
}

function render() {
  const main = element('main', '', 'ai-home');
  const header = element('header', '', 'hero');
  header.append(element('span', 'JLPT MASTER DECK', 'eyebrow'), element('h1', '今天从这里开始'), element('p', '选一个方向，直接在对话里完成练习。学习进度会保存到你的账号。', 'lead'));
  main.append(header);
  if (error) { const alert = element('p', error, 'error'); alert.setAttribute('role', 'alert'); main.append(alert); }
  if (home) {
    const stats = element('section', '', 'stats'); stats.setAttribute('aria-label', '今日学习概览');
    for (const [value, label] of [[home.due.total, '到期卡片'], [home.reviewed_today, '今天已复习'], [home.due.vocabulary, '待复习词汇'], [home.due.grammar, '待复习语法']] as const) {
      const stat = element('div', '', 'stat'); stat.append(element('strong', String(value)), element('span', label)); stats.append(stat);
    }
    main.append(stats);
    const section = element('section', '', 'actions');
    section.append(element('h2', '现在练什么'));
    const grid = element('div', '', 'action-grid');
    for (const action of home.actions) {
      const actionButton = button('', 'action'); actionButton.disabled = busy;
      actionButton.append(element('span', action.id === 'cards' ? '01' : action.id === 'vocabulary' ? '02' : action.id === 'grammar' ? '03' : '04', 'action-number'), element('strong', action.title), element('span', action.id === 'cards' ? '翻面、评价并保存下次复习时间' : action.id === 'weaknesses' ? '根据已保存的答题记录安排下一步' : '在对话中一次练一题', 'action-detail'));
      actionButton.addEventListener('click', () => void ask(action.prompt)); grid.append(actionButton);
    }
    section.append(grid); main.append(section);
    if (home.recent_practices.length) {
      const recent = element('section', '', 'recent'); recent.append(element('h2', '最近的正式练习'));
      for (const practice of home.recent_practices) {
        const row = element('div', '', 'recent-row'); row.append(element('strong', practice.title), element('span', `${practice.date} · ${practice.questionCount} 题`)); recent.append(row);
      }
      main.append(recent);
    }
    main.append(element('p', '新闻练习和模拟考试暂未加入 AI 版。', 'footnote'));
  } else {
    main.append(element('p', busy ? '正在读取你的学习概览…' : '连接后查看今日学习概览。', 'empty'));
    const retry = button('重新加载', 'retry'); retry.disabled = busy; retry.addEventListener('click', () => void load()); main.append(retry);
  }
  root.replaceChildren(main);
}

app.ontoolresult = accept;
app.onhostcontextchanged = (context: Partial<McpUiHostContext>) => {
  if (context.theme) applyDocumentTheme(context.theme);
  if (context.styles?.variables) applyHostStyleVariables(context.styles.variables);
};
render();
app.connect().then(() => {
  app.onhostcontextchanged?.(app.getHostContext() ?? {});
  if (!home) void load();
}).catch(() => { error = '请在支持 MCP Apps 的客户端或调试工具中打开学习首页。'; render(); });
