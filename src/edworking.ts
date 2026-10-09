import { z } from 'zod';
export class ApiError extends Error {
  constructor(public code: string, message: string) { super(message); }
}
export const tokenInfoSchema = z.object({ id: z.string(), name: z.string(), userId: z.string(), teamId: z.string(), scopes: z.array(z.string()), expiresAt: z.string() });
export type TokenInfo = z.infer<typeof tokenInfoSchema>;
export class Edworking {
  constructor(private url: string, private request: typeof fetch = fetch) {}
  async execute<T>(token: string, query: string, variables: Record<string, unknown> = {}): Promise<T> {
    let response: Response;
    try {
      response = await this.request(this.url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(35_000), redirect: 'error' });
    } catch { throw new ApiError('UPSTREAM_UNAVAILABLE', 'Edworking did not respond. Check the result before retrying a write.'); }
    if ([401, 403].includes(response.status)) throw new ApiError('UNAUTHORIZED', 'Reconnect Edworking; the connection is expired, revoked, or not permitted.');
    if (response.status === 429) throw new ApiError('RATE_LIMITED', 'Edworking is busy. Wait before trying again.');
    if (!response.ok) throw new ApiError('UPSTREAM_UNAVAILABLE', 'Edworking could not complete this request.');
    // Bound responses even when an upstream proxy ignores Content-Length.
    const reader = response.body?.getReader();
    if (!reader) throw new ApiError('UPSTREAM_UNAVAILABLE', 'Edworking returned an empty response.');
    const chunks: Uint8Array[] = []; let total = 0;
    try {
      for (;;) { const { done, value } = await reader.read(); if (done) break; total += value.length; if (total > 2_000_000) { await reader.cancel(); throw new Error('large'); } chunks.push(value); }
    } catch { throw new ApiError('UPSTREAM_UNAVAILABLE', 'Edworking returned an unreadable response.'); }
    let payload: { data?: T; errors?: { extensions?: { code?: string } }[] };
    try { payload = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { throw new ApiError('UPSTREAM_UNAVAILABLE', 'Edworking returned an invalid response.'); }
    if (payload.errors?.length) {
      const code = payload.errors[0]?.extensions?.code;
      if (code === 'FORBIDDEN' || code === 'UNAUTHENTICATED') throw new ApiError('UNAUTHORIZED', 'This connection cannot access the requested resource.');
      throw new ApiError('API_ERROR', 'Edworking rejected the request. Check the IDs, permissions, and field values.');
    }
    if (!payload.data) throw new ApiError('UPSTREAM_UNAVAILABLE', 'Edworking returned no data.');
    return payload.data;
  }
  async tokenInfo(token: string): Promise<TokenInfo> {
    if (!/^edw_pat_[A-Za-z0-9_-]{43}$/.test(token)) throw new ApiError('UNAUTHORIZED', 'Use a scoped Edworking API token.');
    const data = await this.execute<{ apiTokenInfo: unknown }>(token, 'query BellsproutConnection { apiTokenInfo { id name userId teamId scopes expiresAt } }');
    const parsed = tokenInfoSchema.safeParse(data.apiTokenInfo);
    if (!parsed.success || !Number.isFinite(Date.parse(parsed.data.expiresAt)) || Date.parse(parsed.data.expiresAt) <= Date.now()) throw new ApiError('UNAUTHORIZED', 'The Edworking connection has expired.');
    return parsed.data;
  }
}
