export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiRequest<T = unknown>(
  path: string,
  options: { method?: string; token?: string; body?: unknown; timeoutMs?: number } = {},
): Promise<T> {
  const response = await fetch(path, {
    method: options.method ?? 'GET',
    ...(options.timeoutMs ? { signal: AbortSignal.timeout(options.timeoutMs) } : {}),
    headers: {
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(typeof json.error === 'string' ? json.error : `Request failed: ${response.status}`, response.status);
  }
  return json as T;
}
