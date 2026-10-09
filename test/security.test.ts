import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createApp } from '../src/app.js';
import { readConfig, SCOPES } from '../src/config.js';
import { Edworking, ApiError } from '../src/edworking.js';
import { Store } from '../src/store.js';
import { Vault, random, challenge } from '../src/crypto.js';
import { Clients, fetchClientDocument, validRedirect } from '../src/clients.js';
import { executeTool, toolSpecs } from '../src/tools.js';

const pat = `edw_pat_${'x'.repeat(43)}`;
const info = { id: 'token-A', name: 'My assistant', userId: 'user-A', teamId: 'team-A', scopes: [...SCOPES], expiresAt: new Date(Date.now() + 86400_000).toISOString() };
class FakeApi extends Edworking {
  calls: { token: string; query: string; variables: Record<string, unknown> }[] = [];
  revoked = false; failure = false;
  identity = { ...info, scopes: [...info.scopes] };
  constructor() { super('https://unused.example/'); }
  override async tokenInfo(token: string) { if (this.revoked || token !== pat) throw new ApiError('UNAUTHORIZED', 'Revoked'); return { ...this.identity }; }
  override async execute<T>(token: string, query: string, variables: Record<string, unknown> = {}): Promise<T> {
    this.calls.push({ token, query, variables });
    if (this.failure) throw new ApiError('UPSTREAM_UNAVAILABLE', 'Lost response');
    return { apiProjects: [{ id: 'project-A', name: 'Launch' }], apiCreateTask: { id: 'task-A', name: variables.name, projectId: 'project-A' } } as T;
  }
}
function fixture(path = ':memory:') {
  const config = readConfig({ NODE_ENV: 'test', PUBLIC_BASE_URL: 'http://localhost:3000', TOKEN_ENCRYPTION_KEY: 'a'.repeat(64), DATABASE_PATH: path });
  const store = new Store(path), api = new FakeApi();
  return { ...createApp(config, store, api), config, store, api };
}
async function begin(f: ReturnType<typeof fixture>, scope = 'projects:read tasks:read tasks:write') {
  const client = (await request(f.app).post('/oauth/register').send({ client_name: '<script>client</script>', redirect_uris: ['https://client.example/callback'], token_endpoint_auth_method: 'none' }).expect(201)).body;
  const browser = request.agent(f.app), verifier = random();
  const params = { response_type: 'code', client_id: client.client_id, redirect_uri: client.redirect_uris[0], code_challenge_method: 'S256', code_challenge: challenge(verifier), scope, resource: f.config.resource, state: 'client-state' };
  const response = await browser.get('/oauth/authorize').query(params).expect(303);
  const id = new URL(response.headers.location, f.config.origin).searchParams.get('request')!;
  const page = await browser.get(response.headers.location).expect(200);
  assert.ok(!page.text.includes('<script>client</script>'));
  const policy = page.headers['content-security-policy'];
  assert.match(policy, /(?:^|;)form-action 'self' https:\/\/client\.example(?:;|$)/);
  assert.match(policy, /(?:^|;)default-src 'none'(?:;|$)/);
  const csrf = page.text.match(/name="csrf" value="([^"]+)"/)![1];
  return { client, browser, verifier, params, id, csrf };
}
async function authorize(f: ReturnType<typeof fixture>, scope?: string) {
  const b = await begin(f, scope);
  await b.browser.post('/oauth/link-token').set('Origin', f.config.origin).type('form').send({ request: b.id, csrf: b.csrf, api_token: pat }).expect(303);
  const consent = await b.browser.get(`/oauth/consent?request=${b.id}`).expect(200);
  assert.ok(consent.text.includes('Review access')); assert.ok(!consent.text.includes(pat));
  const approved = await b.browser.post('/oauth/approve').set('Origin', f.config.origin).type('form').send({ request: b.id, csrf: b.csrf, decision: 'approve' }).expect(303);
  const url = new URL(approved.headers.location);
  assert.equal(url.searchParams.get('state'), 'client-state'); assert.equal(url.searchParams.get('iss'), f.config.origin);
  const body = { grant_type: 'authorization_code', client_id: b.client.client_id, resource: f.config.resource, redirect_uri: b.params.redirect_uri, code: url.searchParams.get('code'), code_verifier: b.verifier };
  return { ...b, body };
}
test('OAuth enforces PKCE, exact redirects, resource audience, browser binding and CSRF', async t => {
  const f = fixture(); t.after(() => f.store.close()); const b = await begin(f);
  for (const extra of [{ redirect_uri: 'https://client.example/evil' }, { code_challenge_method: 'plain' }, { resource: 'https://elsewhere.example/mcp' }]) await request(f.app).get('/oauth/authorize').query({ ...b.params, ...extra }).expect(400);
  await request(f.app).get(`/oauth/consent?request=${b.id}`).expect(400);
  await b.browser.post('/oauth/link-token').set('Origin', f.config.origin).type('form').send({ request: b.id, csrf: 'wrong', api_token: pat }).expect(400);
  await b.browser.post('/oauth/link-token').set('Origin', 'https://evil.example').type('form').send({ request: b.id, csrf: b.csrf, api_token: pat }).expect(403);
  await request(f.app).post('/mcp').send({}).expect(401).expect('WWW-Authenticate', /oauth-protected-resource\/mcp/);
});
test('authorization codes and refresh tokens are single-use; replay revokes the family', async t => {
  const f = fixture(); t.after(() => f.store.close()); const a = await authorize(f);
  await request(f.app).post('/oauth/token').type('form').send({ ...a.body, code_verifier: random() }).expect(400);
  await request(f.app).post('/oauth/token').type('form').send({ ...a.body, resource: 'https://other.example' }).expect(400);
  const tokens = (await request(f.app).post('/oauth/token').type('form').send(a.body).expect(200)).body;
  assert.equal(f.oauth.authenticate(tokens.access_token).upstream, pat);
  assert.ok(!JSON.stringify(tokens).includes(pat));
  const refresh = { grant_type: 'refresh_token', client_id: a.client.client_id, resource: f.config.resource, refresh_token: tokens.refresh_token };
  await request(f.app).post('/oauth/token').type('form').send({ ...refresh, scope: 'messages:write' }).expect(400);
  const next = (await request(f.app).post('/oauth/token').type('form').send(refresh).expect(200)).body;
  assert.notEqual(next.refresh_token, tokens.refresh_token);
  await request(f.app).post('/oauth/token').type('form').send(refresh).expect(400);
  assert.throws(() => f.oauth.authenticate(next.access_token));
});
test('code replay, explicit revocation and upstream revocation block access', async t => {
  const f = fixture(); t.after(() => f.store.close());
  for (const reason of ['code', 'revoke', 'upstream']) {
    const a = await authorize(f), tokens = (await request(f.app).post('/oauth/token').type('form').send(a.body).expect(200)).body;
    if (reason === 'code') await request(f.app).post('/oauth/token').type('form').send(a.body).expect(400);
    if (reason === 'revoke') await request(f.app).post('/oauth/revoke').send({ client_id: a.client.client_id, token: tokens.refresh_token }).expect(200);
    if (reason === 'upstream') f.api.revoked = true;
    await request(f.app).post('/mcp').set('Authorization', `Bearer ${tokens.access_token}`).send({}).expect(401);
  }
});
test('refresh revokes grants when upstream token, owner, workspace or permissions change', async t => {
  for (const changed of [{ id: 'token-B' }, { userId: 'user-B' }, { teamId: 'team-B' }, { scopes: ['projects:read'] }]) {
    const f = fixture(); t.after(() => f.store.close());
    const a = await authorize(f), tokens = (await request(f.app).post('/oauth/token').type('form').send(a.body).expect(200)).body;
    Object.assign(f.api.identity, changed);
    await request(f.app).post('/oauth/token').type('form').send({ grant_type: 'refresh_token', client_id: a.client.client_id, resource: f.config.resource, refresh_token: tokens.refresh_token }).expect(400);
    assert.throws(() => f.oauth.authenticate(tokens.access_token));
  }
});
test('unconfigured native handoff is unavailable and OAuth cancellation preserves state', async t => {
  const f = fixture(); t.after(() => f.store.close());
  await request(f.app).get('/oauth/request').expect(404);
  await request(f.app).post('/oauth/link').send({}).expect(404);
  const b = await begin(f);
  const denied = await b.browser.post('/oauth/approve').set('Origin', f.config.origin).type('form').send({ request: b.id, csrf: b.csrf, decision: 'deny' }).expect(303);
  const callback = new URL(denied.headers.location);
  assert.equal(callback.origin, 'https://client.example');
  assert.equal(callback.searchParams.get('error'), 'access_denied');
  assert.equal(callback.searchParams.get('state'), 'client-state');
  await b.browser.get(`/oauth/consent?request=${b.id}`).expect(400);
});
test('SQLite survives restarts, excludes raw credentials, enforces expiry and rolls back', async t => {
  const folder = mkdtempSync(join(tmpdir(), 'bellsprout-')), path = join(folder, 'data.sqlite');
  t.after(() => rmSync(folder, { recursive: true, force: true }));
  const f = fixture(path); const a = await authorize(f); const tokens = (await request(f.app).post('/oauth/token').type('form').send(a.body).expect(200)).body;
  f.store.set('test', 'expired', { x: 1 }, Date.now() - 1); assert.equal(f.store.get('test', 'expired'), undefined);
  assert.throws(() => f.store.transaction(() => { f.store.set('test', 'rollback', 1, Date.now() + 10000); throw new Error('rollback'); }));
  assert.equal(f.store.get('test', 'rollback'), undefined); f.store.close();
  const content = readFileSync(path).toString('utf8'); for (const secret of [pat, tokens.access_token, tokens.refresh_token]) assert.ok(!content.includes(secret));
  const g = fixture(path); try { assert.equal(g.oauth.authenticate(tokens.access_token).grant.info.teamId, 'team-A'); } finally { g.store.close(); }
});
test('MCP SDK handshake, tool discovery, calls, scope denial and per-request identity work', async t => {
  const f = fixture(); t.after(() => f.store.close()); const a = await authorize(f, 'projects:read');
  const tokens = (await request(f.app).post('/oauth/token').type('form').send(a.body).expect(200)).body;
  const server = f.app.listen(0, '127.0.0.1'); await new Promise<void>(r => server.once('listening', r));
  t.after(() => new Promise<void>(r => server.close(() => r())));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const client = new Client({ name: 'security-test', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${address.port}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${tokens.access_token}` } } }));
  t.after(() => client.close());
  const tools = await client.listTools(); assert.equal(tools.tools.length, 15);
  const read = await client.callTool({ name: 'list_projects', arguments: { limit: 1 } });
  assert.deepEqual(read.structuredContent, { items: [{ id: 'project-A', name: 'Launch', url: 'https://app.edworking.com/project-A/tasks' }], nextCursor: 'project-A' });
  assert.equal(f.api.calls[0]?.token, pat);
  const denied = await client.callTool({ name: 'send_message', arguments: { requestId: 'ec00dccf-0e62-45cd-834f-72bd7805e6a1', chat: { id: 'chat-A', kind: 'privat' }, body: 'Do not send' } });
  assert.equal(denied.isError, true); assert.equal(f.api.calls.length, 1);
  const invalid = await client.callTool({ name: 'list_projects', arguments: { limit: 101 } }); assert.equal(invalid.isError, true);
  await client.close();
});
test('write retry returns encrypted cached result; changed arguments and uncertain writes never repeat', async t => {
  const f = fixture(); t.after(() => f.store.close()); const a = await authorize(f); const tokens = (await request(f.app).post('/oauth/token').type('form').send(a.body).expect(200)).body;
  const context = { api: f.api, identity: f.oauth.authenticate(tokens.access_token), store: f.store, config: f.config, vault: new Vault(f.config.encryptionKey) };
  const spec = toolSpecs.find(s => s.name === 'create_task')!, args = { requestId: 'b4010006-83e7-4128-8e2a-429890dafcff', name: 'Private task name', projectId: 'project-A' };
  const result = await executeTool(spec, args, context); assert.deepEqual(await executeTool(spec, args, context), result); assert.equal(f.api.calls.length, 1);
  await assert.rejects(executeTool(spec, { ...args, name: 'Changed' }, context), /different arguments/);
  f.api.failure = true; const failed = { ...args, requestId: '25ab5707-2d9b-4b99-92ab-ce413ea46b1b' };
  await assert.rejects(executeTool(spec, failed, context), /Lost response/);
  await assert.rejects(executeTool(spec, failed, context), /uncertain/); assert.equal(f.api.calls.length, 2);
  await assert.rejects(executeTool(spec, { ...args, fileIds: ['file-A'] }, context), /files:write/);
});
test('client registration, CIMD identity and public-address checks reject unsafe metadata', async t => {
  const store = new Store(':memory:'); t.after(() => store.close());
  for (const uri of ['javascript:alert(1)', 'https://user:password@example.com/cb', 'https://example.com/cb#fragment', 'http://example.com/cb', 'https://example.com;style-src/cb']) assert.equal(validRedirect(uri), false);
  assert.equal(validRedirect('http://127.0.0.1:8912/callback'), true);
  const clients = new Clients(store, async () => ({ client_id: 'https://wrong.example/metadata.json', redirect_uris: ['https://client.example/cb'] }));
  await assert.rejects(clients.get('https://client.example/metadata.json'));
  for (const uri of ['http://example.com/client.json', 'https://127.0.0.1/client.json', 'https://169.254.169.254/client.json']) await assert.rejects(fetchClientDocument(uri));
  assert.throws(() => clients.register({ redirect_uris: ['https://client.example/cb'], token_endpoint_auth_method: 'client_secret_basic' }));
});
test('AES-GCM detects tampering and upstream errors never include private response text', async () => {
  const vault = new Vault('a'.repeat(64)), sealed = vault.seal(pat); assert.equal(vault.open(sealed), pat);
  assert.throws(() => new Vault('b'.repeat(64)).open(sealed));
  const fake = (async () => new Response(JSON.stringify({ errors: [{ message: 'SECRET-DATABASE-DETAIL', extensions: { code: 'FORBIDDEN' } }] }))) as typeof fetch;
  await assert.rejects(new Edworking('https://unused.example', fake).execute(pat, 'query { x }'), e => e instanceof ApiError && e.code === 'UNAUTHORIZED' && !e.message.includes('SECRET'));
});
