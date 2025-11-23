import {
  createComponentRegistry,
  cronComponent,
  defineConfig,
  emailComponent,
  from,
  nostrComponent,
  tag,
} from "nostr-bridge-poc-core";
import createExpoPushPlugin from "./plugins/expoPushPlugin.js";
import hourlyStatusIntent from "./processors/hourlyStatusIntent.js";
import mentionsToIntent from "./processors/mentionsToIntent.js";

export default defineConfig({
  components: createComponentRegistry({
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
      defaultFrom: "nostr@example.com",
    }),
    cron: cronComponent({
      timezone: "UTC",
    }),
  }),
  plugins: [
    createExpoPushPlugin({
      accessToken: process.env.EXPOACCESSTOKEN || process.env.EXPO_ACCESS_TOKEN,
      pool: "default",
    }),
  ],
  routes: [
    from("nostr:publicTimeline?kinds=1")
      .filter(tag("p").exists())
      .via(mentionsToIntent())
      .to("email:notifications?template=mention"),

    from("cron:0 * * * *")
      .via(hourlyStatusIntent())
      .to("nostr:publicTimeline?kind=1&keyRole=statusBot")
      .to("email:ops?subject=Hourly%20Status"),
  ],
});
