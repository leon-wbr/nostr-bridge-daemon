import { RouteEngine, type ComponentContext } from 'nostr-bridge-poc-core';
import config from './nbd.config.js';

const buildContext = (): ComponentContext => {
  const keys: ComponentContext['keys'] = {};
  if (process.env.NBD_SECRET_KEY) keys.default = process.env.NBD_SECRET_KEY;
  if (process.env.NBD_STATUS_KEY) keys.statusBot = process.env.NBD_STATUS_KEY;

  return {
    logger: console,
    keys,
  };
};

const main = async () => {
  const ctx = buildContext();
  const engine = new RouteEngine(config.components, config.routes, ctx);
  const stop = engine.startAll();

  // eslint-disable-next-line no-console
  console.log('NBD route engine started');

  const shutdown = () => {
    stop();
    // eslint-disable-next-line no-console
    console.log('NBD route engine stopped');
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
};

if (import.meta.url === new URL(process.argv[1] || '', `file://${process.cwd()}/`).href) {
  // eslint-disable-next-line no-console
  main().catch((err) => console.error(err));
}
