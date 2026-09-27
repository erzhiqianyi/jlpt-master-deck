"use strict";
(() => {
  // extension/lib/messages.ts
  function sendMessage(message) {
    return chrome.runtime.sendMessage(message);
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
    stateEl.innerHTML = `<p>\u5DF2\u767B\u5F55\uFF1A${escapeHtml(user.username)}</p>`;
    const captures = await sendMessage({ type: "LIST_CAPTURES", status: "inbox" });
    if (captures.ok) {
      stateEl.innerHTML += `<p class="muted">\u5F85\u89E3\u6790\u961F\u5217\uFF1A${captures.data.captures.length} \u6761</p>`;
    }
  }
  function escapeHtml(text) {
    return text.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
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
