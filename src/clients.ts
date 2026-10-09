import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import ipaddr from 'ipaddr.js';
import { z } from 'zod';
import { Store } from './store.js';
import { random, hash } from './crypto.js';

export function validRedirect(value: string) {
  try {
    const url = new URL(value);
    const safeHost = /^(?:[a-z0-9.-]+|\[[a-f0-9:]+\])$/i.test(url.hostname);
    return safeHost && !url.username && !url.password && !url.hash && (url.protocol === 'https:' || (url.protocol === 'http:' && ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname)));
  } catch { return false; }
}
const metadata = z.object({
  client_name: z.string().min(1).max(100).default('MCP client'),
  redirect_uris: z.array(z.string().max(2048).refine(validRedirect)).min(1).max(10),
  token_endpoint_auth_method: z.literal('none').default('none'),
  grant_types: z.array(z.enum(['authorization_code', 'refresh_token'])).default(['authorization_code', 'refresh_token']),
  response_types: z.array(z.literal('code')).default(['code']),
});
export type Client = z.infer<typeof metadata> & { client_id: string };

/** CIMD retrieval: HTTPS, public IPs, pinned DNS, no redirects, bounded body. */
export async function fetchClientDocument(id: string): Promise<unknown> {
  const url = new URL(id);
  if (url.protocol !== 'https:' || url.port && url.port !== '443' || url.username || url.password || url.hash || url.pathname === '/') throw new Error('Invalid client metadata URL');
  const addresses = await lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some(a => ipaddr.process(a.address).range() !== 'unicast')) throw new Error('Client metadata must use public addresses');
  const target = addresses[0]!;
  return await new Promise((resolve, reject) => {
    const req = request(url, { method: 'GET', headers: { Accept: 'application/json' },
      lookup: (_host, _opts, callback) => callback(null, target.address, target.family) }, res => {
      if (res.statusCode !== 200 || !res.headers['content-type']?.toLowerCase().includes('json')) { res.resume(); reject(new Error('Invalid client document')); return; }
      let bytes = 0; const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => { bytes += chunk.length; if (bytes > 65536) req.destroy(new Error('Document too large')); else chunks.push(chunk); });
      res.on('error', reject);
      res.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new Error('Invalid JSON')); } });
    });
    const timer = setTimeout(() => req.destroy(new Error('Client document timeout')), 5000);
    req.on('close', () => clearTimeout(timer)); req.on('error', reject); req.end();
  });
}
export class Clients {
  constructor(private store: Store, private retrieve = fetchClientDocument) {}
  register(input: unknown): Client {
    const value = metadata.parse(input);
    if (!value.grant_types.includes('authorization_code') || !value.response_types.includes('code')) throw new Error('Authorization code flow required');
    const client = { ...value, client_id: `bsp_client_${random()}` };
    this.store.set('client', hash(client.client_id), client, Date.now() + 365 * 86400_000);
    return client;
  }
  async get(id: string): Promise<Client | undefined> {
    const stored = this.store.get<Client>('client', hash(id));
    if (stored) return stored;
    if (!id.startsWith('https://')) return undefined;
    const doc = z.object({ client_id: z.literal(id) }).passthrough().parse(await this.retrieve(id));
    const client = { ...metadata.parse(doc), client_id: id };
    this.store.set('client', hash(id), client, Date.now() + 3600_000);
    return client;
  }
}
