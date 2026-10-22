import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createConnection, createServer } from 'node:net';
import request from 'supertest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createApp } from '../src/app.js';
import { readConfig, SCOPES } from '../src/config.js';
import { Edworking, ApiError } from '../src/edworking.js';
import { Store } from '../src/store.js';
import { Vault, random, challenge, hash } from '../src/crypto.js';
import { Clients, fetchClientDocument, validRedirect, matchesRedirect, pinnedLookup } from '../src/clients.js';
import { executeTool, toolSpecs, pluginToolSpecs } from '../src/tools.js';

const pat = `edw_pat_${'x'.repeat(43)}`;
const info = { id: 'token-A', name: 'My assistant', userId: 'user-A', teamId: 'team-A', scopes: [...SCOPES], expiresAt: new Date(Date.now() + 86400_000).toISOString() };
class FakeApi extends Edworking {
  calls: { token: string; query: string; variables: Record<string, unknown> }[] = [];
  revoked = false; failure = false;
  identity = { ...info, scopes: [...info.scopes] };
  respond?: (query: string, variables: Record<string, unknown>) => Record<string, unknown>;
  constructor() { super('https://unused.example/'); }
  override async tokenInfo(token: string) { if (this.revoked || token !== pat) throw new ApiError('UNAUTHORIZED', 'Revoked'); return { ...this.identity }; }
  override async execute<T>(token: string, query: string, variables: Record<string, unknown> = {}): Promise<T> {
    this.calls.push({ token, query, variables });
    if (this.failure) throw new ApiError('UPSTREAM_UNAVAILABLE', 'Lost response');
    if (this.respond) return this.respond(query, variables) as T;
    return { apiProjects: [{ id: 'project-A', name: 'Launch' }], apiCreateTask: { id: 'task-A', name: variables.name, projectId: 'project-A' } } as T;
  }
}
function fixture(path = ':memory:') {
  const config = readConfig({ NODE_ENV: 'test', PUBLIC_BASE_URL: 'http://localhost:3000', TOKEN_ENCRYPTION_KEY: 'a'.repeat(64), DATABASE_PATH: path });
  const store = new Store(path), api = new FakeApi();
  return { ...createApp(config, store, api), config, store, api };
}
function callbackFromPage(response: { text: string; headers: Record<string, string> }) {
  assert.equal(response.headers.location, undefined);
  assert.match(response.headers['cache-control']!, /no-store/);
  assert.match(response.headers['content-type']!, /text\/html/);
  assert.match(response.headers['content-security-policy']!, /(?:^|;)form-action 'self'(?:;|$)/);
  const href = response.text.match(/<a class="button" href="([^"]+)" rel="noreferrer">Return to your assistant<\/a>/)![1]!;
  assert.ok(response.text.includes(`<meta http-equiv="refresh" content="0;url=${href}">`));
  assert.ok(!response.text.includes('<script'));
  return new URL(href.replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>'));
}
async function begin(f: ReturnType<typeof fixture>, scope = 'projects:read tasks:read tasks:write') {
  const client = (await request(f.app).post('/oauth/register').send({ client_name: '<script>client</script>', redirect_uris: ['https://client.example/callback'], token_endpoint_auth_method: 'none' }).expect(201)).body;
  const browser = request.agent(f.app), verifier = random();
  const params = { response_type: 'code', client_id: client.client_id, redirect_uri: client.redirect_uris[0], code_challenge_method: 'S256', code_challenge: challenge(verifier), scope, resource: f.config.resource, state: 'client-state' };
  const response = await browser.get('/oauth/authorize').query(params).expect(303);
  const id = new URL(response.headers.location, f.config.origin).searchParams.get('request')!;
  const page = await browser.get(response.headers.location).expect(200);
  assert.ok(!page.text.includes('<script>client</script>'));
  // no-referrer makes browsers send Origin:null for HTML form POSTs.
  assert.equal(page.headers['referrer-policy'], 'same-origin');
  assert.match(page.text, /name="referrer" content="same-origin"/);
  const policy = page.headers['content-security-policy'];
  assert.match(policy, /(?:^|;)form-action 'self'(?:;|$)/);
  assert.match(policy, /(?:^|;)default-src 'none'(?:;|$)/);
  const csrf = page.text.match(/name="csrf" value="([^"]+)"/)![1];
  return { client, browser, verifier, params, id, csrf };
}
async function authorize(f: ReturnType<typeof fixture>, scope?: string) {
  const b = await begin(f, scope);
  await b.browser.post('/oauth/link-token').set('Origin', f.config.origin).type('form').send({ request: b.id, csrf: b.csrf, api_token: pat }).expect(303);
  const consent = await b.browser.get(`/oauth/consent?request=${b.id}`).expect(200);
  assert.ok(consent.text.includes('Review access')); assert.ok(!consent.text.includes(pat));
  const approved = await b.browser.post('/oauth/approve').set('Origin', f.config.origin).type('form').send({ request: b.id, csrf: b.csrf, decision: 'approve' }).expect(200);
  const url = callbackFromPage(approved);
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
  await b.browser.post('/oauth/approve').set('Origin', 'null').type('form').send({ request: b.id, csrf: b.csrf, decision: 'deny' }).expect(403);
  await request(f.app).post('/mcp').send({}).expect(401).expect('WWW-Authenticate', /oauth-protected-resource\/mcp/);
});
test('native OAuth permits only an IP loopback port change and binds the code to that port', async t => {
  const f = fixture(); t.after(() => f.store.close());
  for (const host of ['127.0.0.1', '[::1]']) {
    const uri = `http://${host}/callback?client=edworking`;
    assert.equal(matchesRedirect(uri, `http://${host}:49152/callback?client=edworking`), true);
    for (const wrong of [`http://${host}:49152/other?client=edworking`, `http://${host}:49152/callback?client=other`, 'http://localhost:49152/callback?client=edworking', 'http://127.0.0.2:49152/callback?client=edworking', `http://${host}:49152/callback?client=edworking#x`]) assert.equal(matchesRedirect(uri, wrong), false);
  }
  assert.equal(matchesRedirect('https://client.example/callback', 'https://client.example:49152/callback'), false);
  assert.equal(matchesRedirect('http://localhost/callback', 'http://localhost:49152/callback'), false);
  const client = (await request(f.app).post('/oauth/register').send({ redirect_uris: ['http://127.0.0.1/callback'] }).expect(201)).body;
  const browser = request.agent(f.app), verifier = random(), redirect = 'http://127.0.0.1:49152/callback';
  const started = await browser.get('/oauth/authorize').query({ client_id: client.client_id, redirect_uri: redirect, response_type: 'code', code_challenge_method: 'S256', code_challenge: challenge(verifier), resource: f.config.resource, scope: 'tasks:read' }).expect(303);
  const id = new URL(started.headers.location, f.config.origin).searchParams.get('request');
  const consent = await browser.get(started.headers.location).expect(200), csrf = consent.text.match(/name="csrf" value="([^"]+)"/)![1];
  await browser.post('/oauth/link-token').set('Origin', f.config.origin).type('form').send({ request: id, csrf, api_token: pat }).expect(303);
  const approved = await browser.post('/oauth/approve').set('Origin', f.config.origin).type('form').send({ request: id, csrf, decision: 'approve' }).expect(200);
  const callback = callbackFromPage(approved); assert.equal(callback.port, '49152');
  const exchange = { grant_type: 'authorization_code', client_id: client.client_id, code: callback.searchParams.get('code'), code_verifier: verifier, resource: f.config.resource };
  await request(f.app).post('/oauth/token').type('form').send({ ...exchange, redirect_uri: 'http://127.0.0.1:49153/callback' }).expect(400);
  await request(f.app).post('/oauth/token').type('form').send({ ...exchange, redirect_uri: redirect }).expect(200);
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

test('consent handoff safely escapes state, keeps the registered callback and cannot mint twice', async t => {
  const f = fixture(); t.after(() => f.store.close());
  const b = await begin(f);
  const state = '"/><script>alert(1)</script>&next=https://evil.example';
  const started = await b.browser.get('/oauth/authorize').query({ ...b.params, state }).expect(303);
  const id = new URL(started.headers.location, f.config.origin).searchParams.get('request')!;
  const consent = await b.browser.get(started.headers.location).expect(200);
  const csrf = consent.text.match(/name="csrf" value="([^"]+)"/)![1];
  await b.browser.post('/oauth/link-token').set('Origin', f.config.origin).type('form').send({ request: id, csrf, api_token: pat }).expect(303);
  const form = { request: id, csrf, decision: 'approve', redirect_uri: 'https://evil.example/callback' };
  await b.browser.post('/oauth/approve').set('Origin', f.config.origin).type('form').send({ ...form, csrf: 'wrong' }).expect(400);
  const approved = await b.browser.post('/oauth/approve').set('Origin', f.config.origin).type('form').send(form).expect(200);
  const callback = callbackFromPage(approved);
  assert.equal(callback.origin + callback.pathname, b.params.redirect_uri);
  assert.equal(callback.searchParams.get('state'), state);
  assert.equal(callback.searchParams.get('iss'), f.config.origin);
  assert.ok(!approved.text.includes(pat));
  const repeated = await b.browser.post('/oauth/approve').set('Origin', f.config.origin).type('form').send(form).expect(400);
  assert.equal(repeated.body.error, 'invalid_grant');
  await request(f.app).post('/oauth/token').type('form').send({ grant_type: 'authorization_code', client_id: b.client.client_id, resource: f.config.resource, redirect_uri: b.params.redirect_uri, code: callback.searchParams.get('code'), code_verifier: b.verifier }).expect(200);
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
  const denied = await b.browser.post('/oauth/approve').set('Origin', f.config.origin).type('form').send({ request: b.id, csrf: b.csrf, decision: 'deny' }).expect(200);
  const callback = callbackFromPage(denied);
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
  const tools = await client.listTools(); assert.equal(tools.tools.length, 24);
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

test('CIMD negotiates the public PKCE method without accepting unsupported client authentication', async t => {
  const id = 'https://client.example/oauth/client.json';
  const doc = { client_id: id, client_name: 'ChatGPT-compatible client', redirect_uris: ['https://client.example/callback'], token_endpoint_auth_method: 'private_key_jwt', token_endpoint_auth_methods_supported: ['none', 'private_key_jwt'] };
  for (const [overrides, accepted] of [
    [{}, true],
    [{ token_endpoint_auth_methods_supported: ['private_key_jwt', 'none'] }, true],
    [{ token_endpoint_auth_method: 'none', token_endpoint_auth_methods_supported: undefined }, true],
    [{ token_endpoint_auth_methods_supported: undefined }, false],
    [{ token_endpoint_auth_method: 'none', token_endpoint_auth_methods_supported: ['private_key_jwt'] }, false],
    [{ token_endpoint_auth_methods_supported: [] }, false],
    [{ token_endpoint_auth_methods_supported: 'none' }, false],
    [{ client_id: 'https://wrong.example/client.json' }, false],
  ] as const) {
    const store = new Store(':memory:'); t.after(() => store.close());
    const clients = new Clients(store, async () => ({ ...doc, ...overrides }));
    if (accepted) assert.equal((await clients.get(id))?.token_endpoint_auth_method, 'none');
    else await assert.rejects(clients.get(id));
    assert.throws(() => clients.register(doc), 'DCR must still reject a requested unsupported authentication method');
  }
});

test('pinned DNS supports Node automatic address-family selection without a second DNS lookup', async t => {
  const server = createServer(socket => socket.end());
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  for (const autoSelectFamily of [true, false]) {
    const socket: import('node:net').Socket = createConnection({ host: 'must-not-resolve.invalid', port: address.port, autoSelectFamily, lookup: pinnedLookup({ address: '127.0.0.1', family: 4 }) });
    t.after(() => socket.destroy());
    await new Promise<void>((resolve, reject) => { socket.once('connect', resolve); socket.once('error', reject); });
    assert.equal(socket.remoteAddress, '127.0.0.1');
    socket.destroy();
  }
});


test('default upstream is the public gateway and production rejects cleartext upstreams', () => {
  const env = { TOKEN_ENCRYPTION_KEY: 'a'.repeat(64), NODE_ENV: 'production', PUBLIC_BASE_URL: 'https://mcp.edworking.com', DATABASE_PATH: '/data/test.sqlite' };
  assert.equal(readConfig(env).apiUrl, 'https://gateway.edworking.com/');
  assert.throws(() => readConfig({ ...env, EDWORKING_API_URL: 'http://gateway.edworking.com/' }), /HTTPS/);
});

test('all tools run through the MCP SDK, reject missing scopes and deduplicate writes', async t => {
  const f = fixture(); t.after(() => f.store.close());
  const a = await authorize(f, SCOPES.join(' '));
  const tokens = (await request(f.app).post('/oauth/token').type('form').send(a.body).expect(200)).body;
  const task = { id: 'task-A', name: 'QA task', projectId: 'project-A', deadline: null, users: [] };
  f.api.respond = (_query, args) => ({
    apiConnectionContext: {user:{id:'user-A'},workspace:{id:'team-A',name:'QA workspace'}}, apiDocFolders: [{id:'folder-A',name:'Specs'}], apiInsertFigmaDesign: {id:'task-A',inserted:true},
    apiProjects: [{ id: 'project-A', name: 'QA project' }], apiProjectStates: [{ id: 'state-A', value: 'Open' }],
    apiFigmaTasks: [task], apiLinkFigmaFrame: { id: "link-A", url: "https://www.figma.com/design/abcdef?node-id=1-2", title: "Frame" },
    apiTasks: [task], apiTask: task, apiPrivateChats: [{ id: 'chat-A', name: 'QA private chat' }],
    apiMessages: [{ id: 'message-A', body: 'QA message' }], apiFiles: [{ id: 'file-A', name: 'QA file' }],
    apiCreateTask: { ...task, name: args.name }, apiUpdateTask: { ...task, name: args.name ?? task.name, deadline: args.deadline },
    apiSendMessage: { id: 'message-B', body: args.body }, apiCreateProject: { id: 'project-B', name: args.name },
    apiUploadFile: { id: 'file-B', name: args.name },
    apiProjectMembers: [{ id: 'member-A', firstname: 'Demo' }],
    apiDocs: [{ id: 'doc-A', title: 'QA Doc', projectId: 'project-A' }],
    apiDoc: { id: 'doc-A', title: 'QA Doc', projectId: 'project-A', content: 'Body', contentTruncated: false },
    apiCreateDoc: { id: 'doc-B', title: args.title, projectId: 'project-A' },
    apiUpdateDoc: { id: 'doc-A', title: args.title, projectId: 'project-A' },
    apiEditContent: { id: args.id, kind: args.kind, content: 'Edited', changes: ['appended'] },
    apiSearch: { results: [{ id: 'task:task-A', type: 'task', title: 'QA task', snippet: 'Body', path: '/project-A/tasks/t/task-A' }], searchedSources: ['task'], unavailableSources: [], limitPerSource: 10, complete: false, note: 'Indexed' },
    apiFetch: { id: 'task:task-A', title: 'QA task', text: 'Body', path: '/project-A/tasks/t/task-A', type: 'task' },
  });
  const server = f.app.listen(0, '127.0.0.1'); await new Promise<void>(r => server.once('listening', r));
  t.after(() => new Promise<void>(r => server.close(() => r())));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const client = new Client({ name: 'all-tools-test', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL('http://127.0.0.1:' + address.port + '/mcp'), { requestInit: { headers: { Authorization: 'Bearer ' + tokens.access_token } } }));
  t.after(() => client.close());
  const action = 'a68a95be-8e0f-4c92-a99b-e9c9f5a51b73';
  const cases: Record<string, Record<string, unknown>> = {



    list_figma_tasks: { url: "https://www.figma.com/design/abcdef?node-id=1-2" },
    link_figma_frame: { requestId: action, taskId: "task-A", url: "https://www.figma.com/design/abcdef?node-id=1-2", title: "Frame" },
    get_connection: {}, list_projects: {}, list_project_statuses: { projectId: 'project-A' }, list_tasks: { projectId: 'project-A' },
    get_task: { id: 'task-A' }, list_conversations: {}, read_messages: { chat: { id: 'chat-A', kind: 'privat' } },
    list_files: { projectId: 'project-A' }, create_task: { requestId: action, projectId: 'project-A', name: 'QA new task' },
    update_task: { requestId: action, id: 'task-A', deadline: null }, send_message: { requestId: action, chat: { id: 'chat-A', kind: 'privat' }, body: 'QA send' },
    create_project: { requestId: action, name: 'QA new project' }, upload_file: { requestId: action, projectId: 'project-A', url: 'https://example.com/test.txt', name: 'QA upload' },
    search: { query: 'QA task' }, fetch: { id: 'task-A' },
    list_project_members: { projectId: 'project-A' }, list_docs: {}, get_doc: { id: 'doc-A' },
    create_doc: { requestId: action, projectId: 'project-A', title: 'QA Doc', content: 'Body' },
    update_doc: { requestId: action, id: 'doc-A', title: 'Updated Doc' },
    edit_doc_content: { requestId: action, id: 'doc-A', edits: [{ action: 'append', markdown: 'New paragraph' }] },
    edit_task_content: { requestId: action, id: 'task-A', edits: [{ action: 'replace_text', find: 'old', replace: 'new' }] },
  };
  const catalog = await client.listTools();
  assert.deepEqual(catalog.tools.map(x => x.name).sort(), Object.keys(cases).sort());
  const publicCard = (await request(f.app).get('/.well-known/mcp/server-card.json').expect(200)).body;
  for (const tool of catalog.tools) {
    assert.equal(tool.outputSchema?.type, 'object', tool.name + ' output contract');
    for (const field of Object.values(tool.inputSchema.properties ?? {})) {
      assert.equal(typeof (field as { description?: unknown }).description, 'string', tool.name + ' parameter guidance');
    }
    assert.deepEqual(publicCard.tools.find((x: { name: string }) => x.name === tool.name).outputSchema.properties, tool.outputSchema.properties, tool.name + ' public metadata parity');
  }
  for (const [name, args] of Object.entries(cases)) {
    const before = f.api.calls.length, result = await client.callTool({ name, arguments: args });
    assert.notEqual(result.isError, true, name);
    assert.ok(result.structuredContent, name);
    assert.ok(!JSON.stringify(result).includes(pat));
    if (name !== 'get_connection') assert.equal(f.api.calls.length, before + 1, name);
    if (toolSpecs.find(x => x.name === name)!.write) {
      const repeated = await client.callTool({ name, arguments: args });
      assert.deepEqual(repeated.structuredContent, result.structuredContent, name);
      assert.equal(f.api.calls.length, before + 1, name + ' retried upstream');
    }
  }
  for (const name of ['create_task', 'create_doc']) {
    const args = { requestId: 'bac4f7f7-a061-48ce-a787-3347f9b64276', projectId: 'project-A', ...(name === 'create_task' ? { name: 'Figma task' } : { title: 'Figma Doc' }), figmaDesigns: [{ url: 'https://www.figma.com/design/Abc123Abc123Abc123Abc123?node-id=1-2', name: 'Frame' }] };
    const before = f.api.calls.length, result = await client.callTool({ name, arguments: args });
    assert.notEqual(result.isError, true, name + ' Figma output contract');
    const figma = (result.structuredContent as Record<string, unknown>).figma as Record<string, unknown>;
    assert.equal(figma.resources, name === 'create_task' ? 'linked' : 'not_applicable');
    assert.equal(figma.backlinkCreated, false);
    assert.equal(f.api.calls.length, before + (name === 'create_task' ? 2 : 1));
    const variables = f.api.calls[before]!.variables;
    assert.equal(variables.content, '[figma: Frame](https://www.figma.com/design/Abc123Abc123Abc123Abc123?node-id=1-2)');
    if (name === 'create_task') {
      assert.equal(variables.assigneeIds, undefined, 'Omitted assignees default to the connected user upstream');
      for (const field of ['priority', 'startDate', 'deadline', 'stateProjectId', 'listId', 'fileIds']) assert.equal(variables[field], undefined, field + ' must not be invented');
    }
    const repeated = await client.callTool({ name, arguments: args });
    assert.deepEqual(repeated.structuredContent, result.structuredContent);
    assert.equal(f.api.calls.length, before + (name === 'create_task' ? 2 : 1));
  }
  assert.equal(f.api.calls.find(c => c.variables.name === 'QA new task')!.variables.assigneeIds, undefined, 'Ordinary creates retain the existing upstream default');
  const context = { api: f.api, identity: { ...f.oauth.authenticate(tokens.access_token), scopes: [] }, store: f.store, config: f.config, vault: new Vault(f.config.encryptionKey) };
  for (const spec of toolSpecs.filter(x => x.scopes.length)) {
    const before = f.api.calls.length;
    await assert.rejects(executeTool(spec, cases[spec.name]!, context), e => e instanceof ApiError && e.code === 'INSUFFICIENT_SCOPE', spec.name);
    assert.equal(f.api.calls.length, before, spec.name + ' bypassed scope checks');
  }
  for (const [name, args] of [
    ['list_tasks', { limit: 101 }], ['get_task', { id: '../other-workspace' }],
    ['read_messages', { chat: { id: 'chat-A', kind: 'invalid' } }],
    ['create_task', { requestId: action, projectId: 'project-A', name: '' }],
    ['update_task', { requestId: 'd1818b87-676d-443a-b02c-818d3d874a96', id: 'task-A' }],
    ['upload_file', { requestId: action, projectId: 'project-A', url: 'http://169.254.169.254/latest/meta-data/' }],
    ['upload_file', { requestId: action, projectId: 'project-A', url: 'https://user:secret@example.com/a' }],
  ] as const) {
    const before = f.api.calls.length;
    const result = await client.callTool({ name, arguments: args });
    assert.equal(result.isError, true, name); assert.equal(f.api.calls.length, before);
  }
  await client.close();
});

test('search limits sources to OAuth grants and typed fetch checks its own read scope', async t => {
  const f = fixture(); t.after(() => f.store.close());
  const a = await authorize(f, 'tasks:read'), tokens = (await request(f.app).post('/oauth/token').type('form').send(a.body).expect(200)).body;
  f.api.respond = () => ({ apiSearch: { results: [], searchedSources: ['task'], unavailableSources: ['task'], limitPerSource: 10, complete: false, note: 'Unavailable' } });
  const context = { api: f.api, identity: f.oauth.authenticate(tokens.access_token), store: f.store, config: f.config, vault: new Vault(f.config.encryptionKey) };
  const spec = toolSpecs.find(x => x.name === 'search')!;
  const result = await executeTool(spec, { query: 'matching' }, context);
  assert.deepEqual(f.api.calls[0]!.variables.types, ['task']);
  assert.deepEqual((result.coverage as Record<string, unknown>).unavailableSources, ['task']);
  for (const [name, args] of [['search', { query: 'secret', types: ['doc'] }], ['fetch', { id: 'doc:doc-A' }]] as const) {
    await assert.rejects(executeTool(toolSpecs.find(x => x.name === name)!, args, context), e => e instanceof ApiError && e.code === 'INSUFFICIENT_SCOPE');
  }
  assert.equal(f.api.calls.length, 1);
  assert.equal(toolSpecs.find(x => x.name === 'fetch')!.schema.safeParse({ id: 'doc:../escape' }).success, false);
});

test('rich task edits preserve explicit nulls and empty assignees, and content tools enforce bounded edits', async t => {
  const f = fixture(); t.after(() => f.store.close());
  const a = await authorize(f, 'tasks:write docs:write'), tokens = (await request(f.app).post('/oauth/token').type('form').send(a.body).expect(200)).body;
  f.api.respond = () => ({ apiUpdateTask: { id: 'task-A', name: 'Task' }, apiEditContent: { id: 'doc-A', content: 'new', changes: ['edited'] } });
  const context = { api: f.api, identity: f.oauth.authenticate(tokens.access_token), store: f.store, config: f.config, vault: new Vault(f.config.encryptionKey) };
  const spec = toolSpecs.find(x => x.name === 'update_task')!;
  const args = spec.schema.parse({ requestId: '57e94532-f565-4e8e-8e02-9135b01224c3', id: 'task-A', stateProjectId: 'done', priority: null, assigneeIds: [], deadline: null });
  await executeTool(spec, args, context);
  assert.equal(f.api.calls[0]!.variables.priority, null); assert.deepEqual(f.api.calls[0]!.variables.assigneeIds, []);
  assert.equal(f.api.calls[0]!.variables.name, undefined);
  assert.equal(spec.schema.safeParse({ ...args, priority: 4 }).success, false);
  const editor = toolSpecs.find(x => x.name === 'edit_doc_content')!;
  assert.equal(editor.schema.safeParse({ requestId: args.requestId, id: 'doc-A', edits: Array(21).fill({ action: 'append', markdown: 'a' }) }).success, false);
  assert.equal(editor.schema.safeParse({ requestId: args.requestId, id: 'doc-A', edits: [{ action: 'bogus' }] }).success, false);
  for (const kind of ['doc', 'task']) {
    const bodyEditor = toolSpecs.find(x => x.name === `edit_${kind}_content`)!;
    await assert.rejects(executeTool(bodyEditor, bodyEditor.schema.parse({ requestId: args.requestId, id: kind + '-A', edits: [{ action: 'append', markdown: 'new' }] }), context), /Reconnect with these permissions/);
  }
  assert.equal(f.api.calls.length, 1, 'Write-only content edits cannot read the body upstream');
});

test('persistent transports revalidate before cached writes and connection metadata', async t => {
  const f = fixture(); t.after(() => f.store.close());
  const a = await authorize(f), tokens = (await request(f.app).post('/oauth/token').type('form').send(a.body).expect(200)).body;
  const context = { api: f.api, identity: f.oauth.authenticate(tokens.access_token), store: f.store, config: f.config, vault: new Vault(f.config.encryptionKey), validateIdentity: async () => { await f.api.tokenInfo(pat); } };
  const spec = toolSpecs.find(x => x.name === 'create_task')!, args = { requestId: '5cf5089b-23fc-4857-9971-459520aeb722', projectId: 'project-A', name: 'QA private task' };
  await executeTool(spec, args, context);
  f.api.revoked = true;
  await assert.rejects(executeTool(spec, args, context), /Revoked/);
  await assert.rejects(executeTool(toolSpecs.find(x => x.name === 'get_connection')!, {}, context), /Revoked/);
  assert.equal(f.api.calls.length, 1);
});

test('untrusted origins, malformed bodies and oversized requests fail without upstream work', async t => {
  const f = fixture(); t.after(() => f.store.close());
  await request(f.app).post('/mcp').set('Origin', 'https://evil.example').send({}).expect(403);
  await request(f.app).post('/mcp').set('Content-Type', 'application/json').send('{invalid').expect(400);
  await request(f.app).post('/mcp').send({ value: 'x'.repeat(270000) }).expect(413);
  await request(f.app).post('/mcp').set('Authorization', 'Bearer ' + pat).send({}).expect(401);
  assert.equal(f.api.calls.length, 0);
});

test('plugin connection binds PKCE, callback and client; general OAuth and MCP keep rejecting null origins', async t => {
  const f = fixture(); t.after(() => f.store.close());
  await request(f.app).post('/oauth/token').set('Origin', 'null').send({}).expect(403);
  await request(f.app).post('/mcp').set('Origin', 'null').send({}).expect(403);
  await request(f.app).post('/oauth/link').set('Origin', 'null').send({}).expect(403);
  const verifier = random();
  const started = await request(f.app).post('/plugin/start').set('Origin', 'null').send({ challenge: challenge(verifier) }).expect(200);
  assert.equal(started.headers['access-control-allow-origin'], '*');
  assert.equal(started.headers['access-control-allow-credentials'], undefined);
  const start = started.body, authorize = new URL(start.url), browser = request.agent(f.app);
  assert.equal(authorize.searchParams.get('scope'), 'projects:read tasks:read tasks:write docs:read docs:write files:read files:write');
  await request(f.app).post('/plugin/poll').send({ id: start.id, verifier: random() }).expect(400);
  await request(f.app).post('/plugin/poll').send({ id: start.id, verifier }).expect(202);
  await request(f.app).get('/plugin/callback').query({ state: start.id, iss: f.config.origin, code: random() }).expect(400);
  const auth = await browser.get(authorize.pathname + authorize.search).expect(303);
  const id = new URL(auth.headers.location!, f.config.origin).searchParams.get('request')!;
  const view = await browser.get(auth.headers.location!).expect(200);
  const csrf = view.text.match(/name="csrf" value="([^"]+)"/)![1]!;
  await browser.post('/oauth/link-token').set('Origin', f.config.origin).type('form').send({ request: id, csrf, api_token: pat }).expect(303);
  const approved = await browser.post('/oauth/approve').set('Origin', f.config.origin).type('form').send({ request: id, csrf, decision: 'approve' }).expect(200);
  const callback = callbackFromPage(approved);
  await browser.get(callback.pathname + callback.search).expect(303).expect('Location',f.config.appUrl+'/connect/result?status=connected');
  const result = await request(f.app).post('/plugin/poll').set('Origin', 'null').send({ id: start.id, verifier }).expect(200);
  assert.ok(!JSON.stringify(result.body).includes(pat));
  await request(f.app).post('/plugin/poll').send({ id: start.id, verifier }).expect(400);
  const bearer = 'Bearer ' + result.body.access_token;
  await request(f.app).post('/plugin/tool').set('Origin', 'null').set('Authorization', bearer).send({ name: 'list_projects', args: {} }).expect(200);
  await request(f.app).post('/plugin/tool').set('Authorization', bearer).send({ name: 'send_message', args: {} }).expect(400);
  const refreshed = await request(f.app).post('/plugin/refresh').send({ refreshToken: result.body.refresh_token }).expect(200);
  await request(f.app).post('/plugin/revoke').send({ token: refreshed.body.refresh_token }).expect(200);
  await request(f.app).post('/plugin/tool').set('Authorization', 'Bearer ' + refreshed.body.access_token).send({ name: 'list_projects', args: {} }).expect(401);
});

test('plugin refuses access and refresh tokens from other OAuth clients', async t => {
  const f = fixture(); t.after(() => f.store.close());
  const b = await authorize(f); const tokens = (await request(f.app).post('/oauth/token').send(b.body).expect(200)).body;
  await request(f.app).post('/plugin/tool').set('Authorization', 'Bearer ' + tokens.access_token).send({ name: 'list_projects', args: {} }).expect(401);
  await request(f.app).post('/plugin/refresh').send({ refreshToken: tokens.refresh_token }).expect(400);
});

test('a canonical Figma link can safely retry an uncertain response while task creates cannot', async t => {
  const f=fixture();t.after(()=>f.store.close());
  const b=await authorize(f,'tasks:write'),tokens=(await request(f.app).post('/oauth/token').send(b.body).expect(200)).body;
  const identity=f.oauth.authenticate(tokens.access_token),spec=toolSpecs.find(s=>s.name==='link_figma_frame')!;
  const args=spec.schema.parse({requestId:'15424dd2-441f-477d-b967-ed17e1dfdcf1',taskId:'task-A',url:'https://www.figma.com/design/Abc123Abc123Abc123Abc123?node-id=1-2'});
  const context={api:f.api,identity,config:f.config,store:f.store,vault:new Vault(f.config.encryptionKey)};
  f.api.failure=true;await assert.rejects(executeTool(spec,args,context));
  f.api.failure=false;f.api.respond=()=>({apiLinkFigmaFrame:{id:'link-A',url:args.url}});
  assert.equal((await executeTool(spec,args,context)).link && f.api.calls.length,2);
  await executeTool(spec,args,context);assert.equal(f.api.calls.length,2);
});

test('native Figma handoff requires explicit approval, original browser and nonce, without a second consent form',async t=>{
 const f=fixture();t.after(()=>f.store.close());f.config.connectUrl=f.config.appUrl+'/settings/integrations?connection=mcp';
 const verifier=random(),start=(await request(f.app).post('/plugin/start').send({challenge:challenge(verifier)}).expect(200)).body;
 const url=new URL(start.url),browser=request.agent(f.app);
 const auth=await browser.get(url.pathname+url.search).expect(303),destination=new URL(auth.headers.location);
 assert.equal(destination.origin,new URL(f.config.appUrl).origin);assert.equal(destination.pathname,'/connect');assert.equal(destination.searchParams.get('client'),'figma');
 const id=destination.searchParams.get('request')!,nonce=destination.searchParams.get('nonce')!;
 const consent='/oauth/consent?request='+id;
 await browser.get(consent).expect(200); // No native approval, so cannot mint a code.
 await request(f.app).post('/oauth/link').set('Origin',f.config.appUrl).send({request:id,nonce:random(),apiToken:pat}).expect(400);
 await request(f.app).post('/oauth/link').set('Origin','https://evil.example').send({request:id,nonce,apiToken:pat}).expect(403);
 await request(f.app).post('/oauth/link').set('Origin',f.config.appUrl).send({request:id,nonce,apiToken:pat}).expect(200);
 await request(f.app).get(consent).expect(400); // Copied return URL cannot grant in another browser.
 const returned=await browser.get(consent).expect(303),callback=new URL(returned.headers.location);
 assert.equal(callback.pathname,'/plugin/callback');
 await browser.get(consent).expect(400);
 await browser.get(callback.pathname+callback.search).expect(303).expect('Location',f.config.appUrl+'/connect/result?status=connected');
 await request(f.app).post('/plugin/poll').send({id:start.id,verifier}).expect(200);
});
test('native Figma cancellation is browser and nonce bound and never issues credentials',async t=>{
 const f=fixture();t.after(()=>f.store.close());f.config.connectUrl=f.config.appUrl+'/connect';
 const verifier=random(),start=(await request(f.app).post('/plugin/start').send({challenge:challenge(verifier)}).expect(200)).body;
 const url=new URL(start.url),browser=request.agent(f.app);
 const auth=await browser.get(url.pathname+url.search).expect(303),dest=new URL(auth.headers.location),id=dest.searchParams.get('request')!,nonce=dest.searchParams.get('nonce')!;
 await browser.get('/oauth/cancel').query({request:id,nonce:random()}).expect(400);
 await request(f.app).get('/oauth/cancel').query({request:id,nonce}).expect(400);
 const cancelled=await browser.get('/oauth/cancel').query({request:id,nonce}).expect(303),callback=new URL(cancelled.headers.location);
 await browser.get(callback.pathname+callback.search).expect(303).expect('Location',f.config.appUrl+'/connect/result?status=cancelled');
 const result=await request(f.app).post('/plugin/poll').send({id:start.id,verifier}).expect(400);assert.equal(result.body.error,'access_denied');
});
test('Figma insertion enforces kind-specific read and write permissions; create properties and file bytes are bounded',async t=>{
 const f=fixture();t.after(()=>f.store.close());const b=await authorize(f,'tasks:read tasks:write');const tokens=(await request(f.app).post('/oauth/token').send(b.body).expect(200)).body;
 const context={api:f.api,identity:f.oauth.authenticate(tokens.access_token),config:f.config,store:f.store,vault:new Vault(f.config.encryptionKey)};
 const insert=pluginToolSpecs.find(s=>s.name==='insert_figma_design')!,create=toolSpecs.find(s=>s.name==='create_task')!,upload=pluginToolSpecs.find(s=>s.name==='upload_attachment')!;
 await assert.rejects(executeTool(insert,insert.schema.parse({requestId:'20df8760-456e-4a26-a452-e130e1739084',kind:'doc',id:'doc-A',url:'https://www.figma.com/design/abcdef?node-id=1-2'}),context),e=>e instanceof ApiError&&e.code==='INSUFFICIENT_SCOPE');
 const args=create.schema.parse({requestId:'e1c1e548-56ad-4c74-978c-511bde634694',projectId:'project-A',name:'Design',content:'Text',priority:0,assigneeIds:[],startDate:'2026-10-21T12:00:00Z'});
 await executeTool(create,args,context);assert.deepEqual(f.api.calls.at(-1)!.variables.assigneeIds,[]);assert.equal(f.api.calls.at(-1)!.variables.priority,0);
 assert.equal(create.schema.safeParse({...args,priority:4}).success,false);
 assert.equal(upload.schema.safeParse({requestId:args.requestId,projectId:'project-A',name:'large',mimeType:'text/plain',data:'A'.repeat(11184813)}).success,false);
});

test('plugin helper capabilities stay out of public MCP discovery',()=>{
 for(const name of ['get_plugin_context','list_doc_folders','list_project_lists','insert_figma_design','upload_attachment']){
  assert.ok(pluginToolSpecs.some(spec=>spec.name===name));assert.ok(!toolSpecs.some(spec=>spec.name===name));
 }
});

test('native connection keeps the existing consent flow for non-Figma MCP clients', async t => {
  const f = fixture(); t.after(() => f.store.close());
  f.config.connectUrl = f.config.appUrl + '/settings/integrations?connection=mcp';
  const b = await begin(f);
  const pending = f.store.get<{ linkNonce: string }>('pending', b.id)!;
  const linked = await request(f.app).post('/oauth/link').set('Origin', f.config.appUrl)
    .send({ request: b.id, nonce: pending.linkNonce, apiToken: pat }).expect(200);
  assert.equal(linked.body.continueUrl, f.config.origin + '/oauth/consent?request=' + b.id);
  await request(f.app).get('/oauth/consent').query({ request: b.id }).expect(400);
  const consent = await b.browser.get('/oauth/consent').query({ request: b.id }).expect(200);
  assert.ok(consent.text.includes('Review access'));
  assert.equal(consent.headers.location, undefined);
  await b.browser.get('/oauth/cancel').query({ request: b.id, nonce: pending.linkNonce }).expect(400);
  const approved = await b.browser.post('/oauth/approve').set('Origin', f.config.origin).type('form')
    .send({ request: b.id, csrf: b.csrf, decision: 'approve' }).expect(200);
  const callback = callbackFromPage(approved);
  assert.equal(callback.origin + callback.pathname, b.params.redirect_uri);
  assert.equal(callback.searchParams.get('state'), b.params.state);
  const tokens = await request(f.app).post('/oauth/token').type('form').send({
    grant_type: 'authorization_code', client_id: b.client.client_id, resource: f.config.resource,
    redirect_uri: b.params.redirect_uri, code: callback.searchParams.get('code'), code_verifier: b.verifier,
  }).expect(200);
  assert.equal(f.oauth.authenticate(tokens.body.access_token).upstream, pat);
});

test('Figma creates preserve requested task fields and files, and Docs only receive embeds', async t => {
  const f = fixture(); t.after(() => f.store.close());
  const b = await authorize(f, 'tasks:write docs:write files:write'), tokens = (await request(f.app).post('/oauth/token').send(b.body).expect(200)).body;
  const context = { api: f.api, identity: f.oauth.authenticate(tokens.access_token), config: f.config, store: f.store, vault: new Vault(f.config.encryptionKey) };
  f.api.respond = (_query, a) => ({ apiCreateTask: { id: 'task-A', name: a.name, projectId: a.projectId }, apiCreateDoc: { id: 'doc-A', title: a.title, projectId: a.projectId }, apiLinkFigmaFrame: { id: 'link-A', url: a.url } });
  const task = toolSpecs.find(s => s.name === 'create_task')!, doc = toolSpecs.find(s => s.name === 'create_doc')!;
  const designs = [{ url: 'https://figma.com/file/Abc123Abc123Abc123Abc123/Design?node-id=1%3A2&t=tracking', name: 'Old name' }, { url: 'https://www.figma.com/design/Abc123Abc123Abc123Abc123?node-id=1-2', name: 'Frame]\nOne' }];
  const fields = { priority: 0, assigneeIds: ['user-A'], startDate: '2026-10-22T09:00:00Z', deadline: '2026-10-23T09:00:00Z', stateProjectId: 'state-A', listId: 'list-A', fileIds: ['file-A'] };
  const args = task.schema.parse({ requestId: 'a87f44a5-6633-4c71-a41b-6dd5efb7f710', projectId: 'project-A', name: 'Design task', content: 'Existing **body**', figmaDesigns: designs, ...fields });
  const result = await executeTool(task, args, context);
  const variables = f.api.calls[0]!.variables;
  assert.equal(variables.content, 'Existing **body**\n\n[figma: Frame  One](https://www.figma.com/design/Abc123Abc123Abc123Abc123?node-id=1-2)');
  for (const [key, value] of Object.entries(fields)) assert.deepEqual(variables[key], value, key);
  assert.equal(variables.figmaDesigns, undefined);
  assert.equal(f.api.calls.length, 2, 'Equivalent links create just one Resource');
  assert.equal((result.figma as Record<string, unknown>).resources, 'linked');
  assert.equal((result.figma as Record<string, unknown>).backlinkCreated, false);
  const docArgs = doc.schema.parse({ requestId: args.requestId, projectId: 'project-A', title: 'Design spec', folderId: 'folder-A', figmaDesigns: [designs[0]] });
  const docResult = await executeTool(doc, docArgs, context);
  assert.equal(f.api.calls.length, 3, 'Docs do not create task Resources or attachments');
  assert.match(f.api.calls[2]!.variables.content as string, /^\[figma: Old name\]\(https:\/\/www.figma.com\/design\/Abc123Abc123Abc123Abc123\?node-id=1-2\)$/);
  assert.equal(f.api.calls[2]!.variables.folderId, 'folder-A');
  assert.equal(f.api.calls[2]!.variables.fileIds, undefined);
  assert.deepEqual(docResult.figma, { designs: [{ url: 'https://www.figma.com/design/Abc123Abc123Abc123Abc123?node-id=1-2', name: 'Old name' }], resources: 'not_applicable', pendingResources: [], backlinkCreated: false, docPageListingUpdated: false });
  assert.deepEqual(await executeTool(doc, docArgs, context), docResult);
  assert.equal(f.api.calls.length, 3);
});

test('Figma validation rejects unsupported links and oversized combined content before reserving a write', async t => {
  const f = fixture(); t.after(() => f.store.close());
  const b = await authorize(f, 'tasks:write'), tokens = (await request(f.app).post('/oauth/token').send(b.body).expect(200)).body;
  const context = { api: f.api, identity: f.oauth.authenticate(tokens.access_token), config: f.config, store: f.store, vault: new Vault(f.config.encryptionKey) };
  const spec = toolSpecs.find(s => s.name === 'create_task')!;
  const args = { requestId: '827a81e0-4b34-4ce2-8b1b-7766958c96a6', projectId: 'project-A', name: 'Design', figmaDesigns: [{ url: 'https://www.figma.com/design/Abc123Abc123Abc123Abc123?node-id=1-2' }] };
  for (const url of ['https://www.figma.com/design/Abc123?node-id=1-2', 'https://evil.example/design/Abc123Abc123Abc123Abc123?node-id=1-2', 'https://figma.com.evil.example/design/Abc123Abc123Abc123Abc123?node-id=1-2', 'http://www.figma.com/design/Abc123Abc123Abc123Abc123?node-id=1-2', 'https://user:secret@figma.com/design/Abc123Abc123Abc123Abc123?node-id=1-2', 'https://www.figma.com:444/design/Abc123Abc123Abc123Abc123?node-id=1-2', 'https://www.figma.com/design/Abc123Abc123Abc123Abc123', 'https://www.figma.com/design/Abc123Abc123Abc123Abc123?node-id=bogus', 'https://www.figma.com/make/Abc123Abc123Abc123Abc123?node-id=1-2']) {
    assert.equal(spec.schema.safeParse({ ...args, figmaDesigns: [{ url }] }).success, false, url);
  }
  for (const figmaDesigns of [[], Array(21).fill(args.figmaDesigns[0])]) assert.equal(spec.schema.safeParse({ ...args, figmaDesigns }).success, false);
  for (const [extra, code] of [[{ content: 'a'.repeat(20000) }, 'CONTENT_TOO_LONG'], [{ description: 'legacy body' }, 'INVALID_INPUT']] as const) {
    await assert.rejects(executeTool(spec, spec.schema.parse({ ...args, ...extra }), context), e => e instanceof ApiError && e.code === code);
  }
  assert.equal(f.api.calls.length, 0);
  f.api.respond = () => ({ apiCreateTask: { id: 'task-A', projectId: 'project-A' }, apiLinkFigmaFrame: { id: 'link-A' } });
  await executeTool(spec, spec.schema.parse(args), context);
  assert.equal(f.api.calls.length, 2, 'Validation failures did not reserve the requestId');
});

test('Figma task retries resume encrypted Resource progress after restart without repeating creation', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'edworking-mcp-figma-')), path = join(dir, 'state.sqlite');
  const f = fixture(path); let store = f.store;
  t.after(() => { store.close(); assert.ok(dir.startsWith(join(tmpdir(), 'edworking-mcp-figma-'))); rmSync(dir, { recursive: true, force: true }); });
  const b = await authorize(f, 'tasks:write'), tokens = (await request(f.app).post('/oauth/token').send(b.body).expect(200)).body;
  const context = { api: f.api, identity: f.oauth.authenticate(tokens.access_token), config: f.config, store, vault: new Vault(f.config.encryptionKey), validateIdentity: async () => { await f.api.tokenInfo(pat); } };
  const spec = toolSpecs.find(s => s.name === 'create_task')!;
  const designs = [1, 2, 3].map(n => ({ url: 'https://www.figma.com/design/Abc123Abc123Abc123Abc123?node-id=1-' + n, name: 'Frame ' + n }));
  const args = spec.schema.parse({ requestId: 'e1da1480-a14f-4094-86b0-21d5d727761f', projectId: 'project-A', name: 'Private resumable task', figmaDesigns: designs });
  let failLink = true;
  f.api.respond = (query, a) => {
    if (query.includes('apiCreateTask')) return { apiCreateTask: { id: 'task-A', name: a.name, projectId: a.projectId } };
    if (failLink && a.url === designs[1]!.url) throw new ApiError('UPSTREAM_UNAVAILABLE', 'Lost response');
    return { apiLinkFigmaFrame: { id: 'link-A', url: a.url } };
  };
  const first = await executeTool(spec, args, context), figma = first.figma as Record<string, unknown>;
  assert.equal(figma.resources, 'pending'); assert.deepEqual(figma.pendingResources, designs.slice(1));
  assert.equal((first.task as Record<string, unknown>).id, 'task-A');
  const key = hash(context.identity.grant.info.id + ':create_task:' + args.requestId);
  const saved = store.get<{ fingerprint: string; created: string; expires: number }>('mutation', key)!;
  assert.ok(saved.created); assert.ok(!JSON.stringify(saved).includes('Private resumable task'));
  assert.deepEqual(JSON.parse(context.vault.open(saved.created)).response.task, first.task);
  const before = f.api.calls.length;
  await assert.rejects(executeTool(spec, { ...args, name: 'Changed' }, context), e => e instanceof ApiError && e.code === 'IDEMPOTENCY_CONFLICT');
  await assert.rejects(executeTool(spec, args, { ...context, identity: { ...context.identity, scopes: [] } }), e => e instanceof ApiError && e.code === 'INSUFFICIENT_SCOPE');
  f.api.revoked = true; await assert.rejects(executeTool(spec, args, context), /Revoked/); f.api.revoked = false;
  assert.equal(f.api.calls.length, before);
  store.close(); assert.ok(!readFileSync(path).includes(Buffer.from('Private resumable task')));
  store = new Store(path); context.store = store;
  const set = store.set.bind(store), expiries: number[] = [];
  store.set = (kind, id, value, expiry) => { if (kind === 'mutation') expiries.push(expiry); set(kind, id, value, expiry); };
  failLink = false;
  const completed = await executeTool(spec, args, context);
  assert.equal((completed.figma as Record<string, unknown>).resources, 'linked');
  assert.equal(f.api.calls.filter(c => c.query.includes('apiCreateTask')).length, 1);
  assert.deepEqual(f.api.calls.filter(c => c.query.includes('apiLinkFigmaFrame')).map(c => c.variables.url), [designs[0]!.url, designs[1]!.url, designs[1]!.url, designs[2]!.url]);
  assert.ok(expiries.length > 0 && expiries.every(expiry => expiry === saved.expires), 'Retries keep the original expiry');
  assert.deepEqual(await executeTool(spec, args, context), completed); assert.equal(f.api.calls.length, 5);
  f.api.revoked = true; await assert.rejects(executeTool(spec, args, context), /Revoked/);
});

