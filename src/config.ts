import { z } from 'zod';

export const SCOPES = ['projects:read', 'tasks:read', 'messages:read', 'chats:read', 'files:read', 'tasks:write', 'messages:write', 'projects:write', 'files:write'] as const;
export const READ_SCOPES = SCOPES.filter(s => s.endsWith(':read'));
export const scopeLabels: Record<string, string> = {
  'projects:read': 'Read projects and their statuses', 'tasks:read': 'Read tasks',
  'messages:read': 'Read accessible conversations', 'chats:read': 'List your conversations',
  'files:read': 'Read file information', 'tasks:write': 'Create tasks and edit names or deadlines',
  'messages:write': 'Send messages', 'projects:write': 'Create projects', 'files:write': 'Upload and attach files',
};
export interface Config {
  origin: string; resource: string; apiUrl: string; appUrl: string; databasePath: string;
  encryptionKey: string; port: number; production: boolean; connectUrl?: string;
  allowedOrigins: string[]; challenge?: string;
}
export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const production = env.NODE_ENV === 'production';
  const origin = z.url().parse(env.PUBLIC_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
  const url = new URL(origin);
  if (url.pathname !== '/' || url.search || url.hash || url.username || url.password) throw new Error('PUBLIC_BASE_URL must be an origin');
  if (production && url.protocol !== 'https:') throw new Error('HTTPS required in production');
  const encryptionKey = z.string().regex(/^[a-fA-F0-9]{64}$/).parse(env.TOKEN_ENCRYPTION_KEY);
  const apiUrl = z.url().parse(env.EDWORKING_API_URL || 'https://venusaur.edworking.com/');
  const appUrl = z.url().parse(env.EDWORKING_APP_URL || 'https://app.edworking.com');
  if (production && new URL(apiUrl).protocol !== 'https:') throw new Error('Upstream HTTPS required');
  const connectUrl = env.EDWORKING_CONNECT_URL;
  if (connectUrl && new URL(connectUrl).origin !== new URL(appUrl).origin) throw new Error('Connection UI must use the Edworking app origin');
  const databasePath = env.DATABASE_PATH || './data/bellsprout.sqlite';
  if (production && !env.DATABASE_PATH) throw new Error('Production requires a persistent DATABASE_PATH');
  return { origin, resource: `${origin}/mcp`, apiUrl, appUrl, databasePath, encryptionKey,
    port: z.coerce.number().int().min(1).max(65535).parse(env.PORT || 3000), production, connectUrl,
    allowedOrigins: [origin, new URL(appUrl).origin, ...(env.ALLOWED_ORIGINS || '').split(',').filter(Boolean)],
    challenge: env.OPENAI_DOMAIN_CHALLENGE };
}
