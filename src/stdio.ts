#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { randomBytes } from 'node:crypto';
import { Edworking, ApiError } from './edworking.js';
import { readConfig } from './config.js';
import { Store } from './store.js';
import { Vault } from './crypto.js';
import { createMcp } from './tools.js';
// stdio uses a user-owned API token from the environment, never OAuth or shared browser sessions.
const token = process.env.EDWORKING_API_TOKEN;
if (!token) { console.error('Set EDWORKING_API_TOKEN to a scoped Edworking API token.'); process.exit(1); }
const config = readConfig({ ...process.env, NODE_ENV: 'development', TOKEN_ENCRYPTION_KEY: randomBytes(32).toString('hex') });
const api = new Edworking(config.apiUrl), info = await api.tokenInfo(token), store = new Store(':memory:'), vault = new Vault(config.encryptionKey);
const identity = { upstream: token, scopes: info.scopes, grant: { id: info.id, clientId: 'stdio', scopes: info.scopes, resource: config.resource, upstream: vault.seal(token), info, expires: Date.parse(info.expiresAt) } };
const validateIdentity = async () => {
  const current = await api.tokenInfo(token);
  if (current.id !== info.id || current.userId !== info.userId || current.teamId !== info.teamId || info.scopes.some(scope => !current.scopes.includes(scope))) {
    throw new ApiError('UNAUTHORIZED', 'The Edworking connection changed. Restart with an authorized scoped token.');
  }
};
await createMcp({ api, identity, config, store, vault, validateIdentity }).connect(new StdioServerTransport());
