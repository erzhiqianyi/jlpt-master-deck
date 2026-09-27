import { apiRequest, getStoredState } from './lib/api';
import { login, logout } from './lib/auth';
import type { ExtensionMessage, ExtensionResponse } from './lib/messages';

async function handle(message: ExtensionMessage): Promise<unknown> {
  switch (message.type) {
    case 'GET_STATE': {
      const { user, apiBaseUrl } = await getStoredState();
      return { user, apiBaseUrl };
    }
    case 'LOGIN':
      return login();
    case 'LOGOUT':
      await logout();
      return { ok: true };
    case 'SET_API_BASE_URL':
      await chrome.storage.local.set({ apiBaseUrl: message.apiBaseUrl });
      return { ok: true };
    case 'LOOKUP_WORD':
      return apiRequest<{ matches: unknown[] }>(`/api/vocab/lookup?q=${encodeURIComponent(message.query)}`);
    case 'CREATE_CAPTURE':
      return apiRequest('/api/captures', { method: 'POST', body: message.input });
    case 'LIST_CAPTURES':
      return apiRequest(`/api/captures${message.status ? `?status=${message.status}` : ''}`);
    case 'LIST_WORDBOOKS':
      return apiRequest('/api/wordbooks');
    case 'UPDATE_CAPTURE_STATUS':
      return apiRequest(`/api/captures/${encodeURIComponent(message.id)}`, { method: 'PATCH', body: { status: message.status } });
    default:
      throw new Error(`未知消息类型：${(message as { type?: string }).type}`);
  }
}

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse: (response: ExtensionResponse) => void) => {
  handle(message)
    .then((data) => sendResponse({ ok: true, data }))
    .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));
  return true;
});