test('Figma creation never repeats an uncertain create or links a missing create result', async t => {
  const f = fixture(); t.after(() => f.store.close());
  const b = await authorize(f, 'tasks:write docs:write'), tokens = (await request(f.app).post('/oauth/token').send(b.body).expect(200)).body;
  const context = { api: f.api, identity: f.oauth.authenticate(tokens.access_token), config: f.config, store: f.store, vault: new Vault(f.config.encryptionKey) };
  for (const name of ['create_task', 'create_doc']) {
    const spec = toolSpecs.find(s => s.name === name)!;
    for (const failure of [true, false]) {
      const args = spec.schema.parse({ requestId: failure ? 'b23a916b-8b0b-46e0-8519-2a0f1fd569c9' : '375104ec-15fd-4f35-b218-17c099661652', projectId: 'project-A', name: 'Task', title: 'Doc', figmaDesigns: [{ url: 'https://www.figma.com/design/Abc123Abc123Abc123Abc123?node-id=1-2' }] });
      const before = f.api.calls.length; f.api.failure = failure; f.api.respond = () => ({ apiCreateTask: null, apiCreateDoc: null });
      await assert.rejects(executeTool(spec, args, context));
      f.api.failure = false;
      await assert.rejects(executeTool(spec, args, context), e => e instanceof ApiError && e.code === 'RESULT_UNCERTAIN');
      assert.equal(f.api.calls.length, before + 1);
    }
  }
});

