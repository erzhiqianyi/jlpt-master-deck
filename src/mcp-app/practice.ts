// MCP App view for `start_topic_practice` / `get_practice_session`. Runs inside the chat host's
// iframe: receives the session from the tool result, then answers questions by calling
// `submit_practice_answer` on the same server with the same grant. Built to a single IIFE by
// vite.mcp-app.config.ts and inlined by server/mcp-ui.mjs.
import { App, applyDocumentTheme, applyHostStyleVariables } from '@modelcontextprotocol/ext-apps';
import type { McpUiHostContext } from '@modelcontextprotocol/ext-apps';
import './practice.css';

type ChoiceAnalysis = { choice: string; correct: boolean; explanation: string };
type SessionQuestion = {
  reference?: string;
  id: string;
  itemId: string;
  kind: string;
  title: string;
  instruction?: string;
  prompt: string;
  promptTarget?: string;
  choices: string[];
  translationZh?: string;
  answered: boolean;
  selected?: string;
  correct?: boolean;
  answer?: string;
  correctReason?: string;
  memoryPoint?: string;
  choiceAnalysis?: ChoiceAnalysis[];
};
type Session = {
  reference?: string;
  id: string;
  title: string;
  filters?: Record<string, unknown> | null;
  questions: SessionQuestion[];
  progress: { total: number; answered: number; correct: number; wrong: number };
  completed: boolean;
};
type SubmitResult = { question: SessionQuestion; progress: Session['progress']; completed: boolean; next: SessionQuestion | null };

const root = document.getElementById('app') as HTMLElement;
const app = new App({ name: 'jlpt-practice', version: '1.0.0' });

let session: Session | null = null;
let index = 0;
let busy = false;
let error = '';

app.ontoolresult = (result) => {
  const data = result.structuredContent as Session | undefined;
  if (result.isError || !data?.questions) {
    error = textOf(result.content) || '没有拿到练习内容';
    render();
    return;
  }
  session = data;
  index = Math.max(0, session.questions.findIndex((question) => !question.answered));
  if (index < 0 || session.completed) index = session.questions.length;
  error = '';
  render();
};
app.onhostcontextchanged = applyHost;

render();
app.connect().then(() => applyHost(app.getHostContext() ?? {})).catch((cause) => {
  error = `无法连接宿主：${cause instanceof Error ? cause.message : String(cause)}`;
  render();
});

function applyHost(context: Partial<McpUiHostContext>) {
  if (context.theme) applyDocumentTheme(context.theme);
  if (context.styles?.variables) applyHostStyleVariables(context.styles.variables);
}

function textOf(content: unknown) {
  return Array.isArray(content) ? content.map((block) => (block?.type === 'text' ? String(block.text) : '')).join('\n').trim() : '';
}

async function choose(choice: string) {
  if (!session || busy) return;
  const question = session.questions[index];
  if (!question || question.answered) return;
  busy = true;
  error = '';
  render();
  try {
    const result = await app.callServerTool({ name: 'submit_practice_answer', arguments: { practice_id: session.id, question_id: question.id, selected: choice } });
    const data = result.structuredContent as SubmitResult | undefined;
    if (result.isError || !data?.question) throw new Error(textOf(result.content) || '提交失败');
    session.questions[index] = data.question;
    session.progress = data.progress;
    session.completed = data.completed;
  } catch (cause) {
    error = cause instanceof Error ? cause.message : String(cause);
  } finally {
    busy = false;
    render();
  }
}

function next() {
  if (!session) return;
  const following = session.questions.findIndex((question, position) => position > index && !question.answered);
  index = following >= 0 ? following : session.questions.length;
  render();
}

async function again() {
  if (!session || busy) return;
  busy = true;
  render();
  try {
    const filters = session.filters ?? {};
    const result = await app.callServerTool({ name: 'start_topic_practice', arguments: {
      deck: filters.deck ?? undefined,
      kinds: filters.kinds ?? undefined,
      wordbook_id: filters.wordbookId ?? undefined,
      jlpt_level: filters.jlptLevel ?? undefined,
      only_due: filters.onlyDue ?? undefined,
      count: filters.count ?? undefined,
    } });
    const data = result.structuredContent as Session | undefined;
    if (result.isError || !data?.questions) throw new Error(textOf(result.content) || '生成失败');
    session = data;
    index = 0;
    error = '';
  } catch (cause) {
    error = cause instanceof Error ? cause.message : String(cause);
  } finally {
    busy = false;
    render();
  }
}

async function askAgent() {
  if (!session) return;
  const wrong = session.questions.filter((question) => question.answered && !question.correct);
  const lines = wrong.map((question) => `- ${question.prompt}（我选了「${question.selected}」，正确是「${question.answer}」）`);
  const text = wrong.length
    ? `请逐题讲解我在「${session.title}」里做错的题，说明正确答案为什么成立、我选的选项错在哪里：\n${lines.join('\n')}`
    : `我刚完成「${session.title}」并全部答对，请点评一下并推荐下一组练习。`;
  await app.sendMessage({ role: 'user', content: [{ type: 'text', text }] });
}

