// OAuth 2.1-protected HTTP MCP server. Identity comes from the app's own session tokens
// (`userForToken`), data isolation stays in storage.mjs; this module only bridges the two to
// @ninomae/mcp-app-server. Routes: <basePath>/mcp, <basePath>/mcp/schema, <basePath>/oauth/*,
// plus /.well-known/oauth-* discovery documents.
import { createMcpAppServer, sessionIdentity } from '@ninomae/mcp-app-server';
import { sqlStore } from '@ninomae/mcp-app-server/sql';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { currentPlatform } from './platform.mjs';
import { getDb, userById, userForToken } from './storage.mjs';
import { resources, scopes, tools } from './mcp-tools.mjs';

export const MCP_BASE_PATH = '/api/jlpt';
export const CONSENT_PATH = '/oauth/authorize';
/** Paths api.mjs hands to the MCP server before its own routing. */
export const MCP_PATHS = /^\/(\.well-known\/oauth-|api\/jlpt\/(mcp|oauth)(\/|$|\?))/;

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const statusPath = join(rootDir, '.local', 'mcp-status.json');

/** Wrap the synchronous `node:sqlite` handle in the async `SqlDatabase` shape `sqlStore` expects. */
export function nodeSqlite(db) {
  const wrap = (sql, values = []) => ({
    bind: (...next) => wrap(sql, next),
    first: async () => db.prepare(sql).get(...values) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...values) }),
    run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...values).changes) } }),
  });
  return { exec: async (sql) => void db.exec(sql), prepare: (sql) => wrap(sql) };
}

/** The consent page sends the browser's session token; local and Firebase logins both end up in `sessions`. */
export const identity = sessionIdentity(async (request) => {
  const header = request.headers.get('authorization') ?? '';
  const token = /^Bearer\s+(.+)$/i.exec(header)?.[1] ?? '';
  const user = userForToken(token);
  return user ? { id: String(user.id), displayName: user.username } : null;
});

/**
 * Local dev is http://127.0.0.1:4220, the tunnel is https://jlpt-local.erzhiqian.cc — separate
 * token audiences, so the origin comes from the request. Node only sees plain HTTP behind Vite and
 * cloudflared, so honour the forwarded scheme/host; JLPT_PUBLIC_ORIGIN pins one origin outright.
 */
export function originsFor(request, env = process.env) {
  let origin = env.JLPT_PUBLIC_ORIGIN;
  if (!origin) {
    const url = new URL(request.url);
    const proto = request.headers.get('x-forwarded-proto')?.split(',')[0].trim() || url.protocol.replace(/:$/, '');
    const host = request.headers.get('x-forwarded-host')?.split(',')[0].trim() || url.host;
    origin = `${proto}://${host}`;
  }
  return { publicOrigin: origin, webOrigin: origin };
}

/**
 * `get_connection_info` answers "which environment and which user is this agent bound to?"
 * from the grant, never from the browser session — the two can drift after an account switch.
 */
export async function resolveConnection({ ownerId }) {
  const user = userById(ownerId);
  return {
    user: user ? { displayName: user.username } : null,
    environment: currentPlatform()?.dataSource ? 'cloudflare' : 'local',
    dataSource: currentPlatform()?.dataSource ?? 'sqlite',
  };
}

export function createJlptMcp({ storage, onEvent = recordEvent, origins = originsFor, inspector = false } = {}) {
  return createMcpAppServer({
    name: 'jlpt',
    version: '0.2.0',
    basePath: MCP_BASE_PATH,
    consentPath: CONSENT_PATH,
    scopes,
    identity,
    storage: storage ?? sqlStore(nodeSqlite(getDb())),
    tools,
    resources,
    connectionInfo: { resolve: resolveConnection },
    origins,
    anonymousDiscovery: false, // personal app: no tool list without a token
    inspector, // dev-only browser page at <basePath>/mcp/inspector; the worker never enables it
    onEvent,
  });
}

// Keep the `.local/mcp-status.json` heartbeat the About page reads, and log the audit event.
function recordEvent(event) {
  console.log('[mcp]', JSON.stringify(event));
  try {
    mkdirSync(dirname(statusPath), { recursive: true });
    writeFileSync(statusPath, JSON.stringify({
      lastSeenAt: new Date().toISOString(),
      lastMethod: event.type === 'tool' ? 'tools/call' : event.type,
      lastTool: event.type === 'tool' ? event.tool : null,
      lastClient: event.clientName,
    }, null, 2));
  } catch { /* status file is best-effort */ }
}
