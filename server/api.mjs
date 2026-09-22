import { createServer } from 'node:http';
import { getRequestListener } from '@hono/node-server';
import { inspectorResponse } from '@ninomae/mcp-app-server/inspector';
import { createJlptMcp } from './mcp-app.mjs';
import { createApiHandler } from './api-handler.mjs';
import { localConfig } from './local-config.mjs';
import { databasePath } from './storage.mjs';

const { apiPort: port, host } = localConfig();
// Local dev serves the inspector at /api/jlpt/mcp/inspector (open it through the Vite port).
const mcp = createJlptMcp({ inspector: process.env.NODE_ENV !== 'production' && inspectorResponse });
await mcp.ensureSchema();
const mcpListener = getRequestListener(async (request) => (await mcp.fetch(request)) ?? new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { 'content-type': 'application/json' } }));
const server = createServer(createApiHandler({ mcp, mcpListener }));
server.listen(port, host, () => {
  console.log(`JLPT local backend listening on http://localhost:${port}`);
  console.log(`SQLite: ${databasePath()}`);
});
