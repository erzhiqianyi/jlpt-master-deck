import { createServer } from 'node:http';
import { getRequestListener } from '@hono/node-server';
import { createJlptMcp } from './mcp-app.mjs';
import { createApiHandler } from './api-handler.mjs';
import { localConfig } from './local-config.mjs';
import { databasePath } from './storage.mjs';

const { apiPort: port, host } = localConfig();
const mcp = createJlptMcp();
await mcp.ensureSchema();
const mcpListener = getRequestListener(async (request) => (await mcp.fetch(request)) ?? new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { 'content-type': 'application/json' } }));
const server = createServer(createApiHandler({ mcp, mcpListener }));
server.listen(port, host, () => {
  console.log(`JLPT local backend listening on http://localhost:${port}`);
  console.log(`SQLite: ${databasePath()}`);
});
