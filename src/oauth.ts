import { Router, type Request, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import type { Config } from './config.js';
import { SCOPES, READ_SCOPES } from './config.js';
import { Store } from './store.js';
import { Clients } from './clients.js';
import { Edworking, ApiError, type TokenInfo } from './edworking.js';
import { Vault, hash, random, equal, challenge } from './crypto.js';
import { consent, page } from './pages.js';

export class OAuthError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}
interface Pending {
  id: string; csrf: string; browser: string; linkNonce: string; clientId: string; clientName: string;
  redirect: string; scopes: string[]; state?: string; challenge: string; expires: number;
  upstream?: string; info?: TokenInfo;
}
export interface Grant { id: string; clientId: string; scopes: string[]; resource: string; upstream: string; info: TokenInfo; expires: number; revoked?: boolean; }
interface Credential { grantId: string; clientId: string; resource: string; scopes: string[]; expires: number; used?: boolean; }
interface Code extends Credential { challenge: string; redirect: string; }
export interface Identity { grant: Grant; scopes: string[]; upstream: string; }
const asString = (value: unknown) => typeof value === 'string' ? value : '';
const deny = (message = 'Invalid or expired authorization') => new OAuthError('invalid_grant', message);
const opaque = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export function parseScopes(value: unknown): string[] {
  const scopes = asString(value).split(' ').filter(Boolean);
  if (!scopes.length || scopes.some(s => !SCOPES.includes(s as typeof SCOPES[number]))) throw new OAuthError('invalid_scope', 'Choose supported Edworking permissions.');
  return [...new Set(scopes)];
}
export class OAuth {
  readonly router = Router();
  readonly clients: Clients;
  private cookie: string;
  constructor(readonly config: Config, readonly store: Store, readonly vault: Vault, readonly api: Edworking, clients?: Clients) {
    this.clients = clients || new Clients(store); this.cookie = config.production ? '__Host-bellsprout_session' : 'bellsprout_session';
    this.routes();
  }
  private pending(id: string): Pending {
    const pending = this.store.get<Pending>('pending', id);
    if (!pending) throw deny('This connection request has expired. Start again from your assistant.');
    return pending;
  }
  private browser(req: Request, pending: Pending, csrf = false) {
    if (!equal(hash(asString(req.cookies?.[this.cookie])), pending.browser)) throw deny('Use the browser that started this connection.');
    if (csrf && (req.get('origin') !== this.config.origin || !equal(asString(req.body.csrf), pending.csrf))) throw deny('Invalid connection form. Start again from your assistant.');
  }
  private view(p: Pending, error?: string) {
    return consent(this.config, { ...p, name: p.info?.name, expiresAt: p.info?.expiresAt }, error);
  }
  private async link(p: Pending, token: string) {
    const info = await this.api.tokenInfo(token);
    if (p.scopes.some(scope => !info.scopes.includes(scope))) throw new OAuthError('invalid_scope', 'The Edworking token does not include all requested permissions. Create a token with the permissions shown above.');
    // An async upstream validation must not resurrect a consumed/expired request.
    const current = this.pending(p.id);
    if (current.upstream) throw deny('This request is already linked. Review or restart the connection.');
    this.store.set('pending', p.id, { ...current, info, upstream: this.vault.seal(token) }, p.expires);
  }
  authenticate(token: string): Identity {
    if (!/^bsp_at_[A-Za-z0-9_-]{43}$/.test(token)) throw new OAuthError('invalid_token', 'A Bellsprout access token is required.', 401);
    const record = this.store.get<Credential>('access', hash(token));
    const grant = record && this.store.get<Grant>('grant', record.grantId);
    if (!record || !grant || grant.revoked || record.resource !== this.config.resource || grant.resource !== this.config.resource || record.clientId !== grant.clientId) throw new OAuthError('invalid_token', 'Reconnect Edworking to continue.', 401);
    return { grant, scopes: record.scopes, upstream: this.vault.open(grant.upstream) };
  }
  revokeGrant(id: string) {
    const grant = this.store.get<Grant>('grant', id);
    if (grant) this.store.set('grant', id, { ...grant, revoked: true, upstream: '' }, grant.expires);
  }
  private tokens(grant: Grant, scopes: string[]) {
    const access = `bsp_at_${random()}`, refresh = `bsp_rt_${random()}`;
    const seconds = Math.max(1, Math.min(600, Math.floor((grant.expires - Date.now()) / 1000)));
    const common = { grantId: grant.id, clientId: grant.clientId, resource: grant.resource, scopes };
    this.store.set('access', hash(access), { ...common, expires: Date.now() + seconds * 1000 }, Date.now() + seconds * 1000);
    this.store.set('refresh', hash(refresh), { ...common, expires: grant.expires }, grant.expires);
    return { access_token: access, token_type: 'Bearer', expires_in: seconds, refresh_token: refresh, scope: scopes.join(' ') };
  }
  private routes() {
    const r = this.router, config = this.config;
    const budget = (limit: number) => rateLimit({ windowMs: 60_000, limit, standardHeaders: 'draft-8', legacyHeaders: false });
    r.use('/oauth', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
    r.get('/.well-known/oauth-authorization-server', (_req, res) => res.json({
      issuer: config.origin, authorization_endpoint: `${config.origin}/oauth/authorize`, token_endpoint: `${config.origin}/oauth/token`,
      registration_endpoint: `${config.origin}/oauth/register`, revocation_endpoint: `${config.origin}/oauth/revoke`,
      response_types_supported: ['code'], grant_types_supported: ['authorization_code', 'refresh_token'],
      token_endpoint_auth_methods_supported: ['none'], revocation_endpoint_auth_methods_supported: ['none'],
      code_challenge_methods_supported: ['S256'], scopes_supported: SCOPES,
      client_id_metadata_document_supported: true, authorization_response_iss_parameter_supported: true,
    }));
    const resourceMetadata = (_req: Request, res: Response) => res.json({ resource: config.resource, resource_name: 'Edworking — Bellsprout', authorization_servers: [config.origin], scopes_supported: READ_SCOPES, bearer_methods_supported: ['header'], resource_documentation: `${config.origin}/`, resource_policy_uri: `${config.origin}/privacy`, resource_tos_uri: `${config.origin}/terms` });
    r.get('/.well-known/oauth-protected-resource', resourceMetadata);
    r.get('/.well-known/oauth-protected-resource/mcp', resourceMetadata);
    r.post('/oauth/register', budget(10), (req, res) => {
      try { res.status(201).json(this.clients.register(req.body)); }
      catch { throw new OAuthError('invalid_client_metadata', 'Use authorization_code, PKCE, public client authentication (none), and exact HTTPS or loopback redirect URIs.'); }
    });
    r.get('/oauth/authorize', budget(20), async (req, res) => {
      let client;
      try { client = await this.clients.get(asString(req.query.client_id)); }
      catch { throw new OAuthError('invalid_client', 'Unable to validate the OAuth client.'); }
      if (!client) throw new OAuthError('invalid_client', 'Register the OAuth client first.');
      const redirect = asString(req.query.redirect_uri);
      if (!client.redirect_uris.includes(redirect)) throw new OAuthError('invalid_request', 'The redirect URI does not exactly match the client registration.');
      if (req.query.response_type !== 'code' || req.query.code_challenge_method !== 'S256' || !opaque.safeParse(req.query.code_challenge).success) throw new OAuthError('invalid_request', 'Authorization code flow with PKCE S256 is required.');
      if (req.query.resource !== config.resource) throw new OAuthError('invalid_target', 'Use the Bellsprout MCP resource URL.');
      if (req.query.state !== undefined && (typeof req.query.state !== 'string' || req.query.state.length > 2048)) throw new OAuthError('invalid_request', 'Invalid state.');
      const scopes = req.query.scope === undefined ? [...READ_SCOPES] : parseScopes(req.query.scope);
      const session = random(), id = random(), expires = Date.now() + 600_000;
      const p: Pending = { id, csrf: random(), browser: hash(session), linkNonce: random(), clientId: client.client_id, clientName: client.client_name, redirect, scopes, state: req.query.state as string | undefined, challenge: asString(req.query.code_challenge), expires };
      this.store.set('pending', id, p, expires);
      res.cookie(this.cookie, session, { httpOnly: true, secure: config.production, sameSite: 'lax', maxAge: 600_000, path: '/' });
      res.redirect(303, `/oauth/consent?request=${id}`);
    });
    r.get('/oauth/consent', (req, res) => { const p = this.pending(asString(req.query.request)); this.browser(req, p); res.type('html').send(this.view(p)); });
    r.post('/oauth/link-token', budget(10), async (req, res) => {
      const p = this.pending(asString(req.body.request)); this.browser(req, p, true);
      try { await this.link(p, asString(req.body.api_token)); res.redirect(303, `/oauth/consent?request=${p.id}`); }
      catch (e) { if (e instanceof ApiError || e instanceof OAuthError) res.status(400).type('html').send(this.view(p, e.message)); else throw e; }
    });
    // Native Edworking connection UI uses a one-use capability; final consent remains bound to this browser.
    r.get('/oauth/request', budget(30), (req, res) => {
      const p = this.pending(asString(req.query.request));
      if (!equal(asString(req.query.nonce), p.linkNonce)) throw deny();
      res.json({ clientName: p.clientName, redirectOrigin: new URL(p.redirect).origin, scopes: p.scopes, expiresAt: new Date(p.expires).toISOString() });
    });
    r.post('/oauth/link', budget(10), async (req, res) => {
      if (req.get('origin') !== new URL(config.appUrl).origin) throw deny();
      const p = this.pending(asString(req.body.request));
      if (!equal(asString(req.body.nonce), p.linkNonce)) throw deny();
      await this.link(p, asString(req.body.apiToken));
      res.json({ continueUrl: `${config.origin}/oauth/consent?request=${p.id}` });
    });
    r.post('/oauth/approve', budget(20), (req, res) => {
      const p = this.pending(asString(req.body.request)); this.browser(req, p, true);
      const url = new URL(p.redirect); url.searchParams.set('iss', config.origin); if (p.state !== undefined) url.searchParams.set('state', p.state);
      if (req.body.decision === 'deny') { this.store.remove('pending', p.id); url.searchParams.set('error', 'access_denied'); res.redirect(303, url.href); return; }
      if (req.body.decision !== 'approve' || !p.upstream || !p.info) throw deny('Connect your Edworking workspace first.');
      const grant: Grant = { id: random(), clientId: p.clientId, scopes: p.scopes, resource: config.resource, upstream: p.upstream, info: p.info, expires: Math.min(Date.parse(p.info.expiresAt), Date.now() + 30 * 86400_000) };
      const code = random();
      this.store.transaction(() => {
        this.pending(p.id); this.store.remove('pending', p.id);
        this.store.set('grant', grant.id, grant, grant.expires);
        this.store.set('code', hash(code), { grantId: grant.id, clientId: p.clientId, resource: config.resource, scopes: p.scopes, challenge: p.challenge, redirect: p.redirect, expires: Date.now() + 60_000 }, Date.now() + 600_000);
      });
      res.clearCookie(this.cookie, { path: '/', httpOnly: true, secure: config.production, sameSite: 'lax' });
      url.searchParams.set('code', code); res.redirect(303, url.href);
    });
    r.post('/oauth/token', budget(60), async (req, res) => {
      const clientId = asString(req.body.client_id), resource = asString(req.body.resource);
      if (!clientId || req.get('authorization') || req.body.client_secret) throw new OAuthError('invalid_client', 'This server uses public clients with PKCE.', 401);
      if (resource !== config.resource) throw new OAuthError('invalid_target', 'The MCP resource must match the authorization request.');
      const isCode = req.body.grant_type === 'authorization_code';
      if (!isCode && req.body.grant_type !== 'refresh_token') throw new OAuthError('unsupported_grant_type', 'Use authorization_code or refresh_token.');
      const kind = isCode ? 'code' : 'refresh', secret = asString(isCode ? req.body.code : req.body.refresh_token), key = hash(secret);
      const record = this.store.get<Code>(kind, key);
      if (!record || record.clientId !== clientId || record.resource !== resource) throw deny();
      if (isCode && (!/^[A-Za-z0-9._~-]{43,128}$/.test(asString(req.body.code_verifier)) || !equal(challenge(asString(req.body.code_verifier)), record.challenge) || req.body.redirect_uri !== record.redirect)) throw deny();
      if (record.used) { this.revokeGrant(record.grantId); throw deny('Credential reuse detected. Reconnect Edworking.'); }
      const grant = this.store.get<Grant>('grant', record.grantId);
      if (!grant || grant.revoked || record.expires <= Date.now()) throw deny();
      const scopes = !isCode && req.body.scope !== undefined ? parseScopes(req.body.scope) : record.scopes;
      if (scopes.some(s => !record.scopes.includes(s))) throw new OAuthError('invalid_scope', 'Refresh cannot expand permissions.');
      // Verify current owner, workspace membership, revocation, and expiry before refreshing.
      if (!isCode) {
        try { await this.api.tokenInfo(this.vault.open(grant.upstream)); }
        catch (e) { if (e instanceof ApiError && e.code === 'UNAUTHORIZED') { this.revokeGrant(grant.id); throw deny('Edworking access was revoked.'); } throw new OAuthError('temporarily_unavailable', 'Edworking is unavailable. Try again later.', 503); }
      }
      let replay = false;
      const result = this.store.transaction(() => {
        const current = this.store.get<Credential>(kind, key);
        const latestGrant = this.store.get<Grant>('grant', grant.id);
        if (!current || !latestGrant || latestGrant.revoked || current.used || current.expires <= Date.now()) { if (current?.used) { this.revokeGrant(grant.id); replay = true; } return undefined; }
        this.store.set(kind, key, { ...record, used: true }, grant.expires);
        return this.tokens(latestGrant, scopes);
      });
      if (!result) throw deny(replay ? 'Credential reuse detected. Reconnect Edworking.' : undefined);
      res.json(result);
    });
    r.post('/oauth/revoke', budget(30), (req, res) => {
      const key = hash(asString(req.body.token));
      const record = this.store.get<Credential>('refresh', key) || this.store.get<Credential>('access', key);
      if (record && record.clientId === asString(req.body.client_id)) this.revokeGrant(record.grantId);
      res.status(200).end();
    });
    r.use((err: unknown, req: Request, res: Response, next: (e?: unknown) => void) => {
      if (!(err instanceof OAuthError)) return next(err);
      if (req.method === 'GET' && req.path.startsWith('/oauth/') && !req.path.endsWith('/request')) res.status(err.status).type('html').send(page('Connection unavailable', '<h1>Unable to connect</h1><p>This connection request is invalid or expired. Return to your assistant and start the connection again.</p>'));
      else res.status(err.status).json({ error: err.code, error_description: err.message });
    });
  }
}
