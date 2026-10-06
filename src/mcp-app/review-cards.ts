import { App, applyDocumentTheme, applyHostStyleVariables } from '@modelcontextprotocol/ext-apps';
import type { McpUiHostContext } from '@modelcontextprotocol/ext-apps';
import { createReviewCardsView, type ReviewCards } from './review-cards-view';

const app = new App({ name: 'jlpt-review-cards', version: '1.0.0' });
const view = createReviewCardsView(document.getElementById('app')!, async (filters) => {
  const result = await app.callServerTool({ name: 'get_review_cards', arguments: filters });
  if (result.isError || !Array.isArray(result.structuredContent?.cards)) throw new Error('无法读取复习卡片，请检查授权后重试。');
  return result.structuredContent as ReviewCards;
}, async (itemId, rating, eventId) => {
  const result = await app.callServerTool({ name: 'rate_review_card', arguments: { item_id: itemId, rating, event_id: eventId } });
  if (result.isError || result.structuredContent?.item_id !== itemId) throw new Error('复习结果未保存，请重试。');
}, {
  async query(word) {
    const result = await app.callServerTool({ name: 'lookup_word', arguments: { query: word } });
    if (result.isError) throw new Error('查词失败，请重试。');
    const content = result.content.find(entry => entry.type === 'text');
    const matches = content?.type === 'text' ? JSON.parse(content.text) : [];
    if (!Array.isArray(matches)) throw new Error('查词结果格式错误。');
    return matches;
  },
  async enqueue(word, context) {
    const result = await app.callServerTool({ name: 'create_learning_capture', arguments: { body: word, category: 'word', targetDeck: 'n1_vocab', context: `点词查询\n原文：${context}\n请结合上下文确认词义与辞书形，通过 MCP 解析并加入词库。` } });
    if (result.isError) throw new Error('加入队列失败，请重试。');
  },
});
app.ontoolresult = (result) => {
  if (result.structuredContent?.item_id) return;
  if (view.hasData() && !Array.isArray(result.structuredContent?.cards)) return;
  if (result.isError || !Array.isArray(result.structuredContent?.cards)) {
    view.showError('无法读取复习卡片，请检查授权后重试。'); return;
  }
  view.setData(result.structuredContent as ReviewCards);
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
