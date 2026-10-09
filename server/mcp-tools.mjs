// Tool catalogue shared by the OAuth-protected HTTP MCP server (server/mcp-app.mjs) and the
// stdio server (server/mcp-server.mjs). Handlers receive `uid(ctx)`; nothing about the caller
// comes from tool input. Study data tools live in server/v3/mcp-tools.mjs; this file adds the
// workstation-only study materials and the scope catalogue.
import { z } from 'zod';
import { currentPlatform } from './platform.mjs';
import { readLocalOfficialSamples, readLocalMockExam, readLocalMockExamManifest } from './local-study-data.mjs';
import { v3Tools } from './v3/mcp-tools.mjs';
import { aiHomeResource, reviewCardsResource, practiceResource } from './mcp-ui.mjs';

/** Scope catalogue. Audio bytes and library writes each require an optional grant beyond study. */
export const scopes = {
  study: { description: '读取并更新你的学习记录、计划、草稿、单词本和题目', required: true },
  'audio:read': { description: '读取你上传的音频与图片文件，供授权的 AI Agent 听取和分析', default: false },
  'library:write': { description: '新增或修改知识点、题目、练习、素材；删除你自己的知识点、单词本、题目、练习、草稿和录音；发布与导入分享', default: false },
};

const ro = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
const text = (value) => ({ content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] });

// Match the local-only REST material boundary; never expose workstation files through a tunnel.
function requireLocalMaterials(ctx) {
  if (currentPlatform()?.dataSource) throw new Error('Local study materials are unavailable in the cloud environment');
  if (ctx.clientId === 'stdio' && ctx.request == null) return;
  const request = ctx.request;
  const host = request && new URL(request.url).hostname;
  if (!['localhost', '127.0.0.1', '[::1]'].includes(host)
      || request.headers.get('x-forwarded-host') || request.headers.get('forwarded')) {
    throw new Error('Local study materials require a localhost MCP connection or local stdio');
  }
}

const local = (name, description, inputSchema, read) => ({
  name, description, inputSchema, annotations: ro,
  handler: async (args, ctx) => { requireLocalMaterials(ctx); return text(read(args)); },
});

export const tools = [
  local('list_local_official_samples', 'Read official sample data used on the page, optionally filtered by module. Available only through localhost or local stdio, not cloud or tunnel.',
    { module: z.string().optional() }, ({ module }) => readLocalOfficialSamples(module)),
  local('list_local_mock_exams', 'Read the local mock exam catalogue. Requires localhost or local stdio.', {}, () => readLocalMockExamManifest()),
  local('get_local_mock_exam', 'Read a complete local mock exam, including reading passages. Requires localhost or local stdio.',
    { id: z.string().regex(/^[A-Za-z0-9_-]+$/) }, ({ id }) => {
      const exam = readLocalMockExam(id);
      if (!exam) throw new Error('Local mock exam not found');
      return exam;
    }),
  ...v3Tools,
];

/** Static resources served next to the tools: the MCP App views for practice, review cards and the AI home. */
export const resources = [practiceResource, reviewCardsResource, aiHomeResource];

/** JSON Schema view of a tool's input, for surfaces that do not speak zod (the stdio server). */
export function toolJsonSchema(entry) {
  return z.toJSONSchema(z.object(entry.inputSchema), { io: 'input' });
}
