import { Router, type Request, type Response, type NextFunction } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { OAuth, OAuthError } from './oauth.js';
import { random, hash, challenge, equal } from './crypto.js';
import { ApiError } from './edworking.js';
import { executeTool, pluginToolSpecs as toolSpecs } from './tools.js';

interface Device { challenge: string; clientId: string; expires: number; code?: string; denied?: boolean }
const paths = ['/start', '/poll', '/refresh', '/revoke', '/tool'];
const allowedTools = new Set(['list_projects', 'list_project_statuses', 'list_project_lists', 'list_tasks', 'list_figma_tasks', 'link_figma_frame', 'create_task', 'update_task', 'get_task', 'get_doc', 'list_docs', 'create_doc', 'list_project_members', 'list_doc_folders', 'get_plugin_context', 'insert_figma_design', 'upload_attachment']);
/** Isolated public-client transport. No cookies, general OAuth endpoints, arbitrary
 * clients, general MCP calls or GraphQL documents are accepted here. */
export function pluginRouter(oauth: OAuth) {
  const r = Router(), { config, store, api, vault } = oauth;
  const callback = `${config.origin}/plugin/callback`;
  let client = store.get<{ client_id: string }>('plugin-client', 'figma');
  if (!client) {
    client = oauth.clients.register({ client_name: 'Edworking for Figma', redirect_uris: [callback] });
    store.set('plugin-client', 'figma', client, Date.now() + 300 * 86400_000);
  }
  const clientId = client.client_id;
  const opaque = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
  r.use((req, res, next) => {
    res.set('Cache-Control', 'no-store').set('Referrer-Policy', 'no-referrer');
    if (paths.includes(req.path) && ['POST', 'OPTIONS'].includes(req.method)) {
      // Figma's sandbox has an opaque origin. This router never uses ambient
      // credentials; all access requires PKCE or a token for the fixed plugin client.
      res.set('Access-Control-Allow-Origin', '*').set('Access-Control-Allow-Methods', 'POST, OPTIONS').set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      if (req.method === 'OPTIONS') { res.status(204).end(); return; }
    }
    next();
  });
  r.use(rateLimit({ windowMs: 60_000, limit: 90, standardHeaders: 'draft-8', legacyHeaders: false }));
  r.post('/start', rateLimit({ windowMs: 60_000, limit: 10 }), (req, res) => {
    const input = z.object({ challenge: opaque }).safeParse(req.body);
    if (!input.success) { res.status(400).json({ error: 'invalid_request' }); return; }
    const id = random(), expires = Date.now() + 600_000;
    store.set('plugin-device', id, { challenge: input.data.challenge, clientId, expires } satisfies Device, expires);
    const url = new URL('/oauth/authorize', config.origin);
    url.search = new URLSearchParams({ client_id: clientId, redirect_uri: callback, response_type: 'code', code_challenge_method: 'S256',
      code_challenge: input.data.challenge, state: id, resource: config.resource, scope: 'projects:read tasks:read tasks:write docs:read docs:write files:read files:write' }).toString();
    res.json({ id, url: url.href, expiresAt: expires, interval: 5 });
  });
  r.get('/callback', (req, res) => {
    const id = typeof req.query.state === 'string' ? req.query.state : '';
    const device = store.get<Device>('plugin-device', id);
    if (!device || req.query.iss !== config.origin || device.code || device.denied) throw new OAuthError('invalid_grant', 'Start again from Figma.');
    if (req.query.error === 'access_denied') store.set('plugin-device', id, { ...device, denied: true }, device.expires);
    else {
      const code = typeof req.query.code === 'string' ? req.query.code : '';
      const record = store.get<{ clientId: string; redirect: string; challenge: string; used?: boolean; expires: number }>('code', hash(code));
      if (!record || record.used || record.expires <= Date.now() || record.clientId !== device.clientId || record.redirect !== callback || !equal(record.challenge, device.challenge)) throw new OAuthError('invalid_grant', 'Invalid return.');
      store.set('plugin-device', id, { ...device, code }, device.expires);
    }
    res.redirect(303, config.appUrl.replace(/\/$/, '') + '/connect/result?status=' + (req.query.error === 'access_denied' ? 'cancelled' : 'connected'));
  });
  r.post('/poll', async (req, res) => {
    const { id, verifier } = z.object({ id: opaque, verifier: z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/) }).parse(req.body);
    const device = store.get<Device>('plugin-device', id);
    if (!device || !equal(challenge(verifier), device.challenge)) throw new OAuthError('invalid_grant', 'Expired or invalid connection.');
    if (device.denied) { store.remove('plugin-device', id); throw new OAuthError('access_denied', 'Connection cancelled.'); }
    if (!device.code) { res.status(202).json({ pending: true }); return; }
    store.remove('plugin-device', id);
    res.json(await oauth.exchange({ grant_type: 'authorization_code', client_id: clientId, resource: config.resource, code: device.code, code_verifier: verifier, redirect_uri: callback }));
  });
  r.post('/refresh', async (req, res) => {
    const { refreshToken } = z.object({ refreshToken: z.string().regex(/^bsp_rt_[A-Za-z0-9_-]{43}$/) }).parse(req.body);
    res.json(await oauth.exchange({ grant_type: 'refresh_token', client_id: clientId, resource: config.resource, refresh_token: refreshToken }));
  });
  r.post('/revoke', (req, res) => {
    const { token } = z.object({ token: z.string().regex(/^bsp_(?:at|rt)_[A-Za-z0-9_-]{43}$/) }).parse(req.body);
    const record = store.get<{ clientId: string; grantId: string }>('refresh', hash(token)) || store.get<{ clientId: string; grantId: string }>('access', hash(token));
    if (record?.clientId === clientId) oauth.revokeGrant(record.grantId);
    res.json({ revoked: true });
  });
  r.post('/tool', async (req, res) => {
    const input = z.object({ name: z.string(), args: z.record(z.string(), z.unknown()) }).parse(req.body);
    const spec = allowedTools.has(input.name) && toolSpecs.find(tool => tool.name === input.name);
    if (!spec) { res.status(400).json({ error: 'invalid_tool' }); return; }
    const authorization = req.get('authorization');
    if (!authorization?.startsWith('Bearer ')) throw new OAuthError('invalid_token', 'Reconnect.', 401);
    const identity = oauth.authenticate(authorization.slice(7));
    if (identity.grant.clientId !== clientId) throw new OAuthError('invalid_token', 'A plugin connection is required.', 401);
    const current = await api.tokenInfo(identity.upstream);
    if (current.id !== identity.grant.info.id || current.userId !== identity.grant.info.userId || current.teamId !== identity.grant.info.teamId || identity.scopes.some(s => !current.scopes.includes(s))) {
      oauth.revokeGrant(identity.grant.id); throw new OAuthError('invalid_token', 'Reconnect.', 401);
    }
    res.json(await executeTool(spec, spec.schema.parse(input.args), { api, identity, config, store, vault }));
  });
  r.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (error instanceof z.ZodError) { res.status(400).json({ error: 'invalid_request' }); return; }
    if (error instanceof OAuthError) { res.status(error.status).json({ error: error.code }); return; }
    if (error instanceof ApiError) { res.status(error.code === 'UNAUTHORIZED' ? 401 : 400).json({ error: error.code }); return; }
    next(error);
  });
  return r;
}
