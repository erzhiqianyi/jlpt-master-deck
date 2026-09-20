/** Pages advanced-mode Worker: same-origin API proxy during the database migration. */
export async function handleRequest(request, env, fetchUpstream = fetch) {
  const url = new URL(request.url);
  if (url.pathname === '/api/deployment') {
    return Response.json({ ok: true, backend: 'external', dataMigrated: false }, { headers: { 'cache-control': 'no-store' } });
  }
  // Learning backups must never be served as anonymous static assets.
  if (url.pathname === '/data' || url.pathname.startsWith('/data/')) {
    return new Response('Not found', { status: 404 });
  }
  if (url.pathname === '/api' || url.pathname.startsWith('/api/') || url.pathname.startsWith('/.well-known/')) {
    if (!env.API_ORIGIN) return Response.json({ error: 'API origin is not configured' }, { status: 503 });
    const origin = new URL(env.API_ORIGIN);
    if (origin.protocol !== 'https:' || origin.origin === url.origin) {
      return Response.json({ error: 'Invalid API origin' }, { status: 503 });
    }
    const upstream = new URL(url.pathname + url.search, origin);
    const headers = new Headers(request.headers);
    headers.delete('host');
    headers.delete('forwarded');
    headers.set('x-forwarded-host', url.host);
    headers.set('x-forwarded-proto', 'https');
    try {
      const response = await fetchUpstream(new Request(upstream, {
        method: request.method, headers,
        body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
        redirect: 'manual', duplex: 'half',
      }));
      const result = new Response(response.body, response);
      result.headers.set('cache-control', 'no-store');
      const location = result.headers.get('location');
      if (location) {
        const redirect = new URL(location, upstream);
        if (redirect.origin === origin.origin) {
          result.headers.set('location', url.origin + redirect.pathname + redirect.search + redirect.hash);
        }
      }
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