test('concurrent Figma creation calls cannot create a second task while the first result is pending', async t => {
  const f = fixture(); t.after(() => f.store.close());
  const b = await authorize(f, 'tasks:write'), tokens = (await request(f.app).post('/oauth/token').send(b.body).expect(200)).body;
  const context = { api: f.api, identity: f.oauth.authenticate(tokens.access_token), config: f.config, store: f.store, vault: new Vault(f.config.encryptionKey) };
  const spec = toolSpecs.find(s => s.name === 'create_task')!, args = spec.schema.parse({ requestId: 'ea950d61-c2c9-42d4-bad2-bfc03856e477', projectId: 'project-A', name: 'One task', figmaDesigns: [{ url: 'https://www.figma.com/design/Abc123Abc123Abc123Abc123?node-id=1-2' }] });
  let release!: () => void, started!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; }), entered = new Promise<void>(resolve => { started = resolve; });
  const execute = f.api.execute.bind(f.api);
  f.api.execute = async <T>(token: string, query: string, variables: Record<string, unknown> = {}): Promise<T> => {
    if (query.includes('apiCreateTask')) { started(); await gate; }
    return execute<T>(token, query, variables);
  };
  f.api.respond = () => ({ apiCreateTask: { id: 'task-A', projectId: 'project-A' }, apiLinkFigmaFrame: { id: 'link-A' } });
  const first = executeTool(spec, args, context); await entered;
  try { await assert.rejects(executeTool(spec, args, context), e => e instanceof ApiError && e.code === 'RESULT_UNCERTAIN'); }
  finally { release(); }
  const result = await first; assert.deepEqual(await executeTool(spec, args, context), result);
  assert.equal(f.api.calls.length, 2);
});

