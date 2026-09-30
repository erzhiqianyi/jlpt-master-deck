import { currentPlatform } from './platform.mjs';
// The MCP App resource: `ui://jlpt/practice.html`, an interactive practice card that hosts such as
// Claude and ChatGPT render inline when a tool declares `_meta.ui.resourceUri`. The view is built
// by `npm run build:mcp-app` (vite.mcp-app.config.ts) and inlined here so the resource is a single
// self-contained document; MCP Apps hosts fetch nothing else.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PRACTICE_UI_URI = 'ui://jlpt/practice.html';
export const MCP_APP_MIME = 'text/html;profile=mcp-app';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const buildDir = join(rootDir, 'dist-mcp-app');

export function practiceViewAvailable() {
  if (currentPlatform()?.practiceHtml) return true;
  return existsSync(join(buildDir, 'practice.js'));
}

/** Full HTML document for the practice view; throws a clear error when the bundle is missing. */
export function practiceViewHtml() {
  if (currentPlatform()?.practiceHtml) return currentPlatform().practiceHtml;
  if (!practiceViewAvailable()) {
    throw new Error('MCP App view not built: run `npm run build:mcp-app` (it writes dist-mcp-app/practice.js)');
  }
  const script = readFileSync(join(buildDir, 'practice.js'), 'utf8');
  const cssPath = join(buildDir, 'practice.css');
  const css = existsSync(cssPath) ? readFileSync(cssPath, 'utf8') : '';
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>JLPT 专题训练</title>
<style>${css}</style>
</head>
<body>
<div id="app"></div>
<script>${script.replace(/<\/script/gi, '<\\/script')}</script>
</body>
</html>`;
}

/** `_meta.ui` for tools whose result the practice view renders. */
export const practiceToolMeta = { ui: { resourceUri: PRACTICE_UI_URI } };

/** Resource metadata shared by the HTTP and stdio servers. */
export const practiceResourceMeta = {
  ui: {
    // The document is fully inlined; no network access is needed and none is requested.
    csp: { connectDomains: [], resourceDomains: [] },
    prefersBorder: false,
  },
};

export const practiceResource = {
  uri: PRACTICE_UI_URI,
  name: 'jlpt-practice',
  title: 'JLPT 专题训练',
  description: 'Interactive practice card: shows the questions of a practice session, records each answer through submit_practice_answer, and summarizes the result.',
  mimeType: MCP_APP_MIME,
  _meta: practiceResourceMeta,
  read: async () => [{ uri: PRACTICE_UI_URI, mimeType: MCP_APP_MIME, text: practiceViewHtml(), _meta: practiceResourceMeta }],
};

export const REVIEW_CARDS_UI_URI = 'ui://jlpt/review-cards-v2.html';
export const reviewCardsToolMeta = { ui: { resourceUri: REVIEW_CARDS_UI_URI } };

export function reviewCardsViewHtml() {
  if (currentPlatform()?.reviewCardsHtml) return currentPlatform().reviewCardsHtml;
  const scriptPath = join(buildDir, 'review-cards.js');
  if (!existsSync(scriptPath)) throw new Error('Review cards view not built: run npm run build:mcp-app');
  const script = readFileSync(scriptPath, 'utf8');
  const css = readFileSync(join(buildDir, 'review-cards.css'), 'utf8');
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>JLPT 复习卡片</title><style>${css}</style></head><body><div id="app"></div><script>${script.replace(/<\/script/gi, '<\\/script')}</script></body></html>`;
}

export const reviewCardsResource = {
  uri: REVIEW_CARDS_UI_URI, name: 'jlpt-review-cards', title: 'JLPT 复习卡片',
  description: 'Interactive vocabulary and grammar review. Loads owned due cards, reveals their back, and saves the learner-selected rating with rate_review_card.',
  mimeType: MCP_APP_MIME, _meta: practiceResourceMeta,
  read: async () => [{ uri: REVIEW_CARDS_UI_URI, mimeType: MCP_APP_MIME, text: reviewCardsViewHtml(), _meta: practiceResourceMeta }],
};

export const AI_HOME_UI_URI = 'ui://jlpt/ai-learning-home.html';
export const aiHomeToolMeta = { ui: { resourceUri: AI_HOME_UI_URI } };

export function aiHomeViewHtml() {
  if (currentPlatform()?.aiHomeHtml) return currentPlatform().aiHomeHtml;
  const scriptPath = join(buildDir, 'ai-learning-home.js');
  if (!existsSync(scriptPath)) throw new Error('AI learning home view not built: run npm run build:mcp-app');
  const script = readFileSync(scriptPath, 'utf8');
  const css = readFileSync(join(buildDir, 'ai-learning-home.css'), 'utf8');
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>JLPT AI 学习首页</title><style>${css}</style></head><body><div id="app"></div><script>${script.replace(/<\/script/gi, '<\\/script')}</script></body></html>`;
}

export const aiHomeResource = {
  uri: AI_HOME_UI_URI, name: 'jlpt-ai-learning-home', title: 'JLPT AI 学习首页',
  description: 'A concise starting point for due cards, saved practice, and learner-selected AI study actions.',
  mimeType: MCP_APP_MIME, _meta: practiceResourceMeta,
  read: async () => [{ uri: AI_HOME_UI_URI, mimeType: MCP_APP_MIME, text: aiHomeViewHtml(), _meta: practiceResourceMeta }],
};
