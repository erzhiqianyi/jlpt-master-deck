import type { AppUser } from './messages';

export const DEFAULT_API_BASE_URL = 'http://127.0.0.1:4221';

export interface StoredAuth {
  apiBaseUrl: string;
  mcpClientId: string | null;
  mcpClientApiBaseUrl: string | null; // which apiBaseUrl mcpClientId was registered against
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiresAt: number | null; // epoch ms
  user: AppUser | null;
}

const KEYS: (keyof StoredAuth)[] = [
  'apiBaseUrl', 'mcpClientId', 'mcpClientApiBaseUrl', 'accessToken', 'refreshToken', 'tokenExpiresAt', 'user',
];

export async function getStoredAuth(): Promise<StoredAuth> {
  const stored = await chrome.storage.local.get(KEYS);
  return {
    apiBaseUrl: stored.apiBaseUrl || DEFAULT_API_BASE_URL,
    mcpClientId: stored.mcpClientId ?? null,
    mcpClientApiBaseUrl: stored.mcpClientApiBaseUrl ?? null,
    accessToken: stored.accessToken ?? null,
    refreshToken: stored.refreshToken ?? null,
    tokenExpiresAt: stored.tokenExpiresAt ?? null,
    user: stored.user ?? null,
  };
}

export async function setStoredAuth(patch: Partial<StoredAuth>): Promise<void> {
  await chrome.storage.local.set(patch);
}

export async function clearSession(): Promise<void> {
  await chrome.storage.local.set({ accessToken: null, refreshToken: null, tokenExpiresAt: null, user: null });
}

// Accepts either an origin (http://host:port) or a full path someone copy-pasted from the
// "AI 助手" guide (e.g. .../api/jlpt/mcp) and normalizes it down to just the origin — every
// endpoint we call (discovery, DCR, token, MCP) is derived from that origin, never from a path.
export function normalizeApiBaseUrl(input: string): string {
  const url = new URL(input.trim());
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('服务地址必须以 http:// 或 https:// 开头');
  return url.origin;
}
