import express, { type Request, type Response, type NextFunction } from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import type { Config } from './config.js';
import { READ_SCOPES } from './config.js';
import { Store } from './store.js';
import { Vault } from './crypto.js';
import { Edworking, ApiError } from './edworking.js';
import { OAuth, OAuthError } from './oauth.js';
import { createMcp, toolSpecs } from './tools.js';
import { landing, privacy, terms } from './pages.js';

export function createApp(config: Config, store: Store, api = new Edworking(config.apiUrl)) {
  const app = express(), vault = new Vault(config.encryptionKey), oauth = new OAuth(config, store, vault, api);
  app.disable('x-powered-by');
  // Railway appends the client address at its trusted edge. One service replica is required for this SQLite deployment.
  if (config.production) app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], styleSrc: ["'unsafe-inline'"], imgSrc: ["'self'"], formAction: ["'self'"], frameAncestors: ["'none'"], baseUri: ["'none'"], upgradeInsecureRequests: config.production ? [] : null } }, referrerPolicy: { policy: 'same-origin' } }));
  app.get('/healthz', (_req, res) => res.json({ status: 'ok', service: 'bellsprout' }));
  app.get('/readyz', (_req, res) => { try { res.status(store.healthy() ? 200 : 503).json({ status: 'ready' }); } catch { res.status(503).json({ status: 'unavailable' }); } });
  app.use((req, res, next) => {
    if (req.path.startsWith('/oauth') || req.path === '/mcp') res.set('Cache-Control', 'no-store');
    const origin = req.get('origin');
    if (origin) {
      if (!config.allowedOrigins.includes(origin)) { res.status(403).json({ error: 'origin_not_allowed' }); return; }
      res.set('Access-Control-Allow-Origin', origin).set('Vary', 'Origin').set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS').set('Access-Control-Allow-Headers', 'Content-Type, Authorization, MCP-Protocol-Version, MCP-Session-Id, Last-Event-ID').set('Access-Control-Expose-Headers', 'WWW-Authenticate, MCP-Session-Id, MCP-Protocol-Version');
    }
    if (req.method === 'OPTIONS') { res.status(204).end(); return; }
    next();
  });
  app.use(express.json({ limit: '256kb' })); app.use(express.urlencoded({ extended: false, limit: '16kb' })); app.use(cookieParser());
  app.use(oauth.router);
  app.get('/', (_req, res) => res.type('html').send(landing(config)));
  app.get('/privacy', (_req, res) => res.type('html').send(privacy()));
  app.get('/terms', (_req, res) => res.type('html').send(terms()));
  app.get('/.well-known/openai-apps-challenge', (_req, res) => { if (config.challenge) res.type('text/plain').send(config.challenge); else res.status(404).end(); });
  app.get('/.well-known/mcp/server-card.json', (_req, res) => res.json({ serverInfo: { name: 'edworking-mcp', title: 'Edworking MCP', version: '0.1.4' }, authentication: { required: true, schemes: ['oauth2'] }, tools: toolSpecs.map(s => ({ name: s.name, description: s.description, inputSchema: z.toJSONSchema(s.schema), annotations: { readOnlyHint: !s.write, destructiveHint: !!s.destructive, openWorldHint: !!s.openWorld } })), prompts: [], resources: [] }));
  const challengeHeader = (error?: string) => `Bearer resource_metadata="${config.origin}/.well-known/oauth-protected-resource/mcp", scope="${READ_SCOPES.join(' ')}"${error ? `, error="${error}"` : ''}`;
  app.all('/mcp', rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false }), async (req, res) => {
    const authorization = req.get('authorization');
    if (!authorization?.startsWith('Bearer ')) { res.set('WWW-Authenticate', challengeHeader()).status(401).json({ error: 'unauthorized' }); return; }
    let identity;
    try {
      identity = oauth.authenticate(authorization.slice(7));
      const current = await api.tokenInfo(identity.upstream);
      if (current.id !== identity.grant.info.id || current.userId !== identity.grant.info.userId || current.teamId !== identity.grant.info.teamId || identity.scopes.some(s => !current.scopes.includes(s))) throw new ApiError('UNAUTHORIZED', 'The connection changed.');
    } catch (e) {
      if (e instanceof OAuthError || e instanceof ApiError && e.code === 'UNAUTHORIZED') {
        if (identity) oauth.revokeGrant(identity.grant.id);
        res.set('WWW-Authenticate', challengeHeader('invalid_token')).status(401).json({ error: 'invalid_token' });
      } else res.status(503).json({ error: 'temporarily_unavailable' });
      return;
    }
    if (req.method !== 'POST') { res.set('Allow', 'POST').status(405).json({ error: 'method_not_allowed' }); return; }
    const server = createMcp({ api, identity, config, store, vault });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => { void transport.close().catch(() => undefined); void server.close().catch(() => undefined); });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });
  app.use((_req, res) => res.status(404).json({ error: 'not_found' }));
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (res.headersSent) { res.end(); return; }
    const status = typeof error === 'object' && error && 'status' in error && [400, 413].includes(Number(error.status)) ? Number(error.status) : 500;
    console.error(JSON.stringify({ event: 'request_failed', status }));
    res.status(status).json({ error: status === 500 ? 'internal_error' : 'invalid_request' });
  });
  return { app, oauth };
}
