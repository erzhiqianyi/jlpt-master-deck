// Google/Firebase login for the extension, run in the background service worker.
// Reuses the app's existing POST /api/auth/firebase exchange (server/firebase-auth.mjs)
// so the extension resolves to the exact same account as the web app's Google login —
// no server-side auth changes needed.

import { DEFAULT_API_BASE_URL, ApiError, getStoredState } from './api';

function getGoogleAccessToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      if (chrome.runtime.lastError || !token) {
        reject(new Error(chrome.runtime.lastError?.message || '未能获取 Google 登录令牌'));
        return;
      }
      resolve(typeof token === 'string' ? token : (token as { token?: string }).token ?? '');
    });
  });
}

async function fetchJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(typeof json.error === 'string' ? json.error : (json.error?.message ?? `请求失败：${response.status}`), response.status);
  return json;
}

export async function login(): Promise<{ user: { id: number; username: string }; token: string }> {
  const { apiBaseUrl } = await getStoredState();
  const accessToken = await getGoogleAccessToken();

  const config = await fetchJson(`${apiBaseUrl || DEFAULT_API_BASE_URL}/api/auth/config`);
  const apiKey = config?.firebase?.apiKey;
  if (!apiKey) throw new Error('服务端未配置 Firebase 登录（GET /api/auth/config 缺少 firebase.apiKey）');

  const idp = await fetchJson(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${apiKey}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      postBody: `access_token=${accessToken}&providerId=google.com`,
      requestUri: apiBaseUrl || DEFAULT_API_BASE_URL,
      returnIdpCredential: true,
      returnSecureToken: true,
    }),
  });

  const session = await fetchJson(`${apiBaseUrl || DEFAULT_API_BASE_URL}/api/auth/firebase`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ idToken: idp.idToken }),
  });

  await chrome.storage.local.set({ authToken: session.token, user: session.user });
  return session;
}

export async function logout(): Promise<void> {
  await new Promise<void>((resolve) => chrome.identity.clearAllCachedAuthTokens(resolve));
  await chrome.storage.local.set({ authToken: null, user: null });
}
