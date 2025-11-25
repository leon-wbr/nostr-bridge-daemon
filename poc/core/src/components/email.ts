import {
  Component,
  ComponentContext,
  EndpointConfig,
  Producer,
} from "../runtime/components.js";

export interface EmailComponentOptions {
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  defaultFrom: string;
}

const asArray = (value: string | string[] | undefined): string[] => {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
};

const coalesce = (...values: Array<string | undefined>): string | undefined =>
  values.find((val) => val !== undefined && val !== null && val !== "");

export function emailComponent(options: EmailComponentOptions): Component {
  return {
    createProducer(endpoint: EndpointConfig, ctx: ComponentContext): Producer {
      const channel = endpoint.path || "default";
      const queryConfig = endpoint.query;
      const log = ctx.logger || console;

      return {
        async send(payload: any) {
          const to = asArray(payload?.to || queryConfig.to);
          const subject =
            coalesce(
              payload?.subject,
              queryConfig.subject as string,
              queryConfig.template as string
            ) || `Dromedary notification (${channel})`;
          const body =
            payload?.body ||
            payload?.content ||
            (payload
              ? JSON.stringify(payload, null, 2)
              : "No payload provided");
          const from = payload?.from || queryConfig.from || options.defaultFrom;

          const message = { to, subject, body, from };

          if (ctx.emailSender) {
            await ctx.emailSender(message, { channel, options });
            return;
          }

          log.log?.(
            `[email:${channel} -> ${
              to.join(", ") || "unspecified"
            }] subject: ${subject} | body: ${body}`
          );
        },
      };
    },
  };
}
