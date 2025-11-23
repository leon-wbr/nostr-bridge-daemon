You are refactoring an existing TypeScript project called **Nostr Bridge Daemon (NBD)** into a more structured, Camel-like architecture using **Components + URIs** and a simple routing DSL.

### Goal

Adapt the existing NBD implementation so that:

1. It uses **Components** for connectors.
2. Routes are defined with **URIs** like Camel:
   `from("nostr:publicTimeline?kinds=1,7").via(...).to("email:notifications?template=mention")`
3. For this proof of concept, we only need **three components**:

   * `nostr` – Nostr relays (streaming in, publishing out)
   * `email` – SMTP email sending (outbound only)
   * `cron` – scheduled jobs (inbound only)

You can assume the codebase already has some form of:

* event bus / plugin system
* Nostr client / relay connection handling
* basic email sending utility
* basic cron / scheduler usage

Your job is to **wrap and reorganize** these into the Component + URI + routing model described below, not to reimplement Nostr or SMTP from scratch.

---

## 1. Introduce a Component + Endpoint model

### 1.1. Define core types

Create or adapt a small core module, e.g. `src/runtime/components.ts`, with:

```ts
export interface EndpointConfig {
  scheme: string;       // "nostr", "email", "cron"
  path: string;         // e.g. "publicTimeline" or "" if unused
  query: Record<string, string | string[]>; // from URI query
}

export interface Consumer {
  start(onEvent: (event: any) => void): () => void;
  // Returns a stop function to unsubscribe/cleanup
}

export interface Producer {
  send(payload: any): Promise<void>;
}

export interface ComponentContext {
  // Access to shared resources: logger, store, keys, etc.
  logger: Console;
  // existing NBD context bits: nostr client(s), scheduler, etc.
  nostrClient?: any;
  scheduler?: any;
  // add more as needed
}

export interface Component {
  createConsumer?(endpoint: EndpointConfig, ctx: ComponentContext): Consumer;
  createProducer?(endpoint: EndpointConfig, ctx: ComponentContext): Producer;
}
```

Implement a helper to parse URIs into `EndpointConfig`, e.g. in `src/runtime/uri.ts`:

```ts
export function parseEndpoint(uri: string): EndpointConfig {
  // Expected form: scheme:path?key=value&key2=value2
  // Example: "nostr:publicTimeline?kinds=1,7&mode=fanout"
  // Example: "email:notifications?template=mention"
  // Example: "cron:0 * * * *"

  // Parse scheme, path, and query string into EndpointConfig
}
```

### 1.2. Component registry

Create a simple registry in `src/runtime/registry.ts`:

```ts
export interface ComponentRegistry {
  [scheme: string]: Component;
}

export function createComponentRegistry(
  components: ComponentRegistry,
): ComponentRegistry {
  return components;
}
```

---

## 2. Implement three Components: Nostr, Email, Cron

### 2.1. `nostr` Component

Create `src/components/nostr.ts`:

* It should support **relay pools** and **URI-based configuration**.

Design:

* Component gets constructed with a config describing relay pools:

```ts
export interface NostrPoolConfig {
  [poolName: string]: string[]; // poolName -> array of relay URLs
}

export interface NostrComponentOptions {
  pools: NostrPoolConfig;
  defaultPool?: string;     // e.g. "default"
  defaultMode?: "fanout" | "first-success" | "quorum";
}

export function nostrComponent(options: NostrComponentOptions): Component {
  // internally keep:
  // - a map poolName -> connection pool object
  // - connection pool handles subscriptions and publishing
}
```

* **Consumer behavior** (`createConsumer`):

  * Accept URIs like:

    * `nostr:publicTimeline?kinds=1,7`
    * `nostr:archival?kinds=1,30000&mode=quorum`
  * Interpret:

    * `path` as the pool name (`publicTimeline`, `archival`, etc.).
    * `query.kinds` as a list of Nostr kinds to subscribe to.
    * `query.mode` as optional read strategy (`fanout` by default).
  * Implementation:

    * Resolve pool by `path` (fallback to `default`).
    * Call a shared pool method like `pool.subscribe(filters, callback)`.
    * Wrap this in a `Consumer` that calls `onEvent(evt)` for each event and returns an `unsubscribe` function.

* **Producer behavior** (`createProducer`):

  * Accept URIs like:

    * `nostr:publicTimeline?kind=1&keyRole=timeline`
    * `nostr:scraperPool?kind=30001&keyRole=scraper&mode=fanout`
  * Interpret:

    * `path` as pool name.
    * `query.kind` as the kind of Nostr event to publish by default (if the payload is not already a full event).
    * `query.keyRole` as which key to use (use the existing NBD key management if possible).
    * `query.mode` as publishing strategy.
  * Implementation:

    * Build a `Producer` that:

      * Accepts either a raw content object or a full Nostr event.
      * Uses keys from context (`ctx`) to sign events.
      * Publishes to all relays in the pool using the chosen mode.

