// OAuth 2.1 Authorization Code + PKCE login against this app's own MCP server
// (server/mcp-app.mjs, @ninomae/mcp-app-server). The extension registers itself at runtime via
// Dynamic Client Registration (RFC 7591) — no pre-configured client_id, no Google/GCP setup.
// chrome.identity.launchWebAuthFlow opens the app's real login+consent page (the same one
// Claude/ChatGPT/Codex use, see src/features/agents/AgentConsentPage.tsx): whichever account the
// learner signs into there (password or the site's own Google button) is the account the
// extension ends up bound to — identical to browsing the site directly.
import { callMcpTool, invalidateMcpClient } from './mcp';
import { clearSession, getStoredAuth, setStoredAuth, type StoredAuth } from './storage';
import type { AppUser } from './messages';

const SCOPE = 'study';

interface Discovery {
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint: string;
}

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomVerifier(): string {
  const bytes = new Uint8Array(48);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}

async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

async function fetchJson(url: string, init?: RequestInit): Promise<any> {
  const response = await fetch(url, init);
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error_description || json.error || `请求失败：${response.status}`);
  return json;
}

async function discover(apiBaseUrl: string): Promise<Discovery> {
  return fetchJson(`${apiBaseUrl}/.well-known/oauth-authorization-server`);
}

function getRedirectUri(): string {
  return chrome.identity.getRedirectURL();
}

async function ensureClient(apiBaseUrl: string, registrationEndpoint: string, redirectUri: string): Promise<string> {
  const stored = await getStoredAuth();
  if (stored.mcpClientId && stored.mcpClientApiBaseUrl === apiBaseUrl) return stored.mcpClientId;
  const registration = await fetchJson(registrationEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_name: 'JLPT Master Deck 查词助手',
      redirect_uris: [redirectUri],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      scope: SCOPE,
    }),
  });
  await setStoredAuth({ mcpClientId: registration.client_id, mcpClientApiBaseUrl: apiBaseUrl });
  return registration.client_id as string;
}

function launchWebAuthFlow(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow({ url, interactive: true }, (responseUrl) => {
      if (chrome.runtime.lastError || !responseUrl) {
        reject(new Error(chrome.runtime.lastError?.message || '登录已取消'));
        return;
      }
      resolve(responseUrl);
    });
  });
}

export async function login(): Promise<AppUser> {
  const { apiBaseUrl } = await getStoredAuth();
  const discovery = await discover(apiBaseUrl);
  const redirectUri = getRedirectUri();
  const clientId = await ensureClient(apiBaseUrl, discovery.registration_endpoint, redirectUri);

  const verifier = randomVerifier();
  const challenge = await pkceChallenge(verifier);
  const state = crypto.randomUUID();

  const authorizeUrl = `${discovery.authorization_endpoint}?${new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
    scope: SCOPE,
  })}`;

  const responseUrl = await launchWebAuthFlow(authorizeUrl);
  const params = new URL(responseUrl).searchParams;
  if (params.get('error')) throw new Error(params.get('error_description') || params.get('error') || '登录失败');
  if (params.get('state') !== state) throw new Error('登录状态校验失败，请重试');
  const code = params.get('code');
  if (!code) throw new Error('未收到授权码，请重试');

  const tokenResponse = await fetchJson(discovery.token_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, code_verifier: verifier, client_id: clientId }),
  });
  await storeTokens(apiBaseUrl, tokenResponse);
  invalidateMcpClient();

  const identity = await fetchIdentity(apiBaseUrl);
  await setStoredAuth({ user: identity });
  return identity;
}

async function storeTokens(apiBaseUrl: string, tokenResponse: { access_token: string; refresh_token?: string; expires_in: number }) {
  await setStoredAuth({
    apiBaseUrl,
    accessToken: tokenResponse.access_token,
    refreshToken: tokenResponse.refresh_token ?? null,
    tokenExpiresAt: Date.now() + tokenResponse.expires_in * 1000,
  });
}

// get_connection_info is a framework-provided MCP tool (server/mcp-app.mjs's `connectionInfo.resolve`)
// that answers "which account and environment is this token bound to" from the grant itself —
// not from any browser session — so it can't drift after the learner switches accounts elsewhere.
interface ConnectionInfo {
  user?: { id?: string; displayName?: string };
  connection?: { scopes?: string[] };
  server?: { environment?: string };
}

async function fetchIdentity(apiBaseUrl: string): Promise<AppUser> {
  const { accessToken } = await getStoredAuth();
  if (!accessToken) throw new Error('缺少访问令牌');
  try {
    const info = await callMcpTool<ConnectionInfo>(`${apiBaseUrl}/api/jlpt/mcp`, accessToken, 'get_connection_info');
    return {
      username: info?.user?.displayName || '（未知账号）',
      accountId: info?.user?.id,
      environment: info?.server?.environment,
      scopes: info?.connection?.scopes,
    };
  } catch (error) {
    return { username: `登录成功，但读取账号信息失败：${error instanceof Error ? error.message : String(error)}` };
  }
}

async function refresh(): Promise<string> {
  const stored = await getStoredAuth();
  if (!stored.refreshToken || !stored.mcpClientId) throw new Error('登录已过期，请重新登录');
  const discovery = await discover(stored.apiBaseUrl);
  const tokenResponse = await fetchJson(discovery.token_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: stored.refreshToken, client_id: stored.mcpClientId }),
  });
  await storeTokens(stored.apiBaseUrl, tokenResponse);
  invalidateMcpClient();
  return tokenResponse.access_token as string;
}

const EXPIRY_MARGIN_MS = 60_000;

export async function getValidAccessToken(): Promise<{ apiBaseUrl: string; accessToken: string }> {
  const stored = await getStoredAuth();
  if (!stored.accessToken) throw new Error('未登录，请先在插件里登录。');
  if (stored.tokenExpiresAt && stored.tokenExpiresAt - EXPIRY_MARGIN_MS <= Date.now()) {
    try {
      const accessToken = await refresh();
      return { apiBaseUrl: stored.apiBaseUrl, accessToken };
    } catch (error) {
      await clearSession();
      throw error instanceof Error ? error : new Error('登录已过期，请重新登录。');
    }
  }
  return { apiBaseUrl: stored.apiBaseUrl, accessToken: stored.accessToken };
}

export async function logout(): Promise<void> {
  await clearSession();
  invalidateMcpClient();
}

export type { StoredAuth };
