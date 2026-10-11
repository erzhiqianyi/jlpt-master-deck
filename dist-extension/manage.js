"use strict";
(() => {
  // extension/lib/messages.ts
  function sendMessage(message) {
    return chrome.runtime.sendMessage(message);
  }

  // extension/lib/wordbooks.ts
  function wordbooksForCategory(wordbooks, category) {
    return category === "word" || category === "grammar" ? wordbooks : [];
  }

  // extension/lib/storage.ts
  function normalizeApiBaseUrl(input) {
    const url = new URL(input.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("\u670D\u52A1\u5730\u5740\u5FC5\u987B\u4EE5 http:// \u6216 https:// \u5F00\u5934");
    return url.origin;
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

  // extension/manage.ts
  var accountEl = document.getElementById("account");
  var apiBaseUrlInput = document.getElementById("api-base-url");
  var saveSettingsButton = document.getElementById("save-settings");
  var tabsEl = document.getElementById("tabs");
  var listEl = document.getElementById("list");
  var manualForm = document.getElementById("manual-form");
  var manualBody = document.getElementById("manual-body");
  var manualCategory = document.getElementById("manual-category");
  var manualWordbookLabel = document.getElementById("manual-wordbook-label");
  var manualWordbook = document.getElementById("manual-wordbook");
  var manualContext = document.getElementById("manual-context");
  var manualFeedback = document.getElementById("manual-feedback");
  var activeStatus = "inbox";
  var wordbooksCache = null;
  function escapeHtml2(text) {
    return text.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
  }
  async function refreshAccount() {
    const state = await sendMessage({ type: "GET_STATE" });
    if (!state.ok) {
      accountEl.innerHTML = `<span class="error">${escapeHtml2(state.error)}</span>`;
      return null;
    }
    apiBaseUrlInput.value = state.data.apiBaseUrl;
    const ruleLink = document.getElementById("vocabulary-rule-settings");
    ruleLink.href = `${state.data.apiBaseUrl}/#/settings/practice`;
    const ruleStatus = document.getElementById("vocabulary-rule-status");
    ruleStatus.textContent = "\u5355\u8BCD\u6DFB\u52A0\u89C4\u5219\uFF1A\u8BF7\u767B\u5F55\u540E\u67E5\u770B";
    if (state.data.user) {
      const rule = await sendMessage({ type: "GET_STUDY_SETTINGS" });
      ruleStatus.textContent = rule.ok ? `\u5355\u8BCD\u6DFB\u52A0\u89C4\u5219\uFF1A${rule.data.questionKinds.length ? `\u5FC5\u987B\u751F\u6210 ${rule.data.questionKinds.map((kind) => ({ "vocabulary-kanji-reading": "\u6F22\u5B57\u8AAD\u307F", "vocabulary-orthography": "\u8868\u8A18", "vocabulary-word-formation": "\u8A9E\u5F62\u6210", "vocabulary-context": "\u6587\u8108\u898F\u5B9A", "vocabulary-paraphrase": "\u8A00\u3044\u63DB\u3048\u985E\u7FA9", "vocabulary-usage": "\u7528\u6CD5" })[kind] ?? kind).join("\u3001")}` : "\u4E0D\u6821\u9A8C JLPT \u8A9E\u5F59\u9898\u76EE"}` : `\u5355\u8BCD\u6DFB\u52A0\u89C4\u5219\u8BFB\u53D6\u5931\u8D25\uFF1A${rule.error}`;
    }
    accountEl.innerHTML = state.data.user ? `<span>\u5DF2\u767B\u5F55\uFF1A${formatIdentity(state.data.user)}</span> <button id="logout" type="button">\u9000\u51FA\u767B\u5F55</button>` : '<button id="login" type="button">\u767B\u5F55</button>';
    document.getElementById("login")?.addEventListener("click", async () => {
      const response = await sendMessage({ type: "LOGIN" });
      if (!response.ok) {
        accountEl.innerHTML = `<span class="error">${escapeHtml2(response.error)}</span>`;
        return;
      }
      await refreshAccount();
      await refreshList();
    });
    document.getElementById("logout")?.addEventListener("click", async () => {
      await sendMessage({ type: "LOGOUT" });
      await refreshAccount();
      await refreshList();
    });
    return state.data.user;
  }
  async function getWordbooks() {
    if (wordbooksCache) return wordbooksCache;
    const response = await sendMessage({ type: "LIST_WORDBOOKS" });
    wordbooksCache = response.ok ? response.data.wordbooks : [];
    return wordbooksCache;
  }
  async function refreshManualWordbooks() {
    const category = manualCategory.value;
    const supportsWordbook = category === "word" || category === "grammar";
    manualWordbookLabel.style.display = supportsWordbook ? "" : "none";
    if (!supportsWordbook) return;
    const options = wordbooksForCategory(await getWordbooks(), category);
    manualWordbook.innerHTML = options.length ? options.map((book) => `<option value="${escapeHtml2(book.code)}">${escapeHtml2(book.title)}</option>`).join("") : '<option value="">\uFF08\u65E0\u53EF\u7528\u5355\u8BCD\u672C\uFF09</option>';
  }
  function renderCapture(capture) {
    const created = capture.createdAt ? new Date(capture.createdAt).toLocaleString() : "";
    return `
    <article class="capture-card" data-code="${escapeHtml2(capture.code)}">
      <p class="body">${escapeHtml2(capture.body)}</p>
      ${capture.context ? `<p class="context">${escapeHtml2(capture.context)}</p>` : ""}
      <p class="meta">${escapeHtml2(capture.category)} \xB7 ${escapeHtml2(created)}</p>
      <div class="actions">
        ${capture.status === "inbox" ? '<button data-action="processed">\u6807\u8BB0\u5B8C\u6210</button><button data-action="archived">\u5F52\u6863</button>' : ""}
        ${capture.status === "processed" ? '<button data-action="inbox">\u91CD\u65B0\u52A0\u5165\u5F85\u5904\u7406</button><button data-action="archived">\u5F52\u6863</button>' : ""}
        ${capture.status === "archived" ? '<button data-action="inbox">\u91CD\u65B0\u52A0\u5165\u5F85\u5904\u7406</button>' : ""}
      </div>
    </article>
  `;
  }
  async function refreshList() {
    listEl.innerHTML = '<p class="muted">\u52A0\u8F7D\u4E2D\u2026</p>';
    const response = await sendMessage({ type: "LIST_CAPTURES", status: activeStatus });
    if (!response.ok) {
      listEl.innerHTML = `<p class="error">${escapeHtml2(response.error)}</p>`;
      return;
    }
    const captures = response.data.captures;
    listEl.innerHTML = captures.length ? captures.map(renderCapture).join("") : '<p class="muted">\u8FD9\u91CC\u7A7A\u7A7A\u5982\u4E5F\u3002</p>';
    listEl.querySelectorAll("button[data-action]").forEach((button) => {
      button.addEventListener("click", async () => {
        const card = button.closest(".capture-card");
        const code = card?.dataset.code;
        const status = button.dataset.action;
        if (!code) return;
        button.disabled = true;
        const result = await sendMessage({ type: "UPDATE_CAPTURE_STATUS", code, status });
        if (result.ok) await refreshList();
        else {
          button.disabled = false;
          alert(result.error);
        }
      });
    });
  }
  tabsEl.querySelectorAll("button[data-status]").forEach((button) => {
    button.addEventListener("click", () => {
      tabsEl.querySelectorAll("button").forEach((other) => other.classList.remove("active"));
      button.classList.add("active");
      activeStatus = button.dataset.status;
      void refreshList();
    });
  });
  saveSettingsButton.addEventListener("click", async () => {
    let apiBaseUrl;
    try {
      apiBaseUrl = normalizeApiBaseUrl(apiBaseUrlInput.value);
    } catch (error) {
      alert(error instanceof Error ? error.message : "\u670D\u52A1\u5730\u5740\u683C\u5F0F\u4E0D\u5BF9\uFF0C\u4F8B\u5982 http://127.0.0.1:4221 \u6216 https://jlpt.erzhiqian.cc\uFF08\u4E0D\u8981\u5E26 /api/jlpt/mcp\uFF09\u3002");
      return;
    }
    const granted = await chrome.permissions.request({ origins: [`${apiBaseUrl}/*`] });
    if (!granted) {
      alert("\u9700\u8981\u6388\u6743\u63D2\u4EF6\u8BBF\u95EE\u8BE5\u5730\u5740\u624D\u80FD\u7EE7\u7EED\uFF0C\u8BF7\u91CD\u8BD5\u5E76\u5728\u5F39\u51FA\u7684\u786E\u8BA4\u6846\u91CC\u70B9\u5141\u8BB8\u3002");
      return;
    }
    const response = await sendMessage({ type: "SET_API_BASE_URL", apiBaseUrl });
    if (!response.ok) {
      alert(response.error);
      return;
    }
    apiBaseUrlInput.value = apiBaseUrl;
    await refreshAccount();
    await refreshList();
  });
  manualCategory.addEventListener("change", () => void refreshManualWordbooks());
  manualForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const body = manualBody.value.trim();
    if (!body) return;
    const category = manualCategory.value;
    const supportsWordbook = category === "word" || category === "grammar";
    const wordbook = supportsWordbook ? (await getWordbooks()).find((book) => book.code === manualWordbook.value) : void 0;
    manualFeedback.textContent = "\u6B63\u5728\u52A0\u5165\u2026";
    manualFeedback.className = "muted";
    const response = await sendMessage({
      type: "CREATE_CAPTURE",
      input: {
        body,
        category,
        wordbook: wordbook?.code,
        context: manualContext.value.trim() || void 0
      }
    });
    if (response.ok) {
      manualFeedback.className = "muted";
      manualFeedback.textContent = "\u5DF2\u52A0\u5165\u961F\u5217\u3002";
      manualForm.reset();
      if (activeStatus === "inbox") await refreshList();
    } else {
      manualFeedback.className = "error";
      manualFeedback.textContent = response.error;
    }
  });
  void refreshAccount().then(refreshList);
  void refreshManualWordbooks();
  window.addEventListener("focus", () => {
    void refreshAccount();
  });
})();
