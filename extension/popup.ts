import { sendMessage, type AppUser, type LearningCapture } from './lib/messages';
import { formatIdentity } from './lib/identity';

const stateEl = document.getElementById('state') as HTMLDivElement;
const loginButton = document.getElementById('login') as HTMLButtonElement;
const logoutButton = document.getElementById('logout') as HTMLButtonElement;
const manageButton = document.getElementById('manage') as HTMLButtonElement;

async function refresh() {
  const state = await sendMessage<{ user: AppUser | null; apiBaseUrl: string }>({ type: 'GET_STATE' });
  if (!state.ok) {
    stateEl.innerHTML = `<p class="error">${state.error}</p>`;
    return;
  }
  const { user } = state.data;
  loginButton.style.display = user ? 'none' : 'block';
  logoutButton.style.display = user ? 'block' : 'none';
  if (!user) {
    stateEl.innerHTML = '<p class="muted">未登录</p>';
    return;
  }
  stateEl.innerHTML = `<p>已登录：${formatIdentity(user)}</p>`;
  const captures = await sendMessage<{ captures: LearningCapture[] }>({ type: 'LIST_CAPTURES', status: 'inbox' });
  if (captures.ok) {
    stateEl.innerHTML += `<p class="muted">待解析队列：${captures.data.captures.length} 条</p>`;
  }
}

loginButton.addEventListener('click', async () => {
  loginButton.disabled = true;
  stateEl.innerHTML = '<p class="muted">正在登录…</p>';
  try {
    const response = await sendMessage({ type: 'LOGIN' });
    if (!response.ok) throw new Error(response.error);
    await refresh();
  } catch (error) {
    stateEl.innerHTML = `<p class="error">${error instanceof Error ? error.message : '登录失败'}</p>`;
  } finally {
    loginButton.disabled = false;
  }
});

logoutButton.addEventListener('click', async () => {
  await sendMessage({ type: 'LOGOUT' });
  await refresh();
});

manageButton.addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('manage.html') });
});

void refresh();
