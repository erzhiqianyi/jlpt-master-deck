import tailwindcss from '@tailwindcss/postcss';
import react from '@vitejs/plugin-react';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, loadEnv, type Plugin } from 'vite';

// Ports/host come from .env (see docs/local-backend-mcp.md "Ports"); server/dev.mjs exports the same values.
if (existsSync('.env')) process.loadEnvFile('.env');
const webPort = Number(process.env.JLPT_WEB_PORT || 4220);
const apiPort = Number(process.env.JLPT_API_PORT || 4221);
const host = process.env.JLPT_HOST || '127.0.0.1';
// Optional local UI / hosted API workflow. Keep this setting out of production builds.
const configuredApiOrigin = process.env.JLPT_API_ORIGIN || loadEnv('development', process.cwd(), 'JLPT_').JLPT_API_ORIGIN;
const remoteApiOrigin = configuredApiOrigin ? new URL(configuredApiOrigin) : null;
if (remoteApiOrigin && (remoteApiOrigin.protocol !== 'https:' || remoteApiOrigin.username || remoteApiOrigin.password || remoteApiOrigin.pathname !== '/' || remoteApiOrigin.search || remoteApiOrigin.hash)) {
  throw new Error('JLPT_API_ORIGIN must be an HTTPS origin without credentials, path, query or fragment');
}
const apiProxy = remoteApiOrigin
  ? { target: remoteApiOrigin.origin, changeOrigin: true, xfwd: false }
  : { target: `http://127.0.0.1:${apiPort}`, changeOrigin: false, xfwd: true };

// Vite's SPA fallback otherwise serves the app at /community/ and /articles/ in dev.
// These public HTML pages have their own routes and must be served before that fallback.
const publicArticlePages: Plugin = {
  name: 'public-article-pages',
  configureServer(server) {
    server.middlewares.use((request, response, next) => {
      const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
      if (!/^\/(?:(?:ja|en)\/)?(?:community|articles)(?:\/[a-z0-9-]+)*\/?$/.test(pathname)) return next();
      const pagePath = resolve('public', pathname.slice(1), 'index.html');
      if (!existsSync(pagePath)) return next();
      if (!pathname.endsWith('/')) {
        response.statusCode = 308;
        response.setHeader('Location', `${pathname}/${new URL(request.url ?? '/', 'http://localhost').search}`);
        response.end();
        return;
      }
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.end(readFileSync(pagePath, 'utf8'));
    });
  },
};

export default defineConfig(({ command }) => ({
  define: { 'import.meta.env.VITE_API_ORIGIN': JSON.stringify(command === 'serve' ? remoteApiOrigin?.origin ?? '' : '') },
  css: { postcss: { plugins: [tailwindcss()] } },
  server: {
    host,
    port: webPort,
    strictPort: true,
    allowedHosts: ['jlpt-local.erzhiqian.cc'],
    // Local OAuth/MCP needs the browser Host; hosted API mode uses the upstream HTTPS Host.
    proxy: {
      '/api': apiProxy,
      // MCP clients discover the OAuth server here before touching /api/jlpt/mcp.
      '/.well-known': apiProxy,
    },
  },
  preview: { host, port: webPort, strictPort: true },
  plugins: [react(), publicArticlePages],
}));
