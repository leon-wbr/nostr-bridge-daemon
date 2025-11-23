import { parseEndpoint } from './uri.js';
import { ComponentContext, Producer } from './components.js';
import { ComponentRegistry } from './registry.js';
import type { RouteDefinition } from './routes.js';

export class RouteEngine {
  constructor(
    private readonly components: ComponentRegistry,
    private readonly routes: RouteDefinition[],
    private readonly ctx: ComponentContext,
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
      this.ctx.logger.warn?.(`no consumer available for scheme "${sourceEndpoint.scheme}"`);
      return () => {};
    }

    const consumer = component.createConsumer(sourceEndpoint, this.ctx);

    const producers = def.to
      .map((uri) => {
        const ep = parseEndpoint(uri);
        const targetComponent = this.components[ep.scheme];
        if (!targetComponent || !targetComponent.createProducer) {
          this.ctx.logger.warn?.(`no producer available for scheme "${ep.scheme}"`);
          return null;
        }
        return targetComponent.createProducer(ep, this.ctx);
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
        this.ctx.logger.error?.(`route error: ${(err as Error).message}`);
      }
    };

    const stop = consumer.start(handler);
    return stop;
  }
}
