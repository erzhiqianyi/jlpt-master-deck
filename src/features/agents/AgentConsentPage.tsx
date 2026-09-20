import { useAgentConsent } from '@ninomae/mcp-app-server/react';
import { PlugZap } from 'lucide-react';

export const AGENT_CONSENT_PATH = '/oauth/authorize';
export const MCP_BASE_PATH = '/api/jlpt';

/** True when the browser landed on the OAuth consent page instead of the hash-routed app. */
export function isAgentConsentPage() {
  return typeof window !== 'undefined' && window.location.pathname === AGENT_CONSENT_PATH;
}

/**
 * Consent page an MCP client is redirected to from /api/jlpt/oauth/authorize. Rendered only for a
 * signed-in user; `authToken` is the app session token that proves who is approving.
 */
export function AgentConsentPage({ authToken, username }: { authToken: string; username: string }) {
  const { client, chosen, toggle, decide, error, busy, missingClient, destination } = useAgentConsent({
    basePath: MCP_BASE_PATH,
    authHeaders: (): Record<string, string> => (authToken ? { authorization: `Bearer ${authToken}` } : {}),
  });

  return (
    <main className="cute-shell flex min-h-[100dvh] items-start justify-center px-5 py-10 text-[#28312d] sm:items-center sm:px-8 sm:py-12 lg:px-12">
      <section className="cute-card w-full max-w-md bg-transparent sm:max-w-[440px] sm:border sm:p-8">
        <h1 className="cute-brand text-2xl">JLPT Review</h1>
        {missingClient || (!client && error) ? (
          <div className="mt-6 space-y-3">
            <p className="text-base font-semibold">无效的授权请求</p>
            <p className="text-sm text-[#68716b]">{error || '链接缺少 client_id。请回到 Agent 客户端重新发起连接。'}</p>
          </div>
        ) : !client ? (
          <p className="mt-6 text-sm text-[#68716b]">正在读取授权请求…</p>
        ) : (
          <div className="mt-6 space-y-5">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#eef3ed] text-[#31564c]"><PlugZap size={18} /></span>
              <div className="min-w-0">
                <p className="text-lg font-semibold leading-6">{client.clientName} 想访问你的 JLPT 学习数据</p>
                <p className="mt-1 text-sm text-[#68716b]">以 <strong>{username}</strong> 的身份授权{destination ? `，完成后会返回 ${destination}` : ''}。</p>
              </div>
            </div>
            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold text-[#46514c]">允许的权限</legend>
              {client.scopeDetails.map((scope) => (
                <label key={scope.name} className={`flex items-start gap-3 rounded-2xl border px-3 py-3 text-sm ${scope.required ? 'border-[#e1ddd5] bg-[#f7f5ef]' : 'cursor-pointer border-[#d9d0c3] bg-white'}`}>
                  <input
                    type="checkbox"
                    className="mt-0.5 h-5 w-5 shrink-0 accent-[#24473f]"
                    checked={scope.required || chosen.includes(scope.name)}
                    disabled={scope.required || busy}
                    onChange={(event) => toggle(scope.name, event.target.checked)}
                  />
                  <span className="min-w-0">
                    <span className="block font-semibold text-[#31564c]">{scope.description}</span>
                    <span className="block text-xs text-[#7d837e]">{scope.name}{scope.required ? ' · 必需' : ''}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            <p className="text-xs leading-5 text-[#7d837e]">授权后 Agent 只能以你的身份访问你自己的记录。你可以随时在「设置 → 已连接的 Agent」断开。</p>
            {error ? <p role="alert" className="rounded-2xl border border-[#f0cf80] bg-[#fff8df] p-3 text-sm font-semibold text-[#775516]">{error}</p> : null}
            <div className="grid grid-cols-2 gap-2">
              <button type="button" disabled={busy} onClick={() => void decide('deny')} className="cute-button-secondary h-12 rounded-2xl px-4 text-sm font-semibold disabled:opacity-60">拒绝</button>
              <button type="button" disabled={busy} onClick={() => void decide('approve')} className="cute-button-primary h-12 rounded-2xl px-4 text-sm font-semibold text-white disabled:opacity-60">{busy ? '处理中…' : '允许'}</button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
