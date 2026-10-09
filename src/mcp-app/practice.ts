// MCP App の練習画面（start_practice / get_practice の結果を表示）。チャットのホストの iframe の中で動き、
// 答えは同じサーバーの submit_answer で記録する。正解と解説は答えた問題だけサーバーが返す。
// vite.mcp-app.config.ts で 1 つの IIFE にまとめ、server/mcp-ui.mjs が埋め込む。
import { App, applyDocumentTheme, applyHostStyleVariables } from '@modelcontextprotocol/ext-apps';
import type { McpUiHostContext } from '@modelcontextprotocol/ext-apps';
import type { Attempt, AttemptItem, TextValue } from '../v3/types';
import './practice.css';

const root = document.getElementById('app') as HTMLElement;
const app = new App({ name: 'jlpt-practice', version: '2.0.0' });
let attempt: Attempt | null = null;
let index = 0;
let busy = false;
let error = '';
let shownAt = Date.now();

const textOf = (value: TextValue | undefined) => (value && typeof value === 'object' ? value.text : value ?? '');
const node = (tag: string, text = '', className = '') => { const el = document.createElement(tag); if (text) el.textContent = text; if (className) el.className = className; return el; };
const contentText = (content: unknown) => (Array.isArray(content) ? content.map((b) => (b?.type === 'text' ? String(b.text) : '')).join('\n').trim() : '');
const eventId = () => (crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

/** 問題文の標記（下線・空欄）を付けて表示。 */
function marked(text: string, marks: { start: number; end: number; kind: string; material?: string | null }[]) {
  const el = node('p', '', 'prompt');
  el.lang = 'ja';
  let at = 0;
  for (const m of [...marks].filter((x) => !x.material).sort((a, b) => a.start - b.start)) {
    if (m.start < at) continue;
    el.append(text.slice(at, m.start));
    const mark = node('mark', text.slice(m.start, m.end) || '　', `mark-${m.kind}`);
    el.append(mark);
    at = m.end;
  }
  el.append(text.slice(at));
  return el;
}

function accept(result: { isError?: boolean; structuredContent?: unknown; content?: unknown }) {
  const data = result.structuredContent as Attempt | undefined;
  if (result.isError || !data?.items) { error = contentText(result.content) || '没有拿到练习内容'; render(); return; }
  attempt = data;
  const first = data.items.findIndex((i) => !i.answer && i.question);
  index = data.completedAt || first < 0 ? data.items.length : first;
  error = '';
  shownAt = Date.now();
  render();
}

async function answer(item: AttemptItem, payload: { selectedOptionId?: number; answerText?: string }) {
  if (!attempt || busy || !item.question) return;
  busy = true; error = ''; render();
  try {
    const result = await app.callServerTool({ name: 'submit_answer', arguments: { attempt: attempt.code, question: item.question.code, ...payload, eventId: eventId(), elapsedMs: Date.now() - shownAt } });
    const data = result.structuredContent as { item?: AttemptItem; summary?: Attempt['summary'] } | undefined;
    if (result.isError || !data?.item) throw new Error(contentText(result.content) || '提交失败');
    attempt.items = attempt.items.map((x) => (x.position === data.item!.position ? data.item! : x));
    if (data.summary) attempt.summary = data.summary;
  } catch (cause) { error = cause instanceof Error ? cause.message : String(cause); }
  finally { busy = false; render(); }
}

async function finish() {
  if (!attempt || busy) return;
  busy = true; render();
  try {
    const result = await app.callServerTool({ name: 'complete_practice', arguments: { attempt: attempt.code } });
    if (result.isError) throw new Error(contentText(result.content));
    accept(result);
  } catch (cause) { error = cause instanceof Error ? cause.message : String(cause); }
  finally { busy = false; render(); }
}

function next() {
  if (!attempt) return;
  const following = attempt.items.findIndex((x, i) => i > index && !x.answer && x.question);
  index = following >= 0 ? following : attempt.items.length;
  shownAt = Date.now();
  render();
}

function questionView(item: AttemptItem) {
  const q = item.question!;
  const group = attempt!.groups[q.group];
  const card = node('article', '', 'question');
  if (group?.instruction) card.append(node('p', group.instruction, 'instruction'));
  for (const m of group?.materials ?? []) {
    if (m.body) { const p = node('p', m.body, 'passage'); p.lang = 'ja'; card.append(p); }
    if (m.kind === 'audio') card.append(node('p', '（音频请在网页或手机上播放）', 'muted'));
    if (item.result && m.transcript) { const p = node('p', m.transcript, 'passage'); p.lang = 'ja'; card.append(p); }
  }
  if (q.prompt) card.append(marked(q.prompt, q.marks));
  if (q.options.length) {
    const list = node('ol', '', 'choices');
    q.options.forEach((o, i) => {
      const li = node('li');
      const button = node('button', `${i + 1}. ${o.text ?? ''}`) as HTMLButtonElement;
      button.type = 'button';
      button.disabled = busy || Boolean(item.answer);
      if (item.result) {
        if (o.id === item.result.correctOptionId) button.dataset.state = 'correct';
        else if (item.answer?.selectedOptionId === o.id) button.dataset.state = 'wrong';
        const analysis = item.result.options.find((x) => x.id === o.id);
        if (analysis && textOf(analysis.analysis)) li.append(button, node('p', textOf(analysis.analysis), 'analysis'));
        else li.append(button);
      } else li.append(button);
      button.addEventListener('click', () => void answer(item, { selectedOptionId: o.id }));
      list.append(li);
    });
    card.append(list);
  } else if (!item.answer) {
    const form = node('form', '', 'text-answer') as HTMLFormElement;
    const input = node('textarea') as HTMLTextAreaElement;
    input.rows = 3; input.lang = 'ja'; input.placeholder = '输入你的答案';
    const submit = node('button', '提交') as HTMLButtonElement;
    submit.type = 'submit'; submit.disabled = busy;
    form.append(input, submit);
    form.addEventListener('submit', (e) => { e.preventDefault(); if (input.value.trim()) void answer(item, { answerText: input.value }); });
    card.append(form);
  }
  if (item.answer && item.result) {
    const result = node('section', '', 'result');
    result.append(node('strong', item.answer.correct == null ? '已记录' : item.answer.correct ? '回答正确' : '回答错误'));
    if (item.result.expectedText) result.append(node('p', `参考答案：${item.result.expectedText}`));
    if (textOf(item.result.translation)) result.append(node('p', textOf(item.result.translation), 'muted'));
    for (const s of item.result.explanation) result.append(node('p', `${textOf(s.title) ? `${textOf(s.title)}：` : ''}${textOf(s.body)}`, 'explanation'));
    card.append(result);
  }
  return card;
}

function render() {
  const main = node('main', '', 'practice');
  main.append(node('span', 'JLPT · 练习', 'eyebrow'));
  if (error) { const alert = node('p', error, 'error'); alert.setAttribute('role', 'alert'); main.append(alert); }
  if (!attempt) { main.append(node('p', busy ? '正在读取…' : '等待练习内容…', 'muted')); root.replaceChildren(main); return; }
  main.append(node('h1', textOf(attempt.title) || attempt.code));
  main.append(node('p', `${attempt.summary.answered} / ${attempt.summary.total} 已答 · 答对 ${attempt.summary.correct}`, 'muted'));
  const item = attempt.items[index];
  if (item?.question && !attempt.completedAt) {
    main.append(node('p', `第 ${index + 1} 题 / 共 ${attempt.items.length} 题`, 'position'));
    main.append(questionView(item));
    const nav = node('nav');
    if (item.answer) { const nextButton = node('button', '下一题') as HTMLButtonElement; nextButton.type = 'button'; nextButton.addEventListener('click', next); nav.append(nextButton); }
    const end = node('button', '结束练习') as HTMLButtonElement;
    end.type = 'button'; end.disabled = busy; end.addEventListener('click', () => void finish());
    nav.append(end);
    main.append(nav);
  } else {
    main.append(node('h2', `练习结果：答对 ${attempt.summary.correct} / ${attempt.summary.scored}`));
    if (!attempt.completedAt) { const end = node('button', '结束并保存') as HTMLButtonElement; end.type = 'button'; end.disabled = busy; end.addEventListener('click', () => void finish()); main.append(end); }
  }
  root.replaceChildren(main);
}

app.ontoolresult = accept;
app.onhostcontextchanged = applyHost;
render();
app.connect().then(() => applyHost(app.getHostContext() ?? {})).catch((cause) => { error = `无法连接宿主：${cause instanceof Error ? cause.message : String(cause)}`; render(); });

function applyHost(context: Partial<McpUiHostContext>) {
  if (context.theme) applyDocumentTheme(context.theme);
  if (context.styles?.variables) applyHostStyleVariables(context.styles.variables);
}