test('Figma creates enforce task, Doc and attachment scopes and do not hide revoked linking permissions', async t => {
  const f = fixture(); t.after(() => f.store.close());
  const b = await authorize(f, 'tasks:write'), tokens = (await request(f.app).post('/oauth/token').send(b.body).expect(200)).body;
  const context = { api: f.api, identity: f.oauth.authenticate(tokens.access_token), config: f.config, store: f.store, vault: new Vault(f.config.encryptionKey) };
  const task = toolSpecs.find(s => s.name === 'create_task')!, doc = toolSpecs.find(s => s.name === 'create_doc')!;
  const args = { requestId: 'a419772e-9cb4-4531-92fa-e71c4ce2cfd8', projectId: 'project-A', name: 'Task', figmaDesigns: [{ url: 'https://www.figma.com/design/Abc123Abc123Abc123Abc123?node-id=1-2' }] };
  await assert.rejects(executeTool(task, task.schema.parse({ ...args, fileIds: ['file-A'] }), context), e => e instanceof ApiError && e.code === 'INSUFFICIENT_SCOPE');
  await assert.rejects(executeTool(doc, doc.schema.parse({ ...args, title: 'Doc' }), context), e => e instanceof ApiError && e.code === 'INSUFFICIENT_SCOPE');
  await assert.rejects(executeTool(task, task.schema.parse(args), { ...context, identity: { ...context.identity, scopes: [] } }), e => e instanceof ApiError && e.code === 'INSUFFICIENT_SCOPE');
  assert.equal(f.api.calls.length, 0);
  f.api.respond = query => {
    if (query.includes('apiCreateTask')) return { apiCreateTask: { id: 'task-A', projectId: 'project-A' } };
    throw new ApiError('UNAUTHORIZED', 'Access revoked');
  };
  await assert.rejects(executeTool(task, task.schema.parse(args), context), e => e instanceof ApiError && e.code === 'UNAUTHORIZED'
    && e.message.includes('/tasks/t/task-A was already created') && e.message.includes(args.figmaDesigns[0]!.url));
  f.api.respond = () => ({ apiLinkFigmaFrame: { id: 'link-A' } });
  assert.equal((await executeTool(task, task.schema.parse(args), context)).figma && f.api.calls.length, 3, 'A confirmed create is not repeated after a link rejection');
});

