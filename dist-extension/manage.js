"use strict";
(() => {
  // extension/lib/messages.ts
  function sendMessage(message) {
    return chrome.runtime.sendMessage(message);
  }

  // extension/lib/wordbooks.ts
  function wordbooksForCategory(wordbooks, category) {
    return wordbooks.filter((book) => category === "grammar" === (book.deck === "grammar_expression"));
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
  function escapeHtml(text) {
    return text.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
  }
  async function refreshAccount() {
    const state = await sendMessage({ type: "GET_STATE" });
    if (!state.ok) {
      accountEl.innerHTML = `<span class="error">${escapeHtml(state.error)}</span>`;
      return null;
    }
    apiBaseUrlInput.value = state.data.apiBaseUrl;
    accountEl.innerHTML = state.data.user ? `<span>\u5DF2\u767B\u5F55\uFF1A${escapeHtml(state.data.user.username)}</span> <button id="logout" type="button">\u9000\u51FA\u767B\u5F55</button>` : '<button id="login" type="button">\u4F7F\u7528 Google \u767B\u5F55</button>';
    document.getElementById("login")?.addEventListener("click", async () => {
      const response = await sendMessage({ type: "LOGIN" });
      if (!response.ok) {
        accountEl.innerHTML = `<span class="error">${escapeHtml(response.error)}</span>`;
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
    manualWordbook.innerHTML = options.length ? options.map((book) => `<option value="${escapeHtml(book.id)}">${escapeHtml(book.title)}</option>`).join("") : '<option value="">\uFF08\u65E0\u53EF\u7528\u5355\u8BCD\u672C\uFF09</option>';
  }
  function renderCapture(capture) {
    const created = capture.createdAt ? new Date(capture.createdAt).toLocaleString() : "";
    return `
    <article class="capture-card" data-id="${escapeHtml(capture.id)}">
      <p class="body">${escapeHtml(capture.body)}</p>
      ${capture.context ? `<p class="context">${escapeHtml(capture.context)}</p>` : ""}
      <p class="meta">${escapeHtml(capture.category)} \xB7 ${escapeHtml(created)}</p>
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
      listEl.innerHTML = `<p class="error">${escapeHtml(response.error)}</p>`;
      return;
    }
    const captures = response.data.captures;
    listEl.innerHTML = captures.length ? captures.map(renderCapture).join("") : '<p class="muted">\u8FD9\u91CC\u7A7A\u7A7A\u5982\u4E5F\u3002</p>';
    listEl.querySelectorAll("button[data-action]").forEach((button) => {
      button.addEventListener("click", async () => {
        const card = button.closest(".capture-card");
        const id = card?.dataset.id;
        const status = button.dataset.action;
        if (!id) return;
        button.disabled = true;
        const result = await sendMessage({ type: "UPDATE_CAPTURE_STATUS", id, status });
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
    const apiBaseUrl = apiBaseUrlInput.value.trim().replace(/\/+$/, "");
    if (!apiBaseUrl) return;
    await sendMessage({ type: "SET_API_BASE_URL", apiBaseUrl });
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
    const wordbook = supportsWordbook ? (await getWordbooks()).find((book) => book.id === manualWordbook.value) : void 0;
    manualFeedback.textContent = "\u6B63\u5728\u52A0\u5165\u2026";
    manualFeedback.className = "muted";
    const response = await sendMessage({
      type: "CREATE_CAPTURE",
      input: {
        body,
        category,
        targetDeck: wordbook?.deck,
        targetWordbookId: wordbook?.id,
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
})();
