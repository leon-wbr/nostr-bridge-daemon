import type { ComponentRegistry } from "./registry.js";
import type { RouteDefinition } from "./routes.js";
import { from, kind, tag } from "./routes.js";

export type DromedaryRuntimeConfig = {
  components?: ComponentRegistry;
  routes?: RouteDefinition[];
  plugins?: DromedaryPlugin[];
};

export type PluginRegistrationContext = {
  from: typeof from;
  kind: typeof kind;
  tag: typeof tag;
};

export type PluginContribution = {
  components?: ComponentRegistry;
  routes?: RouteDefinition[];
};

export type DromedaryPlugin =
  | PluginContribution
  | ((
      ctx: PluginRegistrationContext,
      config: DromedaryRuntimeConfig
    ) => PluginContribution);

export const defineConfig = (
  config: DromedaryRuntimeConfig
): DromedaryRuntimeConfig => {
  const pluginCtx: PluginRegistrationContext = { from, kind, tag };
  const contributions = (config.plugins ?? []).map((plugin) =>
    typeof plugin === "function" ? plugin(pluginCtx, config) : plugin
  );

  const mergedComponents: ComponentRegistry = { ...config.components };
  for (const contrib of contributions) {
    if (contrib.components) {
      Object.assign(mergedComponents, contrib.components);
    }
  }

  const mergedRoutes: RouteDefinition[] = [...(config.routes ?? [])];
  for (const contrib of contributions) {
    if (contrib.routes) mergedRoutes.push(...contrib.routes);
  }

  return { ...config, components: mergedComponents, routes: mergedRoutes };
};
