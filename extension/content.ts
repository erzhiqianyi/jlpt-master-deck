import { sendMessage, type CaptureCategory, type VocabMatch, type Wordbook } from './lib/messages';
import { wordbooksForCategory } from './lib/wordbooks';

const JAPANESE_RE = /[぀-ヿ㐀-鿿]/;
const MAX_QUERY_LENGTH = 30;

const host = document.createElement('div');
host.style.position = 'fixed';
host.style.zIndex = '2147483647';
host.style.top = '0';
host.style.left = '0';
const shadow = host.attachShadow({ mode: 'open' });
const style = document.createElement('style');
style.textContent = `
  :host { all: initial; }
  .panel { position: absolute; min-width: 220px; max-width: 320px; background: #fff; color: #1f1f1f;
    border: 1px solid #d8d8d8; border-radius: 10px; box-shadow: 0 8px 24px rgba(0,0,0,0.18);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 13px; line-height: 1.5;
    padding: 10px 12px; }
  .panel h4 { margin: 0 0 6px; font-size: 14px; }
  .panel .reading { color: #666; margin-right: 6px; }
  .panel .meaning { margin: 2px 0 8px; }
  .panel button { font: inherit; border: none; border-radius: 6px; padding: 6px 10px; cursor: pointer;
    background: #2563eb; color: #fff; }
  .panel button:disabled { background: #9ca3af; cursor: default; }
  .panel .status { color: #16a34a; margin-top: 6px; }
  .panel .error { color: #dc2626; margin-top: 6px; }
  .panel .loading { color: #666; }
  .panel .targets { display: flex; gap: 6px; margin-bottom: 8px; }
  .panel select { font: inherit; padding: 4px 6px; border: 1px solid #d8d8d8; border-radius: 6px; flex: 1; min-width: 0; }
`;
shadow.appendChild(style);
const panel = document.createElement('div');
panel.className = 'panel';
panel.style.display = 'none';
shadow.appendChild(panel);
document.documentElement.appendChild(host);

let closeTimer: number | undefined;

function hideOverlay() {
  panel.style.display = 'none';
  panel.innerHTML = '';
}

function positionPanel(rect: DOMRect) {
  const top = window.scrollY + rect.bottom + 6;
  const left = window.scrollX + rect.left;
  panel.style.top = `${top}px`;
  panel.style.left = `${left}px`;
  panel.style.display = 'block';
}

function isEditableTarget(node: Node | null): boolean {
  const element = node instanceof Element ? node : node?.parentElement ?? null;
  return Boolean(element?.closest('input, textarea, [contenteditable="true"], [contenteditable=""]'));
}

function renderLoading() {
  panel.innerHTML = '<p class="loading">查询中…</p>';
}

function meaningOf(item: VocabMatch): string {
  return item.meaning_zh?.trim() || item.meaning_ja?.trim() || '';
}

let wordbooksCache: Wordbook[] | null = null;
async function getWordbooks(): Promise<Wordbook[]> {
  if (wordbooksCache) return wordbooksCache;
  const response = await sendMessage<{ wordbooks: Wordbook[] }>({ type: 'LIST_WORDBOOKS' });
  if (!response.ok) return [];
  wordbooksCache = response.data.wordbooks;
  return wordbooksCache;
}

function renderMatches(word: string, matches: VocabMatch[], context: string) {
  if (matches.length) {
    panel.innerHTML = matches
      .map((item) => `<h4>${escapeHtml(item.original)}${item.reading && item.reading !== word ? ` <span class="reading">${escapeHtml(item.reading)}</span>` : ''}</h4>
        <p class="meaning">${escapeHtml(meaningOf(item) || '暂无释义')}</p>`)
      .join('');
    return;
  }
  panel.innerHTML = `
    <p>暂无释义。</p>
    <div class="targets">
      <select id="jlpt-category">
        <option value="word">单词</option>
        <option value="grammar">语法</option>
      </select>
      <select id="jlpt-wordbook"><option>加载中…</option></select>
    </div>
    <button type="button" id="jlpt-enqueue">加入待解析队列</button>
    <div id="jlpt-enqueue-feedback"></div>
  `;
  const categorySelect = panel.querySelector<HTMLSelectElement>('#jlpt-category');
  const wordbookSelect = panel.querySelector<HTMLSelectElement>('#jlpt-wordbook');
  const button = panel.querySelector<HTMLButtonElement>('#jlpt-enqueue');
  const feedback = panel.querySelector<HTMLDivElement>('#jlpt-enqueue-feedback');

  async function populateWordbooks() {
    if (!categorySelect || !wordbookSelect) return;
    const wordbooks = await getWordbooks();
    const category = categorySelect.value as CaptureCategory;
    const options = wordbooksForCategory(wordbooks, category);
    wordbookSelect.innerHTML = options.length
      ? options.map((book) => `<option value="${escapeHtml(book.id)}">${escapeHtml(book.title)}</option>`).join('')
      : '<option value="">（无可用单词本）</option>';
  }
  categorySelect?.addEventListener('change', populateWordbooks);
  void populateWordbooks();

  button?.addEventListener('click', async () => {
    if (!button || !feedback || !categorySelect || !wordbookSelect) return;
    const wordbooks = await getWordbooks();
    const wordbook = wordbooks.find((book) => book.id === wordbookSelect.value);
    button.disabled = true;
    button.textContent = '正在加入…';
    feedback.textContent = '';
    try {
      const response = await sendMessage({
        type: 'CREATE_CAPTURE',
        input: {
          body: word,
          category: categorySelect.value as CaptureCategory,
          targetDeck: wordbook?.deck,
          targetWordbookId: wordbook?.id,
          context: `插件网页选词\n页面：${location.href}\n原文：${context}`,
        },
      });
      if (!response.ok) throw new Error(response.error);
      button.textContent = '已加入待解析队列';
      feedback.className = 'status';
      feedback.textContent = '解析后可在词库/输入记录里查看。';
    } catch (error) {
      button.disabled = false;
      button.textContent = '加入待解析队列';
      feedback.className = 'error';
      feedback.textContent = error instanceof Error ? error.message : '加入失败，请重试。';
    }
  });
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);
}

async function lookup(word: string, context: string) {
  renderLoading();
  const response = await sendMessage<{ matches: VocabMatch[] }>({ type: 'LOOKUP_WORD', query: word });
  if (!response.ok) {
    panel.innerHTML = `<p class="error">${escapeHtml(response.error)}</p>`;
    return;
  }
  renderMatches(word, response.data.matches, context);
}

function surroundingContext(node: Node | null): string {
  const text = node?.textContent?.trim() ?? '';
  return text.length > 200 ? text.slice(0, 200) : text;
}

document.addEventListener('mouseup', (event) => {
  if (event.composedPath().includes(host)) return; // clicks inside our own overlay (e.g. the enqueue button)
  window.clearTimeout(closeTimer);
  closeTimer = window.setTimeout(() => {
    const selection = window.getSelection();
    const text = selection?.toString().trim() ?? '';
    if (!selection || selection.isCollapsed || !text || text.length > MAX_QUERY_LENGTH || !JAPANESE_RE.test(text) || isEditableTarget(event.target as Node)) {
      hideOverlay();
      return;
    }
    const range = selection.getRangeAt(0);
    positionPanel(range.getBoundingClientRect());
    void lookup(text, surroundingContext(range.startContainer));
  }, 10);
});

document.addEventListener('mousedown', (event) => {
  if (!host.contains(event.target as Node)) hideOverlay();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') hideOverlay();
});