test('external MCP SDK completes discovery, Figma callback PKCE, explicit write consent, refresh and revocation', async t => {
  const { auth } = await import('@modelcontextprotocol/sdk/client/auth.js');
  const f = fixture();
  const server = f.app.listen(0, '127.0.0.1'); await new Promise<void>(r => server.once('listening', r));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  f.config.origin = `http://127.0.0.1:${address.port}`; f.config.resource = f.config.origin + '/mcp';
  f.config.allowedOrigins.push(f.config.origin);
  const clients: Client[] = [];
  t.after(async () => { for (const client of clients) await client.close(); await new Promise<void>(r => server.close(() => r())); f.store.close(); });
  let registration: import('@modelcontextprotocol/sdk/shared/auth.js').OAuthClientInformationMixed | undefined;
  let tokens: import('@modelcontextprotocol/sdk/shared/auth.js').OAuthTokens | undefined;
  let authorization: URL | undefined, verifier = '';
  const callbackUrl = 'https://www.figma.com/oauth/mcp/callback';
  const provider: import('@modelcontextprotocol/sdk/client/auth.js').OAuthClientProvider = {
    redirectUrl: callbackUrl,
    clientMetadata: { client_name: 'Figma compatibility test', redirect_uris: [callbackUrl], token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'] },
    clientInformation: () => registration, saveClientInformation: value => { registration = value; },
    tokens: () => tokens, saveTokens: value => { tokens = value; },
    redirectToAuthorization: value => { authorization = value; },
    saveCodeVerifier: value => { verifier = value; }, codeVerifier: () => verifier,
    state: () => 'synthetic-figma-state',
  };
  const paths: string[] = [];
  const localFetch: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    assert.equal(url.origin, f.config.origin, 'Synthetic credentials never leave the test listener');
    paths.push(url.pathname); return fetch(input, init);
  };
  async function approve(scope?: string) {
    assert.equal(await auth(provider, { serverUrl: f.config.resource, scope, fetchFn: localFetch }), 'REDIRECT');
    assert.ok(authorization);
    assert.equal(authorization.searchParams.get('redirect_uri'), callbackUrl);
    assert.equal(authorization.searchParams.get('code_challenge_method'), 'S256');
    assert.equal(authorization.searchParams.get('code_challenge'), challenge(verifier));
    assert.equal(authorization.searchParams.get('resource'), f.config.resource);
    const browser = request.agent(f.app);
    const started = await browser.get(authorization.pathname + authorization.search).expect(303);
    const page = await browser.get(started.headers.location).expect(200);
    const id = new URL(started.headers.location, f.config.origin).searchParams.get('request')!;
    const csrf = page.text.match(/name="csrf" value="([^"]+)"/)![1];
    await browser.post('/oauth/link-token').set('Origin', f.config.origin).type('form').send({ request: id, csrf, api_token: pat }).expect(303);
    const approved = await browser.post('/oauth/approve').set('Origin', f.config.origin).type('form').send({ request: id, csrf, decision: 'approve' }).expect(200);
    const callback = callbackFromPage(approved);
    assert.equal(callback.origin + callback.pathname, callbackUrl);
    assert.equal(callback.searchParams.get('state'), 'synthetic-figma-state');
    assert.equal(callback.searchParams.get('iss'), f.config.origin);
    assert.equal(await auth(provider, { serverUrl: f.config.resource, authorizationCode: callback.searchParams.get('code')!, fetchFn: localFetch }), 'AUTHORIZED');
    assert.ok(tokens); assert.ok(!JSON.stringify(tokens).includes(pat));
  }
  async function connect() {
    const client = new Client({ name: 'synthetic-figma-client', version: '1.0.0' }); clients.push(client);
    await client.connect(new StreamableHTTPClientTransport(new URL(f.config.resource), { authProvider: provider, fetch: localFetch }));
    return client;
  }
  await approve();
  assert.ok(tokens!.scope!.split(' ').every(scope => scope.endsWith(':read')));
  const reader = await connect();
  const discovered = await reader.listTools(); assert.equal(discovered.tools.length, 24);
  for (const name of ['create_task', 'create_doc']) {
    const spec = discovered.tools.find(tool => tool.name === name)!;
    assert.ok(spec.inputSchema.properties?.figmaDesigns); assert.equal(spec.annotations?.readOnlyHint, false);
  }
  const taskArgs = { requestId: '39d43596-6ad4-469d-a85d-b781fbdc47d5', projectId: 'project-A', name: 'SDK design task', figmaDesigns: [{ url: 'https://www.figma.com/design/Abc123Abc123Abc123Abc123?node-id=0-1' }] };
  const denied = await reader.callTool({ name: 'create_task', arguments: taskArgs });
  assert.equal(denied.isError, true); assert.match(JSON.stringify(denied._meta), /insufficient_scope.*tasks:write/);
  assert.equal(f.api.calls.length, 0);
  const registrationId = registration!.client_id;
  // Consent is explicit: refreshing a read grant must never silently add writes.
  tokens = undefined;
  await approve('projects:read tasks:read tasks:write docs:read docs:write');
  assert.equal(registration!.client_id, registrationId);
  const writer = await connect();
  f.api.respond = (_query, a) => ({ apiCreateTask: { id: 'task-A', name: a.name, projectId: a.projectId }, apiCreateDoc: { id: 'doc-A', title: a.title, projectId: a.projectId }, apiLinkFigmaFrame: { id: 'link-A', url: a.url } });
  const created = await writer.callTool({ name: 'create_task', arguments: taskArgs });
  assert.notEqual(created.isError, true); assert.equal(((created.structuredContent as Record<string, unknown>).figma as Record<string, unknown>).resources, 'linked');
  assert.equal(f.api.calls[0]!.variables.assigneeIds, undefined);
  for (const field of ['priority', 'deadline', 'startDate', 'fileIds']) assert.equal(f.api.calls[0]!.variables[field], undefined);
  const doc = await writer.callTool({ name: 'create_doc', arguments: { ...taskArgs, title: 'SDK design Doc' } });
  assert.notEqual(doc.isError, true); assert.equal(((doc.structuredContent as Record<string, unknown>).figma as Record<string, unknown>).resources, 'not_applicable');
  assert.equal(f.api.calls.length, 3);
  const refreshBefore = tokens!.refresh_token;
  assert.equal(await auth(provider, { serverUrl: f.config.resource, fetchFn: localFetch }), 'AUTHORIZED');
  assert.notEqual(tokens!.refresh_token, refreshBefore);
  assert.deepEqual((await writer.callTool({ name: 'create_task', arguments: taskArgs })).structuredContent, created.structuredContent);
  assert.equal(f.api.calls.length, 3, 'Refresh retains cached action identity');
  await request(f.app).post('/oauth/revoke').type('form').send({ client_id: registration!.client_id, token: tokens!.refresh_token }).expect(200);
  await request(f.app).post('/mcp').set('Authorization', 'Bearer ' + tokens!.access_token).send({}).expect(401);
  for (const path of ['/.well-known/oauth-protected-resource/mcp', '/.well-known/oauth-authorization-server', '/oauth/register', '/oauth/token', '/mcp']) assert.ok(paths.includes(path), path);
});

