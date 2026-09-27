// Runs only in the background service worker (has host_permissions for the API origin).

export const DEFAULT_API_BASE_URL = 'http://127.0.0.1:4221';

interface StoredState {
  authToken: string | null;
  user: { id: number; username: string } | null;
  apiBaseUrl: string;
}

export async function getStoredState(): Promise<StoredState> {
  const stored = await chrome.storage.local.get(['authToken', 'user', 'apiBaseUrl']);
  return {
    authToken: stored.authToken ?? null,
    user: stored.user ?? null,
    apiBaseUrl: stored.apiBaseUrl || DEFAULT_API_BASE_URL,
  };
}

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiRequest<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown; auth?: boolean } = {},
): Promise<T> {
  const { authToken, apiBaseUrl } = await getStoredState();
  if (options.auth !== false && !authToken) throw new ApiError('未登录，请先在插件里登录。', 401);
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(authToken ? { authorization: `Bearer ${authToken}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(typeof json.error === 'string' ? json.error : `请求失败：${response.status}`, response.status);
  }
  return json as T;
}
