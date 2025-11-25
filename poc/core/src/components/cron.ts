import {
  Component,
  ComponentContext,
  Consumer,
  EndpointConfig,
} from "../runtime/components.js";

export interface CronComponentOptions {
  timezone?: string;
}

type CronField = string;

const matchesField = (field: CronField, value: number): boolean => {
  if (field === "*") return true;

  return field.split(",").some((segment) => {
    if (segment.startsWith("*/")) {
      const interval = Number(segment.slice(2));
      return (
        Number.isFinite(interval) && interval > 0 && value % interval === 0
      );
    }

    const numeric = Number(segment);
    return Number.isFinite(numeric) && numeric === value;
  });
};

const matchesExpression = (expr: string, date: Date): boolean => {
  const [min, hour, dom, month, dow] = expr.trim().split(/\s+/, 5);
  if (!min || !hour || !dom || !month || !dow) return false;

  return (
    matchesField(min, date.getMinutes()) &&
    matchesField(hour, date.getHours()) &&
    matchesField(dom, date.getDate()) &&
    matchesField(month, date.getMonth() + 1) &&
    matchesField(dow, date.getDay())
  );
};

export function cronComponent(options: CronComponentOptions = {}): Component {
  return {
    createConsumer(endpoint: EndpointConfig, ctx: ComponentContext): Consumer {
      const expression = endpoint.path.trim();
      const log = ctx.logger || console;
      const listeners = new Set<(event: any) => void>();
      let timer: NodeJS.Timeout | null = null;

      const emit = (event: any) => {
        for (const listener of Array.from(listeners)) {
          listener(event);
        }
      };

      const scheduleTick = () => {
        if (!listeners.size) {
          timer = null;
          return;
        }

        const now = new Date();
        log.log?.(
          `[cron:${expression}] evaluating at ${now.toISOString()} (tz=${
            options.timezone ?? "local"
          })`
        );

        if (matchesExpression(expression, now)) {
          const event = {
            type: "cron.tick",
            expression,
            timezone: options.timezone,
            timestamp: now,
          };
          emit(event);
        }

        const delay = 60 * 1000 - (now.getTime() % (60 * 1000));
        timer = setTimeout(scheduleTick, delay);
      };

      return {
        start(onEvent: (event: any) => void) {
          const wasEmpty = listeners.size === 0;
          listeners.add(onEvent);

          if (wasEmpty) {
            log.log?.(
              `[cron:${expression}] starting schedule (tz=${
                options.timezone ?? "local"
              })`
            );
            scheduleTick();
          }

          return () => {
            listeners.delete(onEvent);
            if (!listeners.size && timer) {
              clearTimeout(timer);
              timer = null;
              log.log?.(
                `[cron:${expression}] stopping schedule (tz=${
                  options.timezone ?? "local"
                })`
              );
            }
          };
        },
      };
    },
  };
}
