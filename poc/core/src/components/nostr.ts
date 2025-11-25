import WebSocket from "ws";
import {
  finalizeEvent,
  type Event as NostrEvent,
  type Filter,
} from "nostr-tools";
import { Relay, useWebSocketImplementation } from "nostr-tools/relay";
import { hexToBytes } from "@noble/hashes/utils";
import {
  Component,
  ComponentContext,
  Consumer,
  EndpointConfig,
  Producer,
} from "../runtime/components.js";

useWebSocketImplementation(WebSocket);

export interface NostrPoolConfig {
  [poolName: string]: string[];
}

export type PublishMode = "fanout" | "first-success" | "quorum";

export interface NostrComponentOptions {
  pools: NostrPoolConfig;
  defaultPool?: string;
  defaultMode?: PublishMode;
}

const asArray = (value: string | string[] | undefined): string[] => {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
};

const toNumbers = (values: string[]): number[] =>
  values
    .join(",")
    .split(",")
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v));

const createPoolLogger = (log: Console, poolName: string) => {
  const prefix = `[nostr:${poolName}]`;
  return {
    log: (message: string) => log.log?.(`${prefix} ${message}`),
    info: (message: string) => log.info?.(`${prefix} ${message}`),
    warn: (message: string) => log.warn?.(`${prefix} ${message}`),
    error: (message: string) => log.error?.(`${prefix} ${message}`),
  };
};

const describeFilters = (filters: Filter[]): string => {
  const kinds: number[] = [];
  for (const filter of filters) {
    if (Array.isArray(filter.kinds)) kinds.push(...filter.kinds);
  }
  return kinds.length ? `kinds=${[...new Set(kinds)].join(",")}` : "all";
};
const resolvePoolName = (
  endpoint: EndpointConfig,
  opts: NostrComponentOptions
): string | null => {
  if (endpoint.path) return endpoint.path;
  if (opts.defaultPool) return opts.defaultPool;
  const pools = Object.keys(opts.pools ?? {});
  return pools.length ? pools[0] : null;
};

const parsePublishMode = (
  endpoint: EndpointConfig,
  opts: NostrComponentOptions
): PublishMode =>
  (asArray(
    endpoint.query.mode as string | string[] | undefined
  )[0] as PublishMode) ||
  opts.defaultMode ||
  "fanout";

const isNostrEvent = (payload: any): payload is NostrEvent =>
  payload &&
  typeof payload === "object" &&
  typeof payload.kind === "number" &&
  typeof payload.sig === "string";

class RelayPool {
  private ready: Promise<Relay[]> | null = null;

  constructor(
    private readonly name: string,
    private readonly urls: string[],
    private readonly log: Console
  ) {}

  private async connect(): Promise<Relay[]> {
    if (!this.ready) {
      this.ready = Promise.all(
        this.urls.map(async (url) => {
          try {
            const relay = await Relay.connect(url);
            relay.onnotice = (msg: string) =>
              this.log.info?.(
                `[nostr:${this.name}] notice from ${url}: ${msg}`
              );
            relay.onclose = () =>
              this.log.info?.(`[nostr:${this.name}] relay closed ${url}`);
            this.log.log?.(`[nostr:${this.name}] connected -> ${url}`);
            return relay;
          } catch (err) {
            this.log.warn?.(
              `[nostr:${this.name}] failed to connect ${url}: ${
                (err as Error).message
              }`
            );
            return null;
          }
        })
      ).then((list) => list.filter(Boolean) as Relay[]);
    }
    return this.ready;
  }

  async subscribe(
    filters: Filter[],
    onEvent: (event: NostrEvent) => void
  ): Promise<() => void> {
    const relays = await this.connect();
    const label = `dromedary-${this.name}-${Date.now()}`;
    const subs = relays.map((relay) =>
      relay.subscribe(filters, {
        label,
        onevent: (raw: NostrEvent) => onEvent(raw),
      })
    );

    return () => subs.forEach((sub) => sub.close());
  }

