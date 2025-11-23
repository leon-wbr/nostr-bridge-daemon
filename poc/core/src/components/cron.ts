import { Component, ComponentContext, Consumer, EndpointConfig } from '../runtime/components.js';

export interface CronComponentOptions {
  timezone?: string;
}

type CronField = string;

const matchesField = (field: CronField, value: number): boolean => {
  if (field === '*') return true;

  const segments = field.split(',');
  return segments.some((segment) => {
    if (segment.startsWith('*/')) {
      const interval = Number(segment.slice(2));
      return Number.isFinite(interval) && interval > 0 && value % interval === 0;
    }
    const numeric = Number(segment);
    return Number.isFinite(numeric) && numeric === value;
  });
};

const matchesExpression = (expr: string, date: Date): boolean => {
  const [min, hour, dom, month, dow] = expr.trim().split(/\s+/, 5);
  if (!min || !hour || !dom || !month || !dow) return false;

  const minuteOk = matchesField(min, date.getMinutes());
  const hourOk = matchesField(hour, date.getHours());
  const domOk = matchesField(dom, date.getDate());
  const monthOk = matchesField(month, date.getMonth() + 1);
  const dowOk = matchesField(dow, date.getDay());

  return minuteOk && hourOk && domOk && monthOk && dowOk;
};

export function cronComponent(options: CronComponentOptions = {}): Component {
  return {
    createConsumer(endpoint: EndpointConfig, ctx: ComponentContext): Consumer {
      const expression = endpoint.path.trim();
      const log = ctx.logger || console;
      return {
        start(onEvent: (event: any) => void) {
          let timer: NodeJS.Timeout | null = null;
          let interval: NodeJS.Timeout | null = null;

          const tick = () => {
            const now = new Date();
            if (matchesExpression(expression, now)) {
              onEvent({ type: 'cron.tick', expression, timezone: options.timezone, timestamp: now });
            }
          };

          const startInterval = () => {
            tick();
            interval = setInterval(tick, 60 * 1000);
          };

          // align to the next minute boundary to avoid drift
          const delay = 60 * 1000 - (Date.now() % (60 * 1000));
          timer = setTimeout(startInterval, delay);
          log.log?.(`[cron] scheduled "${expression}" (tz=${options.timezone ?? 'local'})`);

          return () => {
            if (timer) clearTimeout(timer);
            if (interval) clearInterval(interval);
          };
        },
      };
    },
  };
}
