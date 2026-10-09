import { readConfig } from './config.js';
import { Store } from './store.js';
import { createApp } from './app.js';
const config = readConfig(), store = new Store(config.databasePath);
store.sweep();
const timer = setInterval(() => store.sweep(), 60_000); timer.unref();
const { app } = createApp(config, store);
const server = app.listen(config.port, '0.0.0.0', () => console.log(JSON.stringify({ event: 'listening', service: 'bellsprout', port: config.port })));
server.requestTimeout = 60_000; server.headersTimeout = 15_000;
let closing = false;
const shutdown = () => {
  if (closing) return; closing = true; clearInterval(timer);
  server.close(() => { store.close(); process.exit(0); });
  setTimeout(() => process.exit(1), 15_000).unref();
};
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