You don’t have to implement perfect Nostr logic; just wire it to whatever Nostr client / relay abstraction already exists in the repo.

---

### 2.2. `email` Component

Create `src/components/email.ts`:

* Outbound-only for now.

Config:

```ts
export interface EmailComponentOptions {
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  defaultFrom: string;
}

export function emailComponent(options: EmailComponentOptions): Component {
  // Uses an existing SMTP/email utility from the project
}
```

Behavior:

* Only needs `createProducer`.
* Accept URIs like:

  * `email:notifications?template=mention`
  * `email:ops?subject=Status&to=ops@example.com`
* Interpret:

  * `path` (`notifications`, `ops`) as a logical channel or profile.
  * `query` fields (`template`, `subject`, `to`) as configuration hints.
* Implement `send(payload)` roughly as:

  * `payload` is e.g. `{ to, subject, body }` or some “intent” object from processors.
  * Choose `to`/`subject`/`body` combining:

    * the URI config
    * the payload
    * maybe a template system (keep it simple for PoC)
  * Call existing SMTP helper to send the email.

---

### 2.3. `cron` Component

Create `src/components/cron.ts`:

* Inbound-only.

Config:

```ts
export interface CronComponentOptions {
  timezone?: string;
}

export function cronComponent(options: CronComponentOptions): Component {
  // Uses an existing scheduler/cron utility from the project
}
```

Behavior:

* Only needs `createConsumer`.
* Accept URIs like:

  * `cron:0 * * * *`  (every hour)
  * `cron:*/5 * * * *` (every 5 minutes)
* Interpret:

  * `path` as the cron expression string.
* Implementation:

  * Use existing cron/scheduler (e.g. node-cron or project’s scheduler).
  * `start(onEvent)` schedules a job, and each time it fires, call `onEvent({ type: "cron.tick", expression, timestamp: new Date() })`.

---

## 3. Routing DSL: `from().filter().via().to()`

Implement a small DSL to define routes similar to Camel, e.g. in `src/runtime/routes.ts`:

### 3.1. Filter helpers

Define some filter helpers for Nostr, pure functions:

```ts
export type FilterFn = (event: any) => boolean;

export function kind(...kinds: number[]): FilterFn {
  return (event) => kinds.includes(event.kind);
}

export function tag(key: string) {
  return {
    exists(): FilterFn {
      return (event) => Array.isArray(event.tags) && event.tags.some(([k]) => k === key);
    },
    equals(value: string): FilterFn {
      return (event) => Array.isArray(event.tags) &&
        event.tags.some(([k, v]) => k === key && v === value);
    },
  };
}
```

### 3.2. Processor functions

Assume existing processors are just functions `async (input) => output`. You don’t need to rewrite them, just chain them.

### 3.3. Route builder

Define a `RouteBuilder` with a `from(uri)` entry:

```ts
export interface RouteDefinition {
  from: string;                // source URI
  filters: FilterFn[];
  processors: Array<(payload: any) => Promise<any> | any>;
  to: string[];                // sink URIs
}

export function from(sourceUri: string) {
  const def: RouteDefinition = {
    from: sourceUri,
    filters: [],
    processors: [],
    to: [],
  };

  return {
    filter(fn: FilterFn) {
      def.filters.push(fn);
      return this;
    },
    via(processor: (payload: any) => Promise<any> | any) {
      def.processors.push(processor);
      return this;
    },
    to(targetUri: string) {
      def.to.push(targetUri);
      return this;
    },
    build() {
      return def;
    },
  };
}
```

---

## 4. Route runtime: connecting Components and routes

Implement a simple route engine in `src/runtime/engine.ts`:

* Input:

  * `componentRegistry: ComponentRegistry`
  * `routes: RouteDefinition[]`
  * `ctx: ComponentContext`

* For each route:

  1. Parse `def.from` into an `EndpointConfig` via `parseEndpoint`.
  2. Get the corresponding `Component` by `scheme`.
  3. Call `createConsumer(endpoint, ctx)`.
  4. For each `to` URI, parse and create a `Producer`.
  5. Build a `RouteInstance` that:

     * On `start()`, calls `consumer.start(handler)` where handler:

       * runs filters
       * runs processors (in sequence, can be async)
       * calls each `producer.send(payload)`.

Export something like:

