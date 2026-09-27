import { sendMessage, type AppUser, type CaptureCategory, type CaptureStatus, type LearningCapture, type Wordbook } from './lib/messages';
import { wordbooksForCategory } from './lib/wordbooks';
import { normalizeApiBaseUrl } from './lib/storage';
import { formatIdentity } from './lib/identity';

const accountEl = document.getElementById('account') as HTMLDivElement;
const apiBaseUrlInput = document.getElementById('api-base-url') as HTMLInputElement;
const saveSettingsButton = document.getElementById('save-settings') as HTMLButtonElement;
const tabsEl = document.getElementById('tabs') as HTMLElement;
const listEl = document.getElementById('list') as HTMLElement;
const manualForm = document.getElementById('manual-form') as HTMLFormElement;
const manualBody = document.getElementById('manual-body') as HTMLInputElement;
const manualCategory = document.getElementById('manual-category') as HTMLSelectElement;
const manualWordbookLabel = document.getElementById('manual-wordbook-label') as HTMLElement;
const manualWordbook = document.getElementById('manual-wordbook') as HTMLSelectElement;
const manualContext = document.getElementById('manual-context') as HTMLInputElement;
const manualFeedback = document.getElementById('manual-feedback') as HTMLElement;

let activeStatus: CaptureStatus = 'inbox';
let wordbooksCache: Wordbook[] | null = null;

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);
}

async function refreshAccount() {
  const state = await sendMessage<{ user: AppUser | null; apiBaseUrl: string }>({ type: 'GET_STATE' });
  if (!state.ok) {
    accountEl.innerHTML = `<span class="error">${escapeHtml(state.error)}</span>`;
    return null;
  }
  apiBaseUrlInput.value = state.data.apiBaseUrl;
  accountEl.innerHTML = state.data.user
    ? `<span>已登录：${formatIdentity(state.data.user)}</span> <button id="logout" type="button">退出登录</button>`
    : '<button id="login" type="button">登录</button>';
  document.getElementById('login')?.addEventListener('click', async () => {
    const response = await sendMessage({ type: 'LOGIN' });
    if (!response.ok) { accountEl.innerHTML = `<span class="error">${escapeHtml(response.error)}</span>`; return; }
    await refreshAccount();
    await refreshList();
  });
  document.getElementById('logout')?.addEventListener('click', async () => {
    await sendMessage({ type: 'LOGOUT' });
    await refreshAccount();
    await refreshList();
  });
  return state.data.user;
}

async function getWordbooks(): Promise<Wordbook[]> {
  if (wordbooksCache) return wordbooksCache;
  const response = await sendMessage<{ wordbooks: Wordbook[] }>({ type: 'LIST_WORDBOOKS' });
  wordbooksCache = response.ok ? response.data.wordbooks : [];
  return wordbooksCache;
}

async function refreshManualWordbooks() {
  const category = manualCategory.value as CaptureCategory;
  const supportsWordbook = category === 'word' || category === 'grammar';
  manualWordbookLabel.style.display = supportsWordbook ? '' : 'none';
  if (!supportsWordbook) return;
  const options = wordbooksForCategory(await getWordbooks(), category);
  manualWordbook.innerHTML = options.length
    ? options.map((book) => `<option value="${escapeHtml(book.id)}">${escapeHtml(book.title)}</option>`).join('')
    : '<option value="">（无可用单词本）</option>';
}

function renderCapture(capture: LearningCapture): string {
  const created = capture.createdAt ? new Date(capture.createdAt).toLocaleString() : '';
  return `
    <article class="capture-card" data-id="${escapeHtml(capture.id)}">
      <p class="body">${escapeHtml(capture.body)}</p>
      ${capture.context ? `<p class="context">${escapeHtml(capture.context)}</p>` : ''}
      <p class="meta">${escapeHtml(capture.category)} · ${escapeHtml(created)}</p>
      <div class="actions">
        ${capture.status === 'inbox' ? '<button data-action="processed">标记完成</button><button data-action="archived">归档</button>' : ''}
        ${capture.status === 'processed' ? '<button data-action="inbox">重新加入待处理</button><button data-action="archived">归档</button>' : ''}
        ${capture.status === 'archived' ? '<button data-action="inbox">重新加入待处理</button>' : ''}
      </div>
    </article>
  `;
}

