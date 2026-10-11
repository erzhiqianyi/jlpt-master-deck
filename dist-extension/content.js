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

  // extension/content.ts
  var JAPANESE_RE = /[぀-ヿ㐀-鿿]/;
  var MAX_QUERY_LENGTH = 30;
  var host = document.createElement("div");
  host.style.position = "fixed";
  host.style.zIndex = "2147483647";
  host.style.top = "0";
  host.style.left = "0";
  var shadow = host.attachShadow({ mode: "open" });
  var style = document.createElement("style");
  style.textContent = `
  :host { all: initial; }
  .panel { position: absolute; min-width: 220px; max-width: 320px; background: #fff; color: #1f1f1f;
    border: 1px solid #d8d8d8; border-radius: 10px; box-shadow: 0 8px 24px rgba(0,0,0,0.18);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 13px; line-height: 1.5;
    padding: 10px 12px; }
  .panel h4 { margin: 0 0 6px; font-size: 14px; }
  .panel .reading { color: #666; margin-right: 6px; }
  .panel .meaning { margin: 2px 0 8px; }
  .panel button { font: inherit; border: none; border-radius: 6px; padding: 6px 10px; cursor: pointer;
    background: #2563eb; color: #fff; }
  .panel button:disabled { background: #9ca3af; cursor: default; }
  .panel .status { color: #16a34a; margin-top: 6px; }
  .panel .error { color: #dc2626; margin-top: 6px; }
  .panel .loading { color: #666; }
  .panel .targets { display: flex; gap: 6px; margin-bottom: 8px; }
  .panel select { font: inherit; padding: 4px 6px; border: 1px solid #d8d8d8; border-radius: 6px; flex: 1; min-width: 0; }
`;
  shadow.appendChild(style);
  var panel = document.createElement("div");
  panel.className = "panel";
  panel.style.display = "none";
  shadow.appendChild(panel);
  document.documentElement.appendChild(host);
  var closeTimer;
  function hideOverlay() {
    panel.style.display = "none";
    panel.innerHTML = "";
  }
  function positionPanel(rect) {
    const top = window.scrollY + rect.bottom + 6;
    const left = window.scrollX + rect.left;
    panel.style.top = `${top}px`;
    panel.style.left = `${left}px`;
    panel.style.display = "block";
  }
  function isEditableTarget(node) {
    const element = node instanceof Element ? node : node?.parentElement ?? null;
    return Boolean(element?.closest('input, textarea, [contenteditable="true"], [contenteditable=""]'));
  }
  function renderLoading() {
    panel.innerHTML = '<p class="loading">\u67E5\u8BE2\u4E2D\u2026</p>';
  }
  function meaningOf(item) {
    return item.meaning?.text.trim() ?? "";
  }
  var wordbooksCache = null;
  async function getWordbooks() {
    if (wordbooksCache) return wordbooksCache;
    const response = await sendMessage({ type: "LIST_WORDBOOKS" });
    if (!response.ok) return [];
    wordbooksCache = response.data.wordbooks;
    return wordbooksCache;
  }
  function renderMatches(word, matches, context) {
    if (matches.length) {
      panel.innerHTML = matches.map((item) => `<h4>${escapeHtml(item.expression)}${item.reading && item.reading !== word ? ` <span class="reading">${escapeHtml(item.reading)}</span>` : ""}</h4>
        <p class="meaning">${escapeHtml(meaningOf(item) || "\u6682\u65E0\u91CA\u4E49")}</p>`).join("");
      return;
    }
    panel.innerHTML = `
    <p>\u6682\u65E0\u91CA\u4E49\u3002</p>
    <div class="targets">
      <select id="jlpt-category">
        <option value="word">\u5355\u8BCD</option>
        <option value="grammar">\u8BED\u6CD5</option>
      </select>
      <select id="jlpt-wordbook"><option>\u52A0\u8F7D\u4E2D\u2026</option></select>
    </div>
    <button type="button" id="jlpt-enqueue">\u52A0\u5165\u5F85\u89E3\u6790\u961F\u5217</button>
    <div id="jlpt-enqueue-feedback"></div>
  `;
    const categorySelect = panel.querySelector("#jlpt-category");
    const wordbookSelect = panel.querySelector("#jlpt-wordbook");
    const button = panel.querySelector("#jlpt-enqueue");
    const feedback = panel.querySelector("#jlpt-enqueue-feedback");
    async function populateWordbooks() {
      if (!categorySelect || !wordbookSelect) return;
      const wordbooks = await getWordbooks();
      const category = categorySelect.value;
      const options = wordbooksForCategory(wordbooks, category);
      wordbookSelect.innerHTML = options.length ? options.map((book) => `<option value="${escapeHtml(book.code)}">${escapeHtml(book.title)}</option>`).join("") : '<option value="">\uFF08\u65E0\u53EF\u7528\u5355\u8BCD\u672C\uFF09</option>';
    }
    categorySelect?.addEventListener("change", populateWordbooks);
    void populateWordbooks();
    button?.addEventListener("click", async () => {
      if (!button || !feedback || !categorySelect || !wordbookSelect) return;
      const wordbooks = await getWordbooks();
      const wordbook = wordbooks.find((book) => book.code === wordbookSelect.value);
      button.disabled = true;
      button.textContent = "\u6B63\u5728\u52A0\u5165\u2026";
      feedback.textContent = "";
      try {
        const response = await sendMessage({
          type: "CREATE_CAPTURE",
          input: {
            body: word,
            category: categorySelect.value,
            wordbook: wordbook?.code,
            context: `\u63D2\u4EF6\u7F51\u9875\u9009\u8BCD
\u9875\u9762\uFF1A${location.href}
\u539F\u6587\uFF1A${context}`
          }
        });
        if (!response.ok) throw new Error(response.error);
        button.textContent = "\u5DF2\u52A0\u5165\u5F85\u89E3\u6790\u961F\u5217";
        feedback.className = "status";
        feedback.textContent = "\u89E3\u6790\u540E\u53EF\u5728\u8BCD\u5E93/\u8F93\u5165\u8BB0\u5F55\u91CC\u67E5\u770B\u3002";
      } catch (error) {
        button.disabled = false;
        button.textContent = "\u52A0\u5165\u5F85\u89E3\u6790\u961F\u5217";
        feedback.className = "error";
        feedback.textContent = error instanceof Error ? error.message : "\u52A0\u5165\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5\u3002";
      }
    });
  }
  function escapeHtml(text) {
    return text.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
  }
  async function lookup(word, context) {
    renderLoading();
    const response = await sendMessage({ type: "LOOKUP_WORD", query: word });
    if (!response.ok) {
      panel.innerHTML = `<p class="error">${escapeHtml(response.error)}</p>`;
      return;
    }
    renderMatches(word, response.data.matches, context);
  }
  function surroundingContext(node) {
    const text = node?.textContent?.trim() ?? "";
    return text.length > 200 ? text.slice(0, 200) : text;
  }
  document.addEventListener("mouseup", (event) => {
    if (event.composedPath().includes(host)) return;
    window.clearTimeout(closeTimer);
    closeTimer = window.setTimeout(() => {
      const selection = window.getSelection();
      const text = selection?.toString().trim() ?? "";
      if (!selection || selection.isCollapsed || !text || text.length > MAX_QUERY_LENGTH || !JAPANESE_RE.test(text) || isEditableTarget(event.target)) {
        hideOverlay();
        return;
      }
      const range = selection.getRangeAt(0);
      positionPanel(range.getBoundingClientRect());
      void lookup(text, surroundingContext(range.startContainer));
    }, 10);
  });
  document.addEventListener("mousedown", (event) => {
    if (!host.contains(event.target)) hideOverlay();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") hideOverlay();
  });
})();
