"use strict";
(() => {
  // extension/lib/messages.ts
  function sendMessage(message) {
    return chrome.runtime.sendMessage(message);
  }

  // extension/lib/identity.ts
  function escapeHtml(text) {
    return text.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
  }
  function formatIdentity(user) {
    const parts = [
      user.accountId ? `\u8D26\u53F7 #${user.accountId}` : null,
      user.environment ? user.environment === "cloudflare" ? "\u4E91\u7AEF" : "\u672C\u5730" : null,
      user.scopes?.length ? `\u6743\u9650\uFF1A${user.scopes.join("\u3001")}` : null
    ].filter((part) => Boolean(part));
    const detail = parts.length ? ` <span class="muted">\uFF08${parts.map(escapeHtml).join(" \xB7 ")}\uFF09</span>` : "";
    return `${escapeHtml(user.username)}${detail}`;
  }

  // extension/popup.ts
  var stateEl = document.getElementById("state");
  var loginButton = document.getElementById("login");
  var logoutButton = document.getElementById("logout");
  var manageButton = document.getElementById("manage");
  async function refresh() {
    const state = await sendMessage({ type: "GET_STATE" });
    if (!state.ok) {
      stateEl.innerHTML = `<p class="error">${state.error}</p>`;
      return;
    }
    const { user } = state.data;
    loginButton.style.display = user ? "none" : "block";
    logoutButton.style.display = user ? "block" : "none";
    if (!user) {
      stateEl.innerHTML = '<p class="muted">\u672A\u767B\u5F55</p>';
      return;
    }
    stateEl.innerHTML = `<p>\u5DF2\u767B\u5F55\uFF1A${formatIdentity(user)}</p>`;
    const captures = await sendMessage({ type: "LIST_CAPTURES", status: "inbox" });
    if (captures.ok) {
      stateEl.innerHTML += `<p class="muted">\u5F85\u89E3\u6790\u961F\u5217\uFF1A${captures.data.captures.length} \u6761</p>`;
    }
  }
  loginButton.addEventListener("click", async () => {
    loginButton.disabled = true;
    stateEl.innerHTML = '<p class="muted">\u6B63\u5728\u767B\u5F55\u2026</p>';
    try {
      const response = await sendMessage({ type: "LOGIN" });
      if (!response.ok) throw new Error(response.error);
      await refresh();
    } catch (error) {
      stateEl.innerHTML = `<p class="error">${error instanceof Error ? error.message : "\u767B\u5F55\u5931\u8D25"}</p>`;
    } finally {
      loginButton.disabled = false;
    }
  });
  logoutButton.addEventListener("click", async () => {
    await sendMessage({ type: "LOGOUT" });
    await refresh();
  });
  manageButton.addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("manage.html") });
  });
  void refresh();
})();
