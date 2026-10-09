import { getValidAccessToken, login, logout } from './lib/auth';
import { callMcpTool } from './lib/mcp';
import { getStoredAuth, setStoredAuth, clearSession, normalizeApiBaseUrl } from './lib/storage';
import type { ExtensionMessage, ExtensionResponse } from './lib/messages';

async function withMcp<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { apiBaseUrl, accessToken } = await getValidAccessToken();
  return callMcpTool<T>(`${apiBaseUrl}/api/jlpt/mcp`, accessToken, name, args);
}

function withoutUndefined<T extends Record<string, unknown>>(input: T): Partial<T> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as Partial<T>;
}

async function handle(message: ExtensionMessage): Promise<unknown> {
  switch (message.type) {
    case 'GET_STATE': {
      const { user, apiBaseUrl } = await getStoredAuth();
      return { user, apiBaseUrl };
    }
    case 'GET_STUDY_SETTINGS': {
      const settings = await withMcp<{ questionKinds: string[] }>('get_settings');
      return { questionKinds: settings.questionKinds.filter((kind) => kind.startsWith('vocabulary-')) };
    }
    case 'LOGIN':
      return login();
    case 'LOGOUT':
      await logout();
      return { ok: true };
    case 'SET_API_BASE_URL': {
      const apiBaseUrl = normalizeApiBaseUrl(message.apiBaseUrl);
      if ((await getStoredAuth()).apiBaseUrl !== apiBaseUrl) await clearSession();
      await setStoredAuth({ apiBaseUrl });
      return { apiBaseUrl };
    }
    case 'LOOKUP_WORD':
      return { matches: (await withMcp<{ items: unknown[] }>('lookup_word', { query: message.query })).items };
    case 'CREATE_CAPTURE':
      return { capture: await withMcp('create_learning_capture', withoutUndefined(message.input)) };
    case 'LIST_CAPTURES':
      return { captures: (await withMcp<{ items: unknown[] }>('list_learning_captures', withoutUndefined({ status: message.status }))).items };
    case 'UPDATE_CAPTURE_STATUS':
      return { capture: await withMcp('update_learning_capture_status', { code: message.code, status: message.status }) };
    case 'LIST_WORDBOOKS':
      return withMcp<{ wordbooks: unknown[] }>('list_wordbooks');
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