test('Figma write consent rejects an upstream token missing Doc permissions', async t => {
  const f = fixture(); t.after(() => f.store.close());
  f.api.identity.scopes = ['projects:read', 'tasks:read', 'tasks:write'];
  const b = await begin(f, 'tasks:write docs:write');
  const denied = await b.browser.post('/oauth/link-token').set('Origin', f.config.origin).type('form').send({ request: b.id, csrf: b.csrf, api_token: pat }).expect(400);
  assert.match(denied.text, /does not include all requested permissions/);
  await b.browser.post('/oauth/approve').set('Origin', f.config.origin).type('form').send({ request: b.id, csrf: b.csrf, decision: 'approve' }).expect(400);
  assert.equal(f.api.calls.length, 0);
});

test('Figma Resource retries handle actual HTTP and GraphQL adapter failures without recreating tasks', async t => {
  const f = fixture(); t.after(() => f.store.close());
  const b = await authorize(f, 'tasks:write'), tokens = (await request(f.app).post('/oauth/token').send(b.body).expect(200)).body;
  const spec = toolSpecs.find(s => s.name === 'create_task')!;
  for (const failure of ['429', '503', 'graphql', 'invalid-json', 'empty-data', 'missing-link', 'network', 'forbidden']) {
    let fail = true; const operations: string[] = [];
    const api = new Edworking('https://synthetic.example/graphql', async (_input, init) => {
      assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer ' + pat);
      assert.equal(init?.redirect, 'error');
      const body = JSON.parse(String(init?.body)); operations.push(body.query);
      if (body.query.includes('apiCreateTask')) return Response.json({ data: { apiCreateTask: { id: 'task-A', projectId: 'project-A' } } });
      if (fail) {
        if (failure === 'network') throw new TypeError('synthetic disconnection');
        if (failure === '429' || failure === '503') return new Response('', { status: Number(failure) });
        if (failure === 'invalid-json') return new Response('invalid');
        if (failure === 'empty-data') return Response.json({});
        if (failure === 'missing-link') return Response.json({ data: { apiLinkFigmaFrame: null } });
        return Response.json({ errors: [{ message: 'synthetic private diagnostic', extensions: { code: failure === 'forbidden' ? 'FORBIDDEN' : 'INTERNAL_SERVER_ERROR' } }] });
      }
      return Response.json({ data: { apiLinkFigmaFrame: { id: 'link-A', url: body.variables.url } } });
    });
    const context = { api, identity: f.oauth.authenticate(tokens.access_token), config: f.config, store: f.store, vault: new Vault(f.config.encryptionKey) };
    const args = spec.schema.parse({ requestId: (await import('node:crypto')).randomUUID(), projectId: 'project-A', name: failure, figmaDesigns: [{ url: 'https://www.figma.com/design/Abc123Abc123Abc123Abc123?node-id=1-2' }] });
    if (failure === 'forbidden') await assert.rejects(executeTool(spec, args, context), e => e instanceof ApiError && e.code === 'UNAUTHORIZED');
    else {
      const pending = await executeTool(spec, args, context);
      assert.equal((pending.figma as Record<string, unknown>).resources, 'pending');
      assert.equal((pending.task as Record<string, unknown>).id, 'task-A');
      assert.ok(!JSON.stringify(pending).includes('private diagnostic'));
    }
    fail = false;
    assert.equal(((await executeTool(spec, args, context)).figma as Record<string, unknown>).resources, 'linked');
    assert.equal(operations.filter(source => source.includes('apiCreateTask')).length, 1);
    assert.equal(operations.length, 3);
  }
});

