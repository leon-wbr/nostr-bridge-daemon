import {
  matchFilter,
  type Event as NostrEvent,
  type Filter,
} from "nostr-tools";
import * as nip04 from "nostr-tools/nip04";
import {
  from,
  nostrComponent,
  type ComponentRegistry,
  type DromedaryRuntimeConfig,
  type PluginRegistrationContext,
} from "@dromedary/poc-core";

const KindAppData = 10395;

type ExpoPushMessage = {
  to: string[];
  title: string;
  body: string;
};

type ExpoComponentOptions = {
  accessToken?: string;
  endpoint?: string;
};

type ExpoPushPluginOptions = {
  privateKey: string;
  accessToken?: string;
  pool?: string;
  matchKinds?: number[];
  tokens?: string[];
  relays?: string[];
  title?: string;
};

const truncate = (text: string, max = 80) => {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
};

const expoComponent = (opts: ExpoComponentOptions = {}) => {
  const endpoint = opts.endpoint || "https://exp.host/--/api/v2/push/send";
  const accessToken = opts.accessToken;

  type FetchLike = (
    input: string | URL,
    init?: any
  ) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;
  const fetchFn: FetchLike | undefined = (globalThis as any).fetch;

  return {
    createProducer(_endpoint: any) {
      return {
        async send(payload: any) {
          const messages: ExpoPushMessage[] = Array.isArray(payload)
            ? payload
            : [payload];
          if (!messages.length) return;

          if (!fetchFn) {
            console.warn(
              "[expo] fetch is not available in this runtime; cannot send push"
            );
            return;
          }

          for (const msg of messages) {
            const tokens = Array.isArray(msg.to) ? msg.to : [msg.to];
            if (!tokens.length) continue;

            const body = {
              to: tokens,
              title: msg.title,
              body: msg.body,
              data: {},
            };

            const res = await fetchFn(endpoint, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(accessToken
                  ? { Authorization: `Bearer ${accessToken}` }
                  : {}),
              },
              body: JSON.stringify(body),
            });

            if (!res.ok) {
              const text = await res.text();
              console.warn(`[expo] push failed (${res.status}): ${text}`);
            }
          }
        },
      };
    },
  };
};

const describeEvent = (event: NostrEvent) =>
  `kind=${event.kind} id=${event.id ?? "unknown"} sender=${event.pubkey}`;

const normalizeTokens = (opts: ExpoPushPluginOptions): string[] => {
  if (opts.tokens && opts.tokens.length) return opts.tokens;
  const env = process.env.EXPO_PUSH_TOKENS || "";
  return env
    .split(",")
    .map((token) => token.trim())
    .filter((token) => !!token);
};

export const createExpoPushPlugin = (opts: ExpoPushPluginOptions) => {
  const pool = opts.pool || "default";
  const matchKinds = opts.matchKinds || [1];
  const tokens = normalizeTokens(opts);
  const title = opts.title || "New Nostr event";

  const filtersByPubkey = new Map<string, Filter[]>();
  const tokensByPubkey = new Map<string, string[]>();

  const decryptAppData = async (event: NostrEvent): Promise<string | null> => {
    const keyMaterial = opts.privateKey;
    try {
      const decrypted = nip04.decrypt(keyMaterial, event.pubkey, event.content);
      return decrypted;
    } catch (err) {
      console.error(
        `[expo plugin] failed to decrypt appData ${describeEvent(event)}:`,
        err
      );
      return null;
    }
  };

  const ingestAppData = async (event: NostrEvent) => {
    if (event.kind !== KindAppData) return null;
    const decrypted = await decryptAppData(event);
    if (!decrypted) return;

    const payload = JSON.parse(decrypted || "{}");
    if (Array.isArray(payload.filters)) {
      const parsed = payload.filters
        .map((entry: any) => entry?.filter)
        .filter(Boolean) as Filter[];
      filtersByPubkey.set(event.pubkey, parsed);
      console.info(
        `[expo plugin] stored ${parsed.length} filters from ${event.pubkey}`
      );
    }
    if (Array.isArray(payload.tokens)) {
      tokensByPubkey.set(
        event.pubkey,
        payload.tokens.filter(
          (value: unknown): value is string => typeof value === "string"
        )
      );
      console.info(
        `[expo plugin] stored ${
          tokensByPubkey.get(event.pubkey)?.length ?? 0
        } tokens for ${event.pubkey}`
      );
    }
  };

  const buildPushes = (event: NostrEvent) => {
    if (!tokens.length && tokensByPubkey.size === 0) return [];

    const messages: ExpoPushMessage[] = [];
    const emitTokens = tokens.slice();
    const body = truncate(event.content || "");

    for (const [pubkey, filters] of filtersByPubkey.entries()) {
      if (!filters.length) continue;
      const matched = filters.some((filter) => matchFilter(filter, event));
      if (!matched) continue;
      const tokensForPubkey = tokensByPubkey.get(pubkey) ?? [];
      if (!tokensForPubkey.length) continue;

      messages.push({
        to: [...emitTokens, ...tokensForPubkey],
        title: `${title} (kind=${event.kind})`,
        body,
      });
    }

    if (!messages.length && emitTokens.length) {
      messages.push({
        to: emitTokens,
        title: `${title} (kind=${event.kind})`,
        body,
      });
    }

    return messages;
  };

  return (_ctx: PluginRegistrationContext, config: DromedaryRuntimeConfig) => {
    const contribComponents: ComponentRegistry = {
      expo: expoComponent({ accessToken: opts.accessToken }),
    };

    if (!config.components?.nostr) {
      contribComponents.nostr = nostrComponent({
        pools: {
          [pool]:
            opts.relays && opts.relays.length
              ? opts.relays
              : ["wss://relay.damus.io"],
        },
        defaultPool: pool,
      });
    }

    return {
      components: contribComponents,
      routes: [
        from(`nostr:${pool}?kinds=${KindAppData}`).process(ingestAppData),

        from(`nostr:${pool}?kinds=${matchKinds.join(",")}`)
          .process(buildPushes)
          .to("expo:push"),
      ],
    };
  };
};

export default createExpoPushPlugin;
