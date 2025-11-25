# Dromedary – Proof of Concept

Two workspaces:

- `core/` – lightweight route engine + pluggable components (nostr/cron/email/etc); think a minimal Apache Camel for Node.
- `example/` – demo wiring the core with a few routes.

## Quickstart

```bash
cd poc
npm install              # installs workspace deps
npm run start            # builds core+example, then runs the demo
```

Useful env vars for the demo:

- `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` – outbound email
- `DROMEDARY_SECRET_KEY` – signing key for nostr producers
- `DROMEDARY_STATUS_KEY` – status bot signing key
- `EXPO_ACCESS_TOKEN` – for the Expo push adapter

## Programmatic usage (route engine)

```ts
import { RouteEngine, defineConfig, from, tag, nostrComponent, emailComponent } from '@dromedary/poc-core';

const config = defineConfig({
  components: {
    nostr: nostrComponent({ pools: { default: ['wss://relay.damus.io'] }, defaultPool: 'default' }),
    email: emailComponent({ smtpHost: 'smtp.example.com', smtpPort: 587, smtpUser: '', smtpPass: '', defaultFrom: 'nostr@example.com' }),
  },
  routes: [from('nostr:default?kinds=1').filter(tag('p').exists()).process((evt) => evt).to('email:alerts')],
});

const engine = new RouteEngine(config.components, config.routes, { logger: console });
const stop = engine.startAll();
```

Routes are built from URI-like endpoints (`scheme:path?query`) and can fan out to multiple producers with optional filters/processors.

Run configs with `dromedary run` (auto-detects `dromedary.config.[cm]js` or `.ts` when `ts-node` is available, or pass `--config <file>`).

## Known limitations (PoC)

- No idempotency or de-duplication; a reconnect can replay and resend.
- Minimal error handling and backoff; producer failures can drop messages.
- Nostr relay handling is naive (no batching, optimistic publish only).
- Cron parser is simplistic and local-time only.
- Route syntax and component options may change; backward compatibility is not guaranteed.
