
<h2 align="center">🐪 Dromedary</h2>

<p align="center">
  <strong>Connect, transform, and deliver events.</strong>
</p>

<p align="center">A unified, extensible runtime for Nostr-connected background services.</p>

<p align="center">
<a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
<a href="#"><img src="https://img.shields.io/badge/status-funding-orange.svg" alt="Status: Funding"></a>
<a href="#"><img src="https://img.shields.io/badge/contributions-welcome-brightgreen.svg" alt="Contributions welcome"></a>
</p>

## 🧭 Overview

**Dromedary** is an open-source runtime for building long-lived background processes that connect different protocols and/or services (Nostr ↔ Email ↔ Push Notifications), inspired by Apache Camel.

It provides a shared foundation for components (publishers and consumers), routing with an easy to understand DSL, idempotency helpers and a runtime engine that glues it all together. It also allows for plugins to quickly configure common patterns for popular daemons.

By standardizing this bridge layer, Dromedary helps connect distributed systems or protocols. Its primary focus is to make operating Nostr-connected services as simple as defining a route – fully self-hostable, developer-friendly and ready for production.

## 💡 Example

```ts
// dromedary.config.ts
import {
  cronComponent,
  defineConfig,
  emailComponent,
  from,
  nostrComponent,
  tag,
} from "@dromedary/poc-core";
import statusIntent from "./processors/statusIntent.js";
import mentionsToIntent from "./processors/mentionsToIntent.js";

export default defineConfig({
  components: {
    nostr: nostrComponent({
      pools: {
        default: ["wss://relay.damus.io", "wss://nostr.wine"],
        publicTimeline: ["wss://relay.damus.io"],
      },
      defaultPool: "default",
      defaultMode: "fanout",
    }),

    email: emailComponent({
      smtpHost: process.env.SMTP_HOST || "smtp.example.com",
      smtpPort: 587,
      smtpUser: process.env.SMTP_USER || "",
      smtpPass: process.env.SMTP_PASS || "",
      defaultFrom: "do-not-reply@example.com",
    }),

    cron: cronComponent({
      timezone: "UTC",
    }),
  },

  plugins: [
    createExpoPushPlugin({
      accessToken: process.env.EXPOACCESSTOKEN || process.env.EXPO_ACCESS_TOKEN,
      pool: "default",
    }),
  ],

  routes: [
    // 1) Mentions → intent → email notification
    from("nostr:publicTimeline?kinds=1")
      .filter(tag("p").exists())
      .process(mentionsToIntent())
      .to("email:notifications?template=mention"),

    // 2) Status tick → publish note + email ops
    from("* * * * *")
      .process(statusIntent())
      .to("nostr:publicTimeline?kind=1")
      .to("email:ops?subject=Hourly%20Status"),
  ],
});

```

Run the service with `dromedary run`, which looks for `dromedary.config.[cm]js` (or `.ts`) in the current directory, or pass `--config <file>`.

## ⚙️ The Problem

Almost every Nostr-connected app ends up running one or more background daemons — long-lived processes that handle **push notifications, email delivery, webhooks, data syncing, and scheduled automation**. They’re essential for keeping services connected and responsive.

Meanwhile, many traditional apps also want to interact with Nostr — to publish or ingest data — but hesitate because integration feels heavy and error-prone. There’s no common foundation to rely on, just a growing pile of bespoke daemons scattered across the ecosystem.

Daemons are currently a mess – and it’s holding everyone back.

## 🚀 The Solution

**Dromedary** offers a modular, reusable daemon that collects the hard parts of Nostr connectivity and exposes a clean plugin model for reusable real-world integrations.

- Runs as a long-lived service managing routing between all kinds of consumers and publishers.
- The Nostr component handles relay subscriptions, retries and filters automatically and centrally.
- Exposes a **typed JS/TS plugin interface** for small, focused modules.  

The Component pattern allows for all kinds of flows to be defined:

- **Publishers** →  Stream selected events out to email, push, webhook, or analytics pipelines — connecting decentralized data to existing infrastructure.
- **Consumers** →  Receive input from apps, servers, or other services and publish it back to Nostr as signed events through managed relay sessions.

