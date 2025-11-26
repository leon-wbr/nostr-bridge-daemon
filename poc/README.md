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

## Programmatic usage (route engine)

Routes are built from URI-like endpoints (`scheme:path?query`) and can fan out to multiple producers with optional filters/processors.

Run configs with `dromedary run` (auto-detects `dromedary.config.[cm]js` or `.ts`, or pass `--config <file>`).

## Known limitations (PoC)

- No idempotency or de-duplication; a reconnect can replay and resend.
- Minimal error handling and backoff; producer failures can drop messages.
- Nostr relay handling is naive (no batching, optimistic publish only, no reconnects or smart filters).
- Cron parser is simplistic and local-time only.
- Route syntax and component options may change; backward compatibility is not guaranteed.
- There is no “real” functionality yet; the current build is for experimentation, documentation, and verifying plumbing.
- Expo Push example relies on NIP-4 for decrypting app data, which is unrecommended in favor of NIP-17.