async function refreshList() {
  listEl.innerHTML = '<p class="muted">加载中…</p>';
  const response = await sendMessage<{ captures: LearningCapture[] }>({ type: 'LIST_CAPTURES', status: activeStatus });
  if (!response.ok) {
    listEl.innerHTML = `<p class="error">${escapeHtml(response.error)}</p>`;
    return;
  }
  const captures = response.data.captures;
  listEl.innerHTML = captures.length ? captures.map(renderCapture).join('') : '<p class="muted">这里空空如也。</p>';
  listEl.querySelectorAll<HTMLButtonElement>('button[data-action]').forEach((button) => {
    button.addEventListener('click', async () => {
      const card = button.closest<HTMLElement>('.capture-card');
      const id = card?.dataset.id;
      const status = button.dataset.action as CaptureStatus;
      if (!id) return;
      button.disabled = true;
      const result = await sendMessage({ type: 'UPDATE_CAPTURE_STATUS', id, status });
      if (result.ok) await refreshList();
      else { button.disabled = false; alert(result.error); }
    });
  });
}

tabsEl.querySelectorAll<HTMLButtonElement>('button[data-status]').forEach((button) => {
  button.addEventListener('click', () => {
    tabsEl.querySelectorAll('button').forEach((other) => other.classList.remove('active'));
    button.classList.add('active');
    activeStatus = button.dataset.status as CaptureStatus;
    void refreshList();
  });
});

saveSettingsButton.addEventListener('click', async () => {
  let apiBaseUrl: string;
  try {
    apiBaseUrl = normalizeApiBaseUrl(apiBaseUrlInput.value);
  } catch (error) {
    alert(error instanceof Error ? error.message : '服务地址格式不对，例如 http://127.0.0.1:4221 或 https://jlpt.erzhiqian.cc（不要带 /api/jlpt/mcp）。');
    return;
  }
  const granted = await chrome.permissions.request({ origins: [`${apiBaseUrl}/*`] });
  if (!granted) {
    alert('需要授权插件访问该地址才能继续，请重试并在弹出的确认框里点允许。');
    return;
  }
  const response = await sendMessage<{ apiBaseUrl: string }>({ type: 'SET_API_BASE_URL', apiBaseUrl });
  if (!response.ok) { alert(response.error); return; }
  apiBaseUrlInput.value = apiBaseUrl;
  await refreshAccount();
  await refreshList();
});

manualCategory.addEventListener('change', () => void refreshManualWordbooks());

manualForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const body = manualBody.value.trim();
  if (!body) return;
  const category = manualCategory.value as CaptureCategory;
  const supportsWordbook = category === 'word' || category === 'grammar';
  const wordbook = supportsWordbook ? (await getWordbooks()).find((book) => book.id === manualWordbook.value) : undefined;
  manualFeedback.textContent = '正在加入…';
  manualFeedback.className = 'muted';
  const response = await sendMessage({
    type: 'CREATE_CAPTURE',
    input: {
      body,
      category,
      targetDeck: wordbook?.deck,
      targetWordbookId: wordbook?.id,
      context: manualContext.value.trim() || undefined,
    },
  });
  if (response.ok) {
    manualFeedback.className = 'muted';
    manualFeedback.textContent = '已加入队列。';
    manualForm.reset();
    if (activeStatus === 'inbox') await refreshList();
  } else {
    manualFeedback.className = 'error';
    manualFeedback.textContent = response.error;
  }
});

void refreshAccount().then(refreshList);
void refreshManualWordbooks();