```ts
export class RouteEngine {
  constructor(
    private components: ComponentRegistry,
    private routes: RouteDefinition[],
    private ctx: ComponentContext,
  ) {}

  startAll(): () => void {
    const stops: Array<() => void> = [];

    for (const def of this.routes) {
      const stop = this.startRoute(def);
      if (stop) stops.push(stop);
    }

    return () => stops.forEach((s) => s());
  }

  private startRoute(def: RouteDefinition): () => void {
    const sourceEndpoint = parseEndpoint(def.from);
    const component = this.components[sourceEndpoint.scheme];
    if (!component || !component.createConsumer) return () => {};

    const consumer = component.createConsumer(sourceEndpoint, this.ctx);

    const producers = def.to.map((uri) => {
      const ep = parseEndpoint(uri);
      const c = this.components[ep.scheme];
      if (!c || !c.createProducer) {
        return null;
      }
      return c.createProducer(ep, this.ctx);
    }).filter(Boolean) as Producer[];

    const handler = async (event: any) => {
      // filters
      for (const f of def.filters) {
        if (!f(event)) return;
      }

      // processors
      let payload: any = event;
      for (const p of def.processors) {
        if (payload == null) return;
        payload = await p(payload);
      }
      if (payload == null) return;

      // send to producers
      await Promise.all(producers.map((prod) => prod.send(payload)));
    };

    const stop = consumer.start(handler);
    return stop;
  }
}
```

---

## 5. High-level config (PoC) with Nostr + Email + Cron only

Create `src/nbd.config.ts` as an example:

```ts
import { defineConfig } from "./runtime/config";
import { createComponentRegistry } from "./runtime/registry";
import { nostrComponent } from "./components/nostr";
import { emailComponent } from "./components/email";
import { cronComponent } from "./components/cron";
import { from, kind, tag } from "./runtime/routes";

import mentionsToIntent from "./processors/mentionsToIntent";
import hourlyStatusIntent from "./processors/hourlyStatusIntent";

export default defineConfig({
  components: createComponentRegistry({
    nostr: nostrComponent({
      pools: {
        default: [
          "wss://relay.damus.io",
          "wss://nostr.wine",
        ],
        publicTimeline: [
          "wss://relay.damus.io",
        ],
      },
      defaultPool: "default",
      defaultMode: "fanout",
    }),
    email: emailComponent({
      smtpHost: process.env.SMTP_HOST!,
      smtpPort: 587,
      smtpUser: process.env.SMTP_USER!,
      smtpPass: process.env.SMTP_PASS!,
      defaultFrom: "nostr@example.com",
    }),
    cron: cronComponent({
      timezone: "UTC",
    }),
  }),

  routes: [
    // Nostr mentions -> email
    from("nostr:publicTimeline?kinds=1")
      .filter(tag("p").exists())
      .via(mentionsToIntent())
      .to("email:notifications?template=mention")
      .build(),

    // Cron -> hourly status on Nostr + email
    from("cron:0 * * * *")
      .via(hourlyStatusIntent())
      .to("nostr:publicTimeline?kind=1&keyRole=statusBot")
      .to("email:ops?subject=Hourly%20Status")
      .build(),
  ],
});
```

Also create a small `defineConfig` helper that just wraps this object and is used by the CLI entrypoint.

---

## 6. Entry point

Adapt the existing NBD entrypoint (e.g. `src/index.ts` or `src/cli.ts`) to:

1. Load `nbd.config.ts`.
2. Build the `ComponentContext` using existing runtime pieces (logger, keys, nostr client, scheduler, etc.).
3. Construct a `RouteEngine` with `components`, `routes`, `ctx`.
4. Call `startAll()` to:

   * connect to Nostr relay pools
   * start cron jobs
   * keep consuming events and sending emails.

---

### Deliverables

* New or updated files:

  * `src/runtime/components.ts`
  * `src/runtime/uri.ts`
  * `src/runtime/registry.ts`
  * `src/runtime/routes.ts`
  * `src/runtime/engine.ts`
  * `src/components/nostr.ts`
  * `src/components/email.ts`
  * `src/components/cron.ts`
  * `src/nbd.config.ts`
* Adapted entrypoint to run the new route engine.
* Reuse existing Nostr/email/cron utilities where possible.

Focus on a **working proof-of-concept** that:

* Subscribes to Nostr (Nostr component + consumer).
* Sends emails (Email component + producer).
* Triggers cron jobs (Cron component + consumer).
* Uses the `from(...).filter(...).via(...).to(...)` style with URIs and Components.

You do not need full production robustness; get a clean, readable structure and a minimal working example.
