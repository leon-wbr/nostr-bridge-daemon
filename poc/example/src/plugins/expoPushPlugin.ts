import { matchFilter, type Event as NostrEvent, type Filter } from 'nostr-tools';
import { Component, EndpointConfig } from 'nostr-bridge-poc-core';
import { from } from 'nostr-bridge-poc-core';

const KindAppData = 10395;

type PushToken = string;

type ExpoPushMessage = {
  to: string[];
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

type ExpoComponentOptions = {
  accessToken?: string;
  endpoint?: string;
};

const truncate = (text: string, max = 80) => {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
};

const plusCodeFromTags = (event: NostrEvent): string => {
  for (const tag of event.tags || []) {
    if (Array.isArray(tag) && (tag[0] === '#l' || tag[0] === 'l') && typeof tag[1] === 'string') {
      if (tag.length >= 3 && typeof tag[2] === 'string' && tag[2].toLowerCase() === 'open-location-code') {
        return tag[1];
      }
      return tag[1];
    }
  }
  return 'unknown';
};

const parseFilters = (event: NostrEvent): Filter[] => {
  try {
    const content = JSON.parse(event.content || '{}');
    if (!Array.isArray(content.filters)) return [];
    return content.filters
      .map((f: any) => f?.filter)
      .filter(Boolean)
      .map((raw: unknown) => {
        try {
          if (typeof raw === 'string') return JSON.parse(raw) as Filter;
          return raw as Filter;
        } catch {
          return null;
        }
      })
      .filter(Boolean) as Filter[];
  } catch {
    return [];
  }
};

const parseTokens = (event: NostrEvent): PushToken[] => {
  try {
    const content = JSON.parse(event.content || '{}');
    if (!Array.isArray(content.tokens)) return [];
    return content.tokens
      .map((raw: any) => {
        if (typeof raw === 'string') return raw;
        if (raw?.expoPushToken && typeof raw.expoPushToken === 'string') return raw.expoPushToken;
        return null;
      })
      .filter(Boolean) as string[];
  } catch {
    return [];
  }
};

const expoComponent = (opts: ExpoComponentOptions = {}): Component => {
  const endpoint = opts.endpoint || 'https://exp.host/--/api/v2/push/send';
  const accessToken = opts.accessToken || process.env.EXPOACCESSTOKEN || process.env.EXPO_ACCESS_TOKEN;

  type FetchLike = (input: string | URL, init?: any) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;
  const fetchFn: FetchLike | undefined = (globalThis as any).fetch;

  return {
    createProducer(_endpoint: EndpointConfig): { send: (payload: any) => Promise<void> } {
      return {
        async send(payload: any) {
          const messages: ExpoPushMessage[] = Array.isArray(payload) ? payload : [payload];
          if (!messages.length) return;

          for (const msg of messages) {
            const tokens = Array.isArray(msg.to) ? msg.to : [msg.to];
            if (!tokens.length) continue;

            if (!fetchFn) {
              console.warn('[expo] fetch is not available in this runtime; cannot send push');
              continue;
            }

            const body = {
              to: tokens,
              title: msg.title,
              body: msg.body,
              data: msg.data,
            };

            const res = await fetchFn(endpoint, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
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

export type ExpoPushPluginOptions = {
  accessToken?: string;
  pool?: string;
  matchKinds?: number[];
};

export const createExpoPushPlugin = (opts: ExpoPushPluginOptions = {}) => {
  const filtersByPubkey = new Map<string, Filter[]>();
  const tokensByPubkey = new Map<string, string[]>();
  const pool = opts.pool || 'default';
  const matchKinds = opts.matchKinds || [1, 6, 7];

  const ingestAppData = async (event: NostrEvent) => {
    if (event.kind !== KindAppData) return null;
    const filters = parseFilters(event);
    const tokens = parseTokens(event);
    if (filters.length) filtersByPubkey.set(event.pubkey, filters);
    if (tokens.length) tokensByPubkey.set(event.pubkey, tokens);
    return null;
  };

  const matchAndBuildPushes = async (event: NostrEvent) => {
    const messages: ExpoPushMessage[] = [];

    for (const [pubkey, filters] of filtersByPubkey.entries()) {
      if (!filters.length) continue;
      const tokens = tokensByPubkey.get(pubkey) || [];
      if (!tokens.length) continue;

      const matched = filters.some((f) => matchFilter(f, event));
      if (!matched) continue;

      const plusCode = plusCodeFromTags(event);
      messages.push({
        to: tokens,
        title: `New note in plus code ${plusCode}`,
        body: truncate(event.content || ''),
        data: { event },
      });
    }

    return messages;
  };

  return (_ctx: any) => ({
    components: {
      expo: expoComponent({ accessToken: opts.accessToken }),
    },
    routes: [
      from(`nostr:${pool}?kinds=${KindAppData}`).via(ingestAppData),
      from(`nostr:${pool}?kinds=${matchKinds.join(',')}`)
        .via(matchAndBuildPushes)
        .to('expo:push'),
    ],
  });
};

export default createExpoPushPlugin;
