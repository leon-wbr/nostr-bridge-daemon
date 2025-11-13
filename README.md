
<h2 align="center">📠 Nostr Bridge Daemon</h2>

<p align="center">
  <strong>Notes, Bridges & Deliveries – NBD</strong>
</p>

<p align="center">A unified, extensible runtime for Nostr-connected background services.</p>

<p align="center">
<a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
<a href="#"><img src="https://img.shields.io/badge/status-funding-orange.svg" alt="Status: Funding"></a>
<a href="#"><img src="https://img.shields.io/badge/contributions-welcome-brightgreen.svg" alt="Contributions welcome"></a>
</p>

## 🧭 Overview

**Nostr Bridge Daemon (NBD)** is an open-source runtime for building and running background daemons that connect to the Nostr protocol and network.

It provides a shared foundation for notifications, publishing pipelines, automation, and integrations — so applications no longer need to re-implement relay handling, event loops, or subscription logic.  

By standardizing a sort of bridge layer, NBD makes operating Nostr-connected services as simple as writing one plugin and running one command — fully self-hostable, developer-friendly, and ready for production.

## ⚙️ The Problem

Almost every Nostr-connected app ends up running one or more background daemons — long-lived processes that handle **push notifications, email delivery, webhooks, data syncing, and scheduled automation**. They’re essential for keeping services connected and responsive.

Meanwhile, many traditional apps also want to interact with Nostr — to publish or ingest data — but hesitate because integration feels heavy and error-prone. There’s no common foundation to rely on, just a growing pile of bespoke daemons scattered across the ecosystem.

Daemons are currently a mess – and it’s holding everyone back.

## 🚀 The Solution

**NBD** offers a modular, reusable daemon that collects the hard parts of Nostr connectivity and exposes a clean plugin model for reusable real-world integrations.

- Runs as a long-lived service managing relay sessions, retries, and filters.  
- Consolidates events into a shared **event bus** and routing layer.  
- Exposes a **typed JS/TS plugin interface** for small, focused modules.  

It is designed for bidirectional connectivity:

- **→ Outbound:** Stream selected events out to email, push, webhook, or analytics pipelines — connecting decentralized data to existing infrastructure.
- **→ Inbound:** Receive input from apps, servers, or other services and publish it back to Nostr as signed events through managed relay sessions.
  
Instead of reinventing the Nostr client stack, applications simply implement plugin logic — NBD handles the lower-level mechanics consistently and securely.

## 🧱 Initial Milestone

The first milestone is about establishing a solid, usable foundation — a working daemon, a clean SDK, and a few real-world examples that prove the concept.

- **Core Runtime** – Implement the essential infrastructure: event bus, plugin loader, and directional model for inbound/outbound connectivity.
- **Reference Plugins** – Deliver three ready-to-use bridges that demonstrate practical applications:
  - **Email Bridge** – Trigger notifications from Nostr events.  
  - **Push Bridge** – Forward Nostr activity to mobile or browser channels.  
  - **Webhook Bridge** – Send configurable HTTP requests based on event filters.  
- **Documentation & Examples** – Offer clear quick-start guides, integration patterns, and best practices for extending or self-hosting NBD.

This milestone ensures developers can install NBD, run it, and extend it confidently — turning the abstract idea of “a shared Nostr daemon” into a tangible, working tool.

## 🌍 Why It Matters

**NBD** provides shared infrastructure that strengthens the Nostr ecosystem and lowers the barrier for integration with existing technologies.

- **Reduces duplication** — one reliable runtime instead of countless ad-hoc daemons.  
- **Improves reliability** — concentrates proven patterns and operational best practices.  
- **Encourages decentralization** — fully self-hostable; no need to rely on centralized intermediaries.  
- **Accelerates integration** — makes it easy for traditional apps and services to connect with Nostr.  
- **Fosters collaboration** — a common plugin format encourages community-maintained bridges and shared innovation.  

My work with Nostr so far has centered on **helping traditional applications integrate smoothly** — providing developers and users with familiar, plug-and-play solutions that make the protocol more approachable.  

This project continues this effort by offering a simple way to handle data going in *and* out of Nostr.

While systems like email and push notifications may remain federated for the foreseeable future, NBD empowers developers, users and operators to **self-host** and **automate their own workflows**, maintaining sovereignty while still integrating with the wider ecosystem.

It also opens the door for **experimentation** — developers can test, publish, or consume Nostr data quickly, without refactoring existing codebases. This flexibility will help encourage adoption, improves interoperability, and helps the ecosystem mature organically.

## 💡 Example Use Cases

- **Email alerts:** send when specific authors post, when mentions or reactions occur.  
- **Push notifications:** route real-time updates to mobile or desktop devices.  
- **Webhooks:** forward Nostr events to existing infrastructures (billing, CRM, dashboards).  
- **Application sync:** mirror or enrich state between traditional apps and Nostr.  
- **Automation bots:** post or act based on rules and relay events.

## 📦 Project Status

**Stage:** Early design & implementation  

The core architecture and initial milestone scope are defined, and active development is underway on the **runtime**, **plugin API**, and **reference bridges**. The project is currently seeking funding to accelerate development and maintenance.  

An application has been submitted to the **OpenSats General Fund**, and additional **individual donations or sponsorships** are welcome to help sustain long-term progress.  

All contributions directly support open, decentralized infrastructure for the Nostr ecosystem.

**Bitcoin donations:**  `bc1qyfhctlzhf8adcn2fyrxchsnl89qswvcqmfph36`  

Feedback, collaboration, and design discussions are encouraged — join the conversation in this repository or reach out via Nostr or GitHub.

## 🤝 Get Involved

- **Developers:** contribute to the core runtime or create new plugins.  
- **Sponsors & Donors:** support development, testing, and long-term maintenance.

Your involvement helps turn NBD into a shared, reliable foundation for Nostr-connected services.  

## 📜 License

Licensed under the **MIT License** — permissive, open, and compatible with broad adoption.