test('Figma embeds cannot be swallowed by an unclosed Markdown code fence', async t => {
  const f = fixture(); t.after(() => f.store.close());
  const b = await authorize(f, 'tasks:write docs:write'), tokens = (await request(f.app).post('/oauth/token').send(b.body).expect(200)).body;
  const context = { api: f.api, identity: f.oauth.authenticate(tokens.access_token), config: f.config, store: f.store, vault: new Vault(f.config.encryptionKey) };
  f.api.respond = () => ({ apiCreateTask: { id: 'task-A', projectId: 'project-A' }, apiCreateDoc: { id: 'doc-A', projectId: 'project-A' }, apiLinkFigmaFrame: { id: 'link-A' } });
  for (const name of ['create_task', 'create_doc']) {
    const spec = toolSpecs.find(s => s.name === name)!;
    for (const content of ['```tsx\nconst a = 1;', '  ~~~~c++\r\ncode\r\n~~~', '[abcdef12] ```js\ncode']) {
      const args = spec.schema.parse({ requestId: (await import('node:crypto')).randomUUID(), projectId: 'project-A', name: 'Task', title: 'Doc', content, figmaDesigns: [{ url: 'https://www.figma.com/design/Abc123Abc123Abc123Abc123?node-id=1-2' }] });
      const before = f.api.calls.length;
      await assert.rejects(executeTool(spec, args, context), e => e instanceof ApiError && e.code === 'UNCLOSED_CODE_FENCE');
      assert.equal(f.api.calls.length, before);
      const fixed = { ...args, content: '```tsx\nconst a = 1;\n```' };
      await executeTool(spec, fixed, context);
      assert.equal(f.api.calls.length, before + (name === 'create_task' ? 2 : 1), 'Validation does not reserve requestId');
    }
  }
});