Instead of rewriting custom adapters every time, or opening many different subscriptions, the logic and data can be shared now; more efficiently and at a glance.

## 🧱 Initial Milestone

The first milestone focuses on establishing a solid and extensible foundation for Dromedary with a clean plugin model and a set of practical, working components.

### Core Runtime

Build the essential architecture required:

- **Event Bus** – unified internal pipeline for all messages
- **Routing DSL** – expressive, chainable from(), transform(), to() routes
- **Component System** – pluggable endpoints for consuming and producing events
- **Plugin Loader** – dynamically load user-defined components and routes
- **Idempotency & Filtering** – opt-in duplicate suppression and message guards

### Reference Components

Ship several built-in components that demonstrate how the system works in practice:

* **Nostr Component** – consume and publish events through managed relay connections
* **Email Component** – send email notifications or deliver templated outbound messages
* **Cron Component** – schedule periodic triggers, timers, and automated pipelines

These components will serve as real-world examples for building integrations using the Dromedary model.

### Documentation & Examples

Provide developer-friendly resources:

- Quick-start templates for defining routes
- Example integrations (Nostr → Email, Cron → Webhook, etc.)
- Best practices for designing plugins and components
- Guides for self-hosting, extending, and customizing Dromedary

This milestone ensures that developers can install Dromedary, configure, extend, and use it in real-world situations – building a community around it that helps maintain it long-term.

## 🌍 Why It Matters

**Dromedary** provides shared infrastructure that strengthens the Nostr ecosystem and lowers the barrier for integration with existing technologies.

My work with Nostr so far has centered on **helping traditional applications integrate smoothly** — providing developers and users with familiar, plug-and-play solutions that make the protocol more approachable. This project continues this effort by offering a simple way to handle data going in *and* out of Nostr.

While systems like email and push notifications likely remain federated for the foreseeable future, Dromedary empowers developers, users and operators to start this process by defining it, **self-hosting** nodes and **automating their own workflows** – to maintain sovereignty while still integrating with the wider ecosystem.

It also opens the door for experimentation — developers can test, publish, or consume Nostr data quickly, without refactoring existing codebases. This flexibility will help encourage adoption, improves interoperability, and helps the ecosystem mature organically.

An additional benefit is that Dromedary is not Nostr-exclusive and can be used for a variety of other applications.

## 📦 Project Status

**Stage:** Early design & implementation  

The core architecture and initial milestone scope are being defined, and active development is underway. The project is currently seeking funding to accelerate development and maintenance.

An application has been submitted to the **OpenSats General Fund**, and additional **individual donations or sponsorships** are welcome to help sustain long-term progress.

All contributions directly support open, decentralized infrastructure for the Nostr ecosystem.

**Bitcoin donations:**  `bc1qgjmpgwj4e3sr94axl9mrq7hqj8p8wu36rjdmp5`  

**Lightning donations:** `VJLEAek5HEb5YMuf3Mue5Hvxxth7FHKyUHQQqYGi9bYFH8ghpnGNmdWFHQ2Y3Rbpcn9dMkv3boGSpDA7`

Feedback, collaboration, and design discussions are encouraged — join the conversation in this repository or reach out via Nostr or GitHub.

## 🤝 Get Involved

- **Developers:** contribute to the core runtime or create new components and plugins.  
- **Sponsors & Donors:** support development, testing, and long-term maintenance.

Your involvement helps turn Dromedary into a shared, reliable foundation for Nostr-connected services.  

## ❗ PoC Drawbacks

- The built-in Nostr component is still basic—it keeps pools of relays but doesn’t yet handle deduplication, adaptive retries, or smart filter management.
- There is no “real” functionality yet; the current build is for experimentation, documentation, and verifying plumbing. Advanced features and production-hardening remain future work.
- Expo Push example relies on NIP-4 for decrypting app data, which is unrecommended in favor of NIP-17.

## 📜 License

Licensed under the **MIT License** — permissive, open, and compatible with broad adoption.
