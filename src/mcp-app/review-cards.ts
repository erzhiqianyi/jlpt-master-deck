import { App, applyDocumentTheme, applyHostStyleVariables } from '@modelcontextprotocol/ext-apps';
import type { McpUiHostContext } from '@modelcontextprotocol/ext-apps';
import { createReviewCardsView, type ReviewCards } from './review-cards-view';

const app = new App({ name: 'jlpt-review-cards', version: '1.0.0' });
const view = createReviewCardsView(document.getElementById('app')!, async (filters) => {
  const result = await app.callServerTool({ name: 'get_review_cards', arguments: filters });
  if (result.isError || !Array.isArray(result.structuredContent?.cards)) throw new Error('无法读取复习卡片，请检查授权后重试。');
  return result.structuredContent as ReviewCards;
});
app.ontoolresult = (result) => {
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
