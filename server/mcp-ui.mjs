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
  return existsSync(join(buildDir, 'practice.js'));
}

/** Full HTML document for the practice view; throws a clear error when the bundle is missing. */
export function practiceViewHtml() {
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