  async publish(
    event: NostrEvent,
    mode: PublishMode = "fanout"
  ): Promise<void> {
    const relays = await this.connect();
    if (!relays.length)
      throw new Error(`no relays available for pool ${this.name}`);

    if (mode === "first-success") {
      for (const relay of relays) {
        try {
          await relay.publish(event);
          return;
        } catch (err) {
          this.log.warn?.(
            `[nostr:${this.name}] publish failed on ${relay.url}: ${
              (err as Error).message
            }`
          );
        }
      }
      throw new Error(`publish failed on all relays for pool ${this.name}`);
    }

    const results = await Promise.allSettled(
      relays.map((relay) => relay.publish(event))
    );
    const ok = results.filter((r) => r.status === "fulfilled").length;
    this.log.log?.(
      `[nostr:${this.name}] publish ${ok}/${relays.length} relays (mode=${mode})`
    );
  }
}

const buildFilters = (endpoint: EndpointConfig): Filter[] => {
  const kinds = toNumbers(asArray(endpoint.query.kinds));
  return [{ kinds: kinds.length ? kinds : undefined }];
};

const resolveKey = (ctx: ComponentContext): Uint8Array | null => {
  const rawKey = ctx.keys?.default ?? null;
  if (!rawKey) return null;
  if (rawKey instanceof Uint8Array) return rawKey;
  const hex = rawKey.startsWith("0x") ? rawKey.slice(2) : rawKey;
  return hexToBytes(hex);
};

export function nostrComponent(options: NostrComponentOptions): Component {
  const pools = new Map<string, RelayPool>();

  const getPool = (name: string | null, log: Console): RelayPool | null => {
    if (!name) return null;
    const existing = pools.get(name);
    if (existing) return existing;
    const urls = options.pools[name];
    if (!urls) return null;
    const created = new RelayPool(name, urls, log);
    pools.set(name, created);
    return created;
  };

  return {
    createConsumer(endpoint: EndpointConfig, ctx: ComponentContext): Consumer {
      const poolName = resolvePoolName(endpoint, options);
      const log = ctx.logger || console;
      const pool = getPool(poolName, log);
      const filters = buildFilters(endpoint);
      const poolLogger = createPoolLogger(log, poolName ?? "missing-pool");
      const filtersLabel = describeFilters(filters);

      if (!pool) {
        poolLogger.warn("pool not found");
        return {
          start: () => () => {},
        };
      }

      return {
        start(onEvent: (event: any) => void) {
          let cleanup: (() => void) | null = null;
          let stopped = false;

          const subscribe = async () => {
            poolLogger.log(`consumer subscribing (${filtersLabel})`);
            cleanup = await pool.subscribe(filters, (evt) => {
              onEvent(evt);
            });
            if (stopped && cleanup) {
              cleanup();
            }
          };

          subscribe().catch((err: Error) =>
            poolLogger.error(`consumer error: ${(err as Error).message}`)
          );

          return () => {
            stopped = true;
            if (cleanup) {
              cleanup();
              cleanup = null;
            }
            poolLogger.log("consumer stopped");
          };
        },
      };
    },

    createProducer(endpoint: EndpointConfig, ctx: ComponentContext): Producer {
      const poolName = resolvePoolName(endpoint, options);
      const log = ctx.logger || console;
      const pool = getPool(poolName, log);
      const defaultKind = toNumbers(asArray(endpoint.query.kind))[0];
      const publishMode = parsePublishMode(endpoint, options);
      const poolLogger = createPoolLogger(log, poolName ?? "missing-pool");

      if (!pool) {
        poolLogger.warn("pool not found");
        return {
          async send() {},
        };
      }

      return {
        async send(payload: any) {
          let event: NostrEvent | null = null;

          if (isNostrEvent(payload)) {
            event = payload;
            poolLogger.log(
              `using supplied event kind=${event.kind} mode=${publishMode}`
            );
          } else {
            const key = resolveKey(ctx);
            if (!key) {
              poolLogger.warn("missing signing key (set ctx.keys.default)");
              return;
            }

            const content =
              typeof payload === "string"
                ? payload
                : payload?.content || JSON.stringify(payload, null, 2);
            const tags = Array.isArray(payload?.tags) ? payload.tags : [];
            const template = {
              kind: payload?.kind ?? defaultKind ?? 1,
              content,
              tags,
              created_at: payload?.created_at ?? Math.floor(Date.now() / 1000),
            };
            event = finalizeEvent(template, key);
            poolLogger.log(
              `generated emit kind=${event.kind} mode=${publishMode} tags=${tags.length}`
            );
          }

          if (!event) return;
          await pool.publish(event, publishMode);
        },
      };
    },
  };
}
