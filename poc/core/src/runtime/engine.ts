import { parseEndpoint } from './uri.js';
import { Component, ComponentContext, EndpointConfig, Producer } from './components.js';
import { ComponentRegistry } from './registry.js';
import type { RouteDefinition } from './routes.js';

type EventHandler = (event: any) => void;

class SharedConsumerEntry {
  private listeners = new Set<EventHandler>();
  private cleanup: (() => void) | null = null;

  constructor(private readonly startConsumer: (handler: EventHandler) => () => void) {}

  add(listener: EventHandler): () => void {
    this.listeners.add(listener);
    if (!this.cleanup) {
      this.cleanup = this.startConsumer((event) => this.emit(event));
    }
    return () => {
      this.listeners.delete(listener);
      if (!this.listeners.size && this.cleanup) {
        this.cleanup();
        this.cleanup = null;
      }
    };
  }

  private emit(event: any) {
    for (const listener of Array.from(this.listeners)) {
      listener(event);
    }
  }
}

export class RouteEngine {
  private readonly producerCache = new Map<string, Producer>();
  private readonly consumerCache = new Map<string, SharedConsumerEntry>();

  constructor(
    private readonly components: ComponentRegistry,
    private readonly routes: RouteDefinition[],
    private readonly ctx: ComponentContext,
    private readonly logger: Console,
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
      if (!component || !component.createConsumer) {
        this.logger.warn?.(`no consumer available for scheme "${sourceEndpoint.scheme}"`);
      return () => {};
    }

    const consumerKey = this.createEndpointKey(sourceEndpoint);
    const entry = this.getOrCreateSharedConsumer(consumerKey, component, sourceEndpoint);

    const producers = def.targets
      .map((uri) => {
        const ep = parseEndpoint(uri);
        const targetComponent = this.components[ep.scheme];
          if (!targetComponent || !targetComponent.createProducer) {
            this.logger.warn?.(`no producer available for scheme "${ep.scheme}"`);
          return null;
        }
        const key = this.createEndpointKey(ep);
        if (!this.producerCache.has(key)) {
          this.producerCache.set(key, targetComponent.createProducer(ep, this.ctx));
        }
        return this.producerCache.get(key)!;
      })
      .filter(Boolean) as Producer[];

    const handler = async (event: any) => {
      try {
        for (const f of def.filters) {
          if (!f(event)) return;
        }

        let payload: any = event;
        for (const processor of def.processors) {
          if (payload == null) return;
          payload = await processor(payload);
        }
        if (payload == null) return;

        const payloads = Array.isArray(payload) ? payload : [payload];
        if (!payloads.length) return;

        for (const item of payloads) {
          await Promise.all(producers.map((prod) => prod.send(item)));
        }
      } catch (err) {
        this.logger.error?.(`route error: ${(err as Error).message}`);
      }
    };

    const stop = entry.add(handler);
    return stop;
  }

  private getOrCreateSharedConsumer(
    key: string,
    component: Component,
    endpoint: EndpointConfig,
  ): SharedConsumerEntry {
    const existing = this.consumerCache.get(key);
    if (existing) return existing;

    const createConsumer = component.createConsumer!;
    const consumer = createConsumer(endpoint, this.ctx);
    const entry = new SharedConsumerEntry((handler) => consumer.start(handler));
    this.consumerCache.set(key, entry);
    return entry;
  }

  private createEndpointKey(endpoint: EndpointConfig): string {
    const query = Object.keys(endpoint.query)
      .sort()
      .map((key) => {
        const value = endpoint.query[key];
        const normalized = Array.isArray(value) ? value.join(',') : value;
        return `${key}=${normalized}`;
      })
      .join('&');
    return `${endpoint.scheme}:${endpoint.path}?${query}`;
  }
}