test('HTTPS proxy consent uses secure browser cookies and preserves the exact Figma callback', async t => {
  const config = readConfig({ NODE_ENV: 'production', PUBLIC_BASE_URL: 'https://mcp-test.example', TOKEN_ENCRYPTION_KEY: 'a'.repeat(64), DATABASE_PATH: ':memory:' });
  const store = new Store(':memory:'), api = new FakeApi(), f = createApp(config, store, api); t.after(() => store.close());
  const callbackUrl = 'https://www.figma.com/oauth/mcp/callback';
  const client = (await request(f.app).post('/oauth/register').send({ client_name: 'Synthetic Figma HTTPS test', redirect_uris: [callbackUrl], token_endpoint_auth_method: 'none' }).expect(201)).body;
  const verifier = random();
  const parameters = { response_type: 'code', client_id: client.client_id, redirect_uri: callbackUrl, code_challenge_method: 'S256', code_challenge: challenge(verifier), resource: config.resource, scope: 'tasks:write docs:write', state: 'https-state' };
  const started = await request(f.app).get('/oauth/authorize').set('X-Forwarded-Proto', 'https').query(parameters).expect(303);
  const cookies = started.headers['set-cookie'] as unknown as string[];
  const session = cookies.find(value => value.startsWith('__Host-bellsprout_session='))!;
  assert.ok(session); for (const flag of ['Path=/', 'HttpOnly', 'Secure', 'SameSite=Lax']) assert.ok(session.includes(flag), flag);
  assert.ok(!/Domain=/i.test(session));
  const cookie = session.split(';')[0]!;
  const page = await request(f.app).get(started.headers.location).set('Cookie', cookie).expect(200);
  const csrf = page.text.match(/name="csrf" value="([^"]+)"/)![1], id = new URL(started.headers.location, config.origin).searchParams.get('request')!;
  assert.match(page.headers['content-security-policy'], /form-action 'self'/);
  await request(f.app).post('/oauth/link-token').set('Cookie', cookie).set('Origin', config.origin).type('form').send({ request: id, csrf, api_token: pat }).expect(303);
  const approved = await request(f.app).post('/oauth/approve').set('Cookie', cookie).set('Origin', config.origin).type('form').send({ request: id, csrf, decision: 'approve' }).expect(200);
  const callback = callbackFromPage(approved);
  assert.equal(callback.origin + callback.pathname, callbackUrl); assert.equal(callback.searchParams.get('iss'), config.origin); assert.equal(callback.searchParams.get('state'), 'https-state');
  const tokens = (await request(f.app).post('/oauth/token').type('form').send({ grant_type: 'authorization_code', client_id: client.client_id, redirect_uri: callbackUrl, resource: config.resource, code_verifier: verifier, code: callback.searchParams.get('code') }).expect(200)).body;
  assert.deepEqual(f.oauth.authenticate(tokens.access_token).scopes, ['tasks:write', 'docs:write']);
  const metadata = await request(f.app).get('/.well-known/oauth-authorization-server').expect(200);
  assert.equal(metadata.body.issuer, config.origin); assert.deepEqual(metadata.body.token_endpoint_auth_methods_supported, ['none']);
  const anonymous = await request(f.app).post('/mcp').send({}).expect(401);
  assert.match(anonymous.headers['www-authenticate'], /https:\/\/mcp-test\.example\/\.well-known\/oauth-protected-resource\/mcp/);
});
