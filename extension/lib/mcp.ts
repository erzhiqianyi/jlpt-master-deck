// Thin MCP tool-call wrapper for the background service worker. Runs entirely over fetch
// (no node: built-ins), talking to the app's OAuth-protected HTTP MCP server at
// `${apiBaseUrl}/api/jlpt/mcp` (server/mcp-app.mjs). The server is stateless per request
// (no Mcp-Session-Id), so caching one connected Client per access token is enough — no
// session bookkeeping needed on our side.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

let cached: { client: Client; token: string; url: string } | null = null;

async function getClient(mcpUrl: string, accessToken: string): Promise<Client> {
  if (cached && cached.token === accessToken && cached.url === mcpUrl) return cached.client;
  const transport = new StreamableHTTPClientTransport(new URL(mcpUrl), {
    requestInit: { headers: { authorization: `Bearer ${accessToken}` } },
  });
  const client = new Client({ name: 'jlpt-master-deck-extension', version: '0.1.0' });
  await client.connect(transport);
  cached = { client, token: accessToken, url: mcpUrl };
  return client;
}

export function invalidateMcpClient() {
  cached = null;
}

export async function callMcpTool<T = unknown>(
  mcpUrl: string,
  accessToken: string,
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  let client: Client;
  try {
    client = await getClient(mcpUrl, accessToken);
  } catch (error) {
    invalidateMcpClient();
    throw error;
  }
  const result = await client.callTool({ name, arguments: args });
  if (result.isError) {
    const message = Array.isArray(result.content)
      ? result.content.map((block) => (block as { text?: string }).text).filter(Boolean).join('\n')
      : `MCP 工具调用失败：${name}`;
    throw new Error(message || `MCP 工具调用失败：${name}`);
  }
  if (result.structuredContent !== undefined) return result.structuredContent as T;
  const textBlock = Array.isArray(result.content)
    ? (result.content.find((block) => (block as { type?: string }).type === 'text') as { text?: string } | undefined)
    : undefined;
  return textBlock?.text ? (JSON.parse(textBlock.text) as T) : (undefined as T);
}
