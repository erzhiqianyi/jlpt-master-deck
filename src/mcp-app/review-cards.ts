import { App, applyDocumentTheme, applyHostStyleVariables } from '@modelcontextprotocol/ext-apps';
import type { McpUiHostContext } from '@modelcontextprotocol/ext-apps';
import { createReviewCardsView, type ReviewCards } from './review-cards-view';

// v3 のカード（get_due_cards）を表示用の形にする。テンプレートの項目名 → 表示の項目名
const FIELD: Record<string, string> = { expression: 'original', reading: 'reading', romaji: 'reading', meaning: 'meaning', meaning_ja: 'meaning_ja', paraphrase: 'meaning_ja',
  example: 'examples', memory_point: 'core_memory', pattern: 'patterns', note: 'notes' };
type DueCards = { due: number; new: number; cards: Array<{ code: string; kind: string; front: Face[]; back: Face[] }> };
type Face = { field: string; items: Array<{ text?: string; translation?: string; title?: string }> };
const face = (entries: Face[]) => entries.filter((e) => FIELD[e.field]).map((e) => ({
  field: FIELD[e.field] as ReviewCards['cards'][number]['front'][number]['field'],
  lines: e.items.map((i) => [i.title, i.text, i.translation].filter(Boolean).join(' — ')).filter(Boolean),
}));
function toView(data: DueCards, filters: Record<string, unknown>): ReviewCards {
  return { title: '复习卡片', locale: 'zh-CN', total: data.due + data.new, offset: 0, next_offset: null, filters,
    cards: data.cards.map((c) => ({ id: c.code, reference: c.code, deck: c.kind, front: face(c.front), back: face(c.back) })) };
}
const isDueCards = (value: unknown): value is DueCards => Boolean(value && typeof value === 'object' && Array.isArray((value as DueCards).cards));

const app = new App({ name: 'jlpt-review-cards', version: '2.0.0' });
const view = createReviewCardsView(document.getElementById('app')!, async (filters) => {
  const { offset: _offset, ...rest } = filters;
  const result = await app.callServerTool({ name: 'get_due_cards', arguments: rest });
  if (result.isError || !isDueCards(result.structuredContent)) throw new Error('无法读取复习卡片，请检查授权后重试。');
  return toView(result.structuredContent, rest);
}, async (code, rating, eventId) => {
  const result = await app.callServerTool({ name: 'rate_card', arguments: { code, rating, eventId } });
  if (result.isError || (result.structuredContent as { code?: string } | undefined)?.code !== code) throw new Error('复习结果未保存，请重试。');
}, {
  async query(word) {
    const result = await app.callServerTool({ name: 'lookup_word', arguments: { query: word } });
    if (result.isError) throw new Error('查词失败，请重试。');
    const items = (result.structuredContent as { items?: Array<{ expression: string; reading: string | null; meaning: { text: string } | null; meaningJa: string | null }> } | undefined)?.items;
    if (!Array.isArray(items)) throw new Error('查词结果格式错误。');
    return items.map(item => ({ original: item.expression, reading: item.reading ?? undefined, meaning_zh: item.meaning?.text, meaning_ja: item.meaningJa ?? undefined }));
  },
  async enqueue(word, context) {
    const result = await app.callServerTool({ name: 'create_learning_capture', arguments: { body: word, category: 'word', context: `点词查询\n原文：${context}\n请结合上下文确认词义与辞书形，通过 MCP 解析并加入词库。` } });
    if (result.isError) throw new Error('加入队列失败，请重试。');
  },
});
app.ontoolresult = (result) => {
  if ((result.structuredContent as { rating?: string } | undefined)?.rating) return;
  if (view.hasData() && !isDueCards(result.structuredContent)) return;
  if (result.isError || !isDueCards(result.structuredContent)) {
    view.showError('无法读取复习卡片，请检查授权后重试。'); return;
  }
  view.setData(toView(result.structuredContent, {}));
};
function applyHost(context: Partial<McpUiHostContext>) {
  if (context.theme) applyDocumentTheme(context.theme);
  if (context.styles?.variables) applyHostStyleVariables(context.styles.variables);
}
app.onhostcontextchanged = applyHost;
app.connect().then(() => {
  applyHost(app.getHostContext() ?? {});
  // A resource opened directly in Inspector has no originating tool result.
  if (!view.hasData()) void view.load();
}).catch(() => view.showError('请在支持 MCP Apps 的客户端或调试工具中打开复习卡片。'));
