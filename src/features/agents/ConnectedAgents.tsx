import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../../lib/api';
import { useConfirmation } from '../../components/confirmation';

export type AgentGrant = {
  id: string;
  name: string;
  scopes: string[];
  createdAt: string;
  expiresAt: string;
  lastUsedAt: string;
  revoked: boolean;
  expired: boolean;
  prefix: string;
};

const mcpUrl = () => `${window.location.origin}/api/jlpt/mcp`;

/** Active (non-revoked) grants for the signed-in account. */
export async function fetchAgentGrants(authToken: string) {
  const response = await apiRequest<{ grants: AgentGrant[] }>('/api/agents', { token: authToken });
  return response.grants.filter((grant) => !grant.revoked);
}

/** Settings section: agents that connected through OAuth, with a disconnect button per grant. */
export function ConnectedAgents({ authToken, showEndpoint = true }: { authToken: string; showEndpoint?: boolean }) {
  const confirm = useConfirmation();
  const [grants, setGrants] = useState<AgentGrant[] | null>(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      setGrants(await fetchAgentGrants(authToken));
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '读取失败');
      setGrants([]);
    }
  }, [authToken]);

  useEffect(() => { void load(); }, [load]);

  async function revoke(grant: AgentGrant) {
    if (!(await confirm({ title: `断开 ${grant.name}？`, description: '这个 Agent 持有的访问令牌会立即失效，需要重新授权才能再次访问。', confirmLabel: '断开', cancelLabel: '取消', danger: true }))) return;
    setBusyId(grant.id);
    try {
      await apiRequest(`/api/agents/${encodeURIComponent(grant.id)}/revoke`, { method: 'POST', token: authToken });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '断开失败');
    } finally {
      setBusyId('');
    }
  }

  async function copyUrl() {
    try { await navigator.clipboard.writeText(mcpUrl()); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard may be unavailable */ }
  }

  return (
    <div className="grid gap-4">
      {showEndpoint ? <>
        <p className="m-0 text-sm leading-6 text-[#68716b]">Claude、ChatGPT 或 Claude Code 通过下面的地址连接后，会跳到授权页请求你的同意。已授权的 Agent 只能访问你自己的学习记录。</p>
        <div className="flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-md bg-[#eef3ed] px-3 py-2 text-xs text-[#31564c]">{mcpUrl()}</code>
          <button type="button" onClick={() => void copyUrl()} className="min-h-10 rounded-md border border-[#d9d0c3] bg-white px-3 text-sm font-semibold text-[#4f5651] hover:bg-[#f6eee3]">{copied ? '已复制' : '复制地址'}</button>
        </div>
        <p className="m-0 text-xs leading-5 text-[#7d837e]">Claude Code：<code>claude mcp add --transport http jlpt {mcpUrl()}</code></p>
      </> : null}
      {error ? <p role="alert" className="m-0 rounded-md border border-[#f0cf80] bg-[#fff8df] p-3 text-sm font-semibold text-[#775516]">{error}</p> : null}
      {grants === null ? (
        <p className="m-0 text-sm text-[#68716b]">读取中…</p>
      ) : grants.length === 0 ? (
        <p className="m-0 text-sm text-[#68716b]">还没有已连接的 Agent。</p>
      ) : (
        <ul className="m-0 grid list-none gap-2 p-0">
          {grants.map((grant) => (
            <li key={grant.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[#e1ddd5] bg-white px-3 py-3">
              <div className="min-w-0">
                <p className="m-0 text-sm font-semibold text-[#31564c]">{grant.name}{grant.expired ? <span className="ml-2 text-xs font-normal text-[#a0522d]">已过期</span> : null}</p>
                <p className="m-0 text-xs text-[#7d837e]">{grant.scopes.join(' · ')} · {grant.prefix}… · 最近使用 {formatTime(grant.lastUsedAt || grant.createdAt)}</p>
              </div>
              <button type="button" disabled={busyId === grant.id} onClick={() => void revoke(grant)} className="min-h-10 rounded-md border border-[#e0b4b4] bg-white px-3 text-sm font-semibold text-[#8f3a3a] hover:bg-[#fdf1f1] disabled:opacity-60">{busyId === grant.id ? '断开中…' : '断开'}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}
