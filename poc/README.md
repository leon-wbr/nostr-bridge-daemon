# Nostr Bridge Daemon – Proof of Concept

Two workspaces:

- `core/` – lightweight route engine + pluggable components (nostr/cron/email/etc).
- `example/` – demo wiring the core with a few routes.

## Quickstart

```bash
cd poc
npm install              # installs workspace deps
npm run start            # builds core+example, then runs the demo
```

Useful env vars for the demo:

- `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `NBD_SECRET_KEY`, `NBD_STATUS_KEY`, `EXPO_ACCESS_TOKEN`

## Programmatic usage (route engine)

```ts
import { RouteEngine, defineConfig, createComponentRegistry, from, tag, nostrComponent, emailComponent } from 'nostr-bridge-poc-core';

const config = defineConfig({
  components: createComponentRegistry({
    nostr: nostrComponent({ pools: { default: ['wss://relay.damus.io'] }, defaultPool: 'default' }),
    email: emailComponent({ smtpHost: 'smtp.example.com', smtpPort: 587, smtpUser: '', smtpPass: '', defaultFrom: 'nostr@example.com' }),
  }),
  routes: [
    from('nostr:default?kinds=1').filter(tag('p').exists()).to('email:alerts?subject=Nostr%20mention'),
  ],
});

const engine = new RouteEngine(config.components, config.routes, { logger: console });
const stop = engine.startAll();
```

Routes are built from URI-like endpoints (`scheme:path?query`) and can fan out to multiple producers with optional filters/processors.
