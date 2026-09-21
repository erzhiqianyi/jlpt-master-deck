/** Pages advanced-mode Worker: same-origin binding to the Cloudflare API Worker. */
export async function handleRequest(request, env) {
  const url = new URL(request.url);
  if (url.pathname === '/api/deployment') {
    return Response.json({ ok: true, backend: 'cloudflare', database: 'durable-object-sqlite', dataMigrated: false }, { headers: { 'cache-control': 'no-store' } });
  }
  // Learning backups must never be served as anonymous static assets.
  if (url.pathname === '/data' || url.pathname.startsWith('/data/')) {
    return new Response('Not found', { status: 404 });
  }
  if (url.pathname === '/api' || url.pathname.startsWith('/api/') || url.pathname.startsWith('/.well-known/')) {
    if (!env.API) return Response.json({ error: 'API service is not configured' }, { status: 503 });
    const headers = new Headers(request.headers);
    headers.delete('forwarded');
    headers.set('x-forwarded-host', url.host);
    headers.set('x-forwarded-proto', 'https');
    try {
      const response = await env.API.fetch(new Request(request, { headers, redirect: 'manual' }));
      const result = new Response(response.body, response);
      result.headers.set('cache-control', 'no-store');
      if (response.status >= 500) {
        return Response.json({ error: '学习服务暂时离线，请稍后重试。' }, { status: 503, headers: { 'cache-control': 'no-store' } });
      }
      return result;
    } catch {
      return Response.json({ error: '学习服务暂时离线，请稍后重试。' }, { status: 503, headers: { 'cache-control': 'no-store' } });
    }
  }
  return env.ASSETS.fetch(request);
}
export default { fetch(request, env) { return handleRequest(request, env); } };
