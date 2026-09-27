import type { AppUser } from './messages';

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);
}

// Shown next to "已登录：" so it's obvious which account, scope and environment (local vs
// Cloudflare) a token is bound to — the same facts get_connection_info reports, not guesses.
export function formatIdentity(user: AppUser): string {
  const parts = [
    user.accountId ? `账号 #${user.accountId}` : null,
    user.environment ? (user.environment === 'cloudflare' ? '云端' : '本地') : null,
    user.scopes?.length ? `权限：${user.scopes.join('、')}` : null,
  ].filter((part): part is string => Boolean(part));
  const detail = parts.length ? ` <span class="muted">（${parts.map(escapeHtml).join(' · ')}）</span>` : '';
  return `${escapeHtml(user.username)}${detail}`;
}
