// Legacy stdio MCP server for a local Claude Code / Codex process. The OAuth-protected HTTP
// server in server/mcp-app.mjs is the primary surface; this one shares its tool catalogue and
// identifies the user from JLPT_MCP_TOKEN (an app session token) at startup instead of a
// `login` tool and per-call `token` parameters.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { userForToken } from './storage.mjs';
import { resources, tools, toolJsonSchema } from './mcp-tools.mjs';

const protocolVersion = '2024-11-05';
const serverInfo = { name: 'jlpt-local-mcp', version: '0.2.0' };
const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const statusPath = join(rootDir, '.local', 'mcp-status.json');

const user = userForToken(process.env.JLPT_MCP_TOKEN ?? '');
if (!user) {
  console.error('JLPT_MCP_TOKEN is missing or not a valid session token. Copy localStorage["jlpt-auth-token-v1"] from a signed-in browser, or connect over HTTP instead: claude mcp add --transport http jlpt <origin>/api/jlpt/mcp');
  process.exit(1);
}
const ctx = { ownerId: String(user.id), scopes: ['study', 'library:write'], grantId: 'stdio', clientId: 'stdio', clientName: 'stdio', request: null };
const toolsByName = new Map(tools.map((tool) => [tool.name, tool]));

process.stdin.setEncoding('utf8');
let buffer = '';

process.stdin.on('data', (chunk) => {
  buffer += chunk;
  for (;;) {
    const index = buffer.indexOf('\n');
    if (index === -1) {
      return;
    }
    const line = buffer.slice(0, index).trim();
    buffer = buffer.slice(index + 1);
    if (line) {
      handleMessage(line);
    }
  }
});

async function handleMessage(line) {
  const message = JSON.parse(line);
  try {
    if (message.method === 'initialize') {
      writeMcpStatus({ method: 'initialize' });
      return respond(message.id, {
        protocolVersion,
        capabilities: { tools: {}, resources: {} },
        serverInfo,
      });
    }

    if (message.method === 'tools/list') {
      writeMcpStatus({ method: 'tools/list' });
      return respond(message.id, { tools: toolList() });
    }

    if (message.method === 'resources/list') {
      writeMcpStatus({ method: 'resources/list' });
      return respond(message.id, { resources: resources.map(({ uri, name, title, description, mimeType, _meta }) => ({ uri, name, title, description, mimeType, _meta })) });
    }

    if (message.method === 'resources/read') {
      writeMcpStatus({ method: 'resources/read' });
      const resource = resources.find((entry) => entry.uri === message.params?.uri);
      if (!resource) throw new Error(`Unknown resource: ${message.params?.uri}`);
      return respond(message.id, { contents: await resource.read(ctx) });
    }

    if (message.method === 'tools/call') {
      writeMcpStatus({ method: 'tools/call', tool: message.params?.name });
      return respond(message.id, await callTool(message.params?.name, message.params?.arguments ?? {}));
    }

    if (message.id !== undefined) {
      return respond(message.id, {});
    }
  } catch (error) {
    respondError(message.id, -32000, error.message);
  }
}

async function callTool(name, args) {
  const tool = toolsByName.get(name);
  if (!tool) {
    throw new Error(`Unknown tool: ${name}`);
  }
  const parsed = z.object(tool.inputSchema).safeParse(args);
  if (!parsed.success) {
    throw new Error(`Invalid arguments for ${name}: ${parsed.error.message}`);
  }
  return tool.handler(parsed.data, ctx);
}

function toolList() {
  return tools.map((tool) => ({
    name: tool.name,
    ...(tool.title ? { title: tool.title } : {}),
    description: tool.description,
    inputSchema: toolJsonSchema(tool),
    annotations: tool.annotations,
    ...(tool._meta ? { _meta: tool._meta } : {}),
  }));
}

function respond(id, result) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`);
}

function respondError(id, code, message) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } })}\n`);
}

function writeMcpStatus({ method, tool }) {
  mkdirSync(dirname(statusPath), { recursive: true });
  writeFileSync(statusPath, JSON.stringify({
    lastSeenAt: new Date().toISOString(),
    lastMethod: method,
    lastTool: tool ?? null,
    lastClient: 'stdio',
  }, null, 2));
}