function render() {
  root.replaceChildren(session ? (index >= session.questions.length ? summaryView(session) : questionView(session, session.questions[index])) : emptyView());
}

function emptyView() {
  return el('div', { class: 'card' }, [el('p', { class: 'empty' }, [error || '正在加载练习…'])]);
}

function questionView(current: Session, question: SessionQuestion) {
  const answered = question.answered;
  const analysis = new Map((question.choiceAnalysis ?? []).map((entry) => [entry.choice, entry.explanation]));
  return el('div', { class: 'card' }, [
    header(current),
    el('span', { class: 'kind' }, [question.title || question.kind]),
    question.reference ? el('p', { class: 'meta' }, [question.reference]) : null,
    question.instruction ? el('p', { class: 'instruction' }, [question.instruction]) : null,
    el('p', { class: 'prompt' }, promptNodes(question)),
    answered && question.translationZh ? el('p', { class: 'translation' }, [question.translationZh]) : null,
    el('ul', { class: 'choices' }, question.choices.map((choice, position) => {
      const classes = ['choice'];
      if (answered && choice === question.answer) classes.push('correct');
      else if (answered && choice === question.selected) classes.push('wrong');
      const why = answered ? analysis.get(choice) : '';
      return el('li', {}, [el('button', {
        class: classes.join(' '),
        type: 'button',
        disabled: answered || busy ? 'disabled' : null,
        onclick: () => choose(choice),
      }, [
        el('span', { class: 'n' }, [String.fromCharCode(65 + position)]),
        el('span', {}, [choice, why ? el('span', { class: 'why' }, [why]) : null]),
      ])]);
    })),
    answered ? el('p', { class: `verdict ${question.correct ? 'ok' : 'bad'}` }, [question.correct ? '答对了' : `答错了 · 正确答案：${question.answer}`]) : null,
    answered && question.correctReason ? el('p', { class: 'reason' }, [question.correctReason]) : null,
    answered && question.memoryPoint && question.memoryPoint !== question.correctReason ? el('p', { class: 'memory' }, [question.memoryPoint]) : null,
    error ? el('p', { class: 'error' }, [error]) : null,
    el('div', { class: 'actions' }, [
      answered ? el('button', { class: 'btn', type: 'button', onclick: next }, [current.progress.answered >= current.progress.total ? '查看结果' : '下一题']) : null,
    ]),
  ]);
}

function summaryView(current: Session) {
  const { total, correct, wrong } = current.progress;
  const accuracy = total ? Math.round((correct / total) * 100) : 0;
  return el('div', { class: 'card' }, [
    header(current),
    el('div', { class: 'summary' }, [
      stat(String(total), '题'),
      stat(String(correct), '答对'),
      stat(`${accuracy}%`, '正确率'),
    ]),
    el('ul', { class: 'review' }, current.questions.map((question) => el('li', {}, [
      el('span', { class: `dot ${question.correct ? '' : 'bad'}` }),
      el('span', {}, [question.promptTarget || question.prompt, question.correct ? null : el('span', { class: 'ans' }, [` → ${question.answer}`])]),
    ]))),
    error ? el('p', { class: 'error' }, [error]) : null,
    el('div', { class: 'actions' }, [
      el('button', { class: 'btn', type: 'button', disabled: busy ? 'disabled' : null, onclick: askAgent }, [wrong ? '让 AI 讲解错题' : '让 AI 点评']),
      el('button', { class: 'btn ghost', type: 'button', disabled: busy ? 'disabled' : null, onclick: again }, ['再来一组']),
    ]),
  ]);
}

function header(current: Session) {
  const { total, answered } = current.progress;
  const position = index < total ? `${index + 1} / ${total}` : `${answered} / ${total}`;
  return el('div', {}, [
    el('div', { class: 'head' }, [
      el('h2', { class: 'title' }, [current.title]),
      current.reference ? el('span', { class: 'meta' }, [current.reference]) : null,
      el('span', { class: 'meta' }, [position]),
    ]),
    el('div', { class: 'bar' }, [el('i', { style: `width:${total ? (answered / total) * 100 : 0}%` })]),
  ]);
}

function stat(value: string, label: string) {
  return el('div', { class: 'stat' }, [el('b', {}, [value]), el('span', {}, [label])]);
}

/** Underline the target expression inside the prompt when the sentence contains it. */
function promptNodes(question: SessionQuestion): (Node | string | null)[] {
  const target = question.promptTarget?.trim();
  if (!target || !question.prompt.includes(target) || question.prompt === target) return [question.prompt];
  const [before, ...rest] = question.prompt.split(target);
  return [before, el('mark', {}, [target]), rest.join(target)];
}

function el(tag: string, attrs: Record<string, string | null | (() => void)> = {}, children: (Node | string | null | undefined)[] = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null) continue;
    if (typeof value === 'function') (node as unknown as Record<string, unknown>)[key] = value;
    else node.setAttribute(key, value);
  }
  for (const child of children) {
    if (child == null) continue;
    node.append(child);
  }
  return node;
}
