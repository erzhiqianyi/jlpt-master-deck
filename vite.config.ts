import tailwindcss from '@tailwindcss/postcss';
import react from '@vitejs/plugin-react';
import { existsSync } from 'node:fs';
import { defineConfig } from 'vite';

// Ports/host come from .env (see docs/local-backend-mcp.md "Ports"); server/dev.mjs exports the same values.
if (existsSync('.env')) process.loadEnvFile('.env');
const webPort = Number(process.env.JLPT_WEB_PORT || 4220);
const apiPort = Number(process.env.JLPT_API_PORT || 4221);
const host = process.env.JLPT_HOST || '127.0.0.1';

export default defineConfig({
  css: { postcss: { plugins: [tailwindcss()] } },
  server: {
    host,
    port: webPort,
    strictPort: true,
    allowedHosts: ['jlpt-local.erzhiqian.cc'],
    // The OAuth/MCP server derives its public origin (token audience) from the request, so keep the
    // browser's Host header and forward the scheme instead of rewriting them to 127.0.0.1:apiPort.
    proxy: {
      '/api': { target: `http://127.0.0.1:${apiPort}`, changeOrigin: false, xfwd: true },
      // MCP clients discover the OAuth server here before touching /api/jlpt/mcp.
      '/.well-known': { target: `http://127.0.0.1:${apiPort}`, changeOrigin: false, xfwd: true },
    },
  },
  preview: { host, port: webPort, strictPort: true },
  plugins: [react()],
});
