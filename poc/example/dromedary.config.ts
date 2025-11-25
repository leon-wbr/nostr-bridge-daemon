import {
  cronComponent,
  defineConfig,
  emailComponent,
  from,
  nostrComponent,
} from "@dromedary/poc-core";
import createExpoPushPlugin from "./plugins/expoPushPlugin.js";
import statusIntent from "./processors/statusIntent.js";

export default defineConfig({
  components: {
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
  },
  plugins: [
    createExpoPushPlugin({
      privateKey: process.env.EXPO_PRIVATE_KEY || "",
      accessToken: process.env.EXPO_ACCESS_TOKEN || "",
    }),
  ],
  routes: [
    from("cron:* * * * *")
      .process(statusIntent())
      .to("nostr:publicTimeline?kind=1")
      .to("email:ops?subject=Hourly%20Status"),
  ],
});
