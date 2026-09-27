"use strict";
(() => {
  // extension/lib/api.ts
  var DEFAULT_API_BASE_URL = "http://127.0.0.1:4221";
  async function getStoredState() {
    const stored = await chrome.storage.local.get(["authToken", "user", "apiBaseUrl"]);
    return {
      authToken: stored.authToken ?? null,
      user: stored.user ?? null,
      apiBaseUrl: stored.apiBaseUrl || DEFAULT_API_BASE_URL
    };
  }
  var ApiError = class extends Error {
    constructor(message, status) {
      super(message);
      this.status = status;
      this.name = "ApiError";
    }
  };
  async function apiRequest(path, options = {}) {
    const { authToken, apiBaseUrl } = await getStoredState();
    if (options.auth !== false && !authToken) throw new ApiError("\u672A\u767B\u5F55\uFF0C\u8BF7\u5148\u5728\u63D2\u4EF6\u91CC\u767B\u5F55\u3002", 401);
    const response = await fetch(`${apiBaseUrl}${path}`, {
      method: options.method ?? "GET",
      headers: {
        ...options.body ? { "content-type": "application/json" } : {},
        ...authToken ? { authorization: `Bearer ${authToken}` } : {}
      },
      body: options.body ? JSON.stringify(options.body) : void 0
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new ApiError(typeof json.error === "string" ? json.error : `\u8BF7\u6C42\u5931\u8D25\uFF1A${response.status}`, response.status);
    }
    return json;
  }

  // extension/lib/auth.ts
  function getGoogleAccessToken() {
    return new Promise((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive: true }, (token) => {
        if (chrome.runtime.lastError || !token) {
          reject(new Error(chrome.runtime.lastError?.message || "\u672A\u80FD\u83B7\u53D6 Google \u767B\u5F55\u4EE4\u724C"));
          return;
        }
        resolve(typeof token === "string" ? token : token.token ?? "");
      });
    });
  }
  async function fetchJson(url, init) {
    const response = await fetch(url, init);
    const json = await response.json().catch(() => ({}));
    if (!response.ok) throw new ApiError(typeof json.error === "string" ? json.error : json.error?.message ?? `\u8BF7\u6C42\u5931\u8D25\uFF1A${response.status}`, response.status);
    return json;
  }
  async function login() {
    const { apiBaseUrl } = await getStoredState();
    const accessToken = await getGoogleAccessToken();
    const config = await fetchJson(`${apiBaseUrl || DEFAULT_API_BASE_URL}/api/auth/config`);
    const apiKey = config?.firebase?.apiKey;
    if (!apiKey) throw new Error("\u670D\u52A1\u7AEF\u672A\u914D\u7F6E Firebase \u767B\u5F55\uFF08GET /api/auth/config \u7F3A\u5C11 firebase.apiKey\uFF09");
    const idp = await fetchJson(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${apiKey}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        postBody: `access_token=${accessToken}&providerId=google.com`,
        requestUri: apiBaseUrl || DEFAULT_API_BASE_URL,
        returnIdpCredential: true,
        returnSecureToken: true
      })
    });
    const session = await fetchJson(`${apiBaseUrl || DEFAULT_API_BASE_URL}/api/auth/firebase`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken: idp.idToken })
    });
    await chrome.storage.local.set({ authToken: session.token, user: session.user });
    return session;
  }
  async function logout() {
    await new Promise((resolve) => chrome.identity.clearAllCachedAuthTokens(resolve));
    await chrome.storage.local.set({ authToken: null, user: null });
  }

  // extension/background.ts
  async function handle(message) {
    switch (message.type) {
      case "GET_STATE": {
        const { user, apiBaseUrl } = await getStoredState();
        return { user, apiBaseUrl };
      }
      case "LOGIN":
        return login();
      case "LOGOUT":
        await logout();
        return { ok: true };
      case "SET_API_BASE_URL":
        await chrome.storage.local.set({ apiBaseUrl: message.apiBaseUrl });
        return { ok: true };
      case "LOOKUP_WORD":
        return apiRequest(`/api/vocab/lookup?q=${encodeURIComponent(message.query)}`);
      case "CREATE_CAPTURE":
        return apiRequest("/api/captures", { method: "POST", body: message.input });
      case "LIST_CAPTURES":
        return apiRequest(`/api/captures${message.status ? `?status=${message.status}` : ""}`);
      case "LIST_WORDBOOKS":
        return apiRequest("/api/wordbooks");
      case "UPDATE_CAPTURE_STATUS":
        return apiRequest(`/api/captures/${encodeURIComponent(message.id)}`, { method: "PATCH", body: { status: message.status } });
      default:
        throw new Error(`\u672A\u77E5\u6D88\u606F\u7C7B\u578B\uFF1A${message.type}`);
    }
  }
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    handle(message).then((data) => sendResponse({ ok: true, data })).catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));
    return true;
  });
})();
