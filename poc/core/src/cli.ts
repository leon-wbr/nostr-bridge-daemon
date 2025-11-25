#!/usr/bin/env ts-node
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import type { ComponentContext } from "./runtime/components.js";
import type { DromedaryRuntimeConfig } from "./runtime/config.js";
import { RouteEngine } from "./runtime/engine.js";

type CliArgs = {
  command: string | null;
  configPath: string | null;
  showHelp: boolean;
};

type MaybeConfigFn<T> = T | (() => T | Promise<T>);

const CONFIG_CANDIDATES = [
  "dromedary.config.js",
  "dromedary.config.mjs",
  "dromedary.config.cjs",
  "dromedary.config.ts",
  "dromedary.config.mts",
  "dromedary.config.cts",
];

const isTsExt = (ext: string): boolean =>
  ext === ".ts" || ext === ".mts" || ext === ".cts" || ext === ".tsx";

const normalizeConfig = async <T>(
  maybeConfig: MaybeConfigFn<T>
): Promise<T> => {
  if (typeof maybeConfig === "function") {
    return await (maybeConfig as () => T | Promise<T>)();
  }
  return maybeConfig;
};

const parseArgs = (argv: string[]): CliArgs => {
  const [, , ...rest] = argv;

  let command: string | null = null;
  let configPath: string | null = null;
  let showHelp = false;

  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];

    if (token === "-h" || token === "--help") {
      showHelp = true;
      continue;
    }

    if ((token === "-c" || token === "--config") && rest[i + 1]) {
      configPath = rest[i + 1]!;
      i += 1;
      continue;
    }

    if (!command && !token.startsWith("-")) {
      command = token;
      continue;
    }
  }

  return { command, configPath, showHelp };
};

const findConfig = (cwd: string, override: string | null): string => {
  if (override) {
    const resolved = path.resolve(cwd, override);
    if (!fs.existsSync(resolved)) {
      throw new Error(`Config file not found: ${resolved}`);
    }
    return resolved;
  }

  const candidate = CONFIG_CANDIDATES.map((name) => path.join(cwd, name)).find(
    (file) => fs.existsSync(file)
  );

  if (!candidate) {
    throw new Error(
      `No config file found.\n` +
        `Tried: ${CONFIG_CANDIDATES.join(", ")}\nOverride with: --config <file>`
    );
  }

  return candidate;
};

const bundleConfig = async (file: string): Promise<string> => {
  const hash = crypto.createHash("sha1").update(file).digest("hex");
  const outfile = path.join(os.tmpdir(), `dromedary-config-${hash}.cjs`);

  try {
    const esbuild = await import("esbuild");
    await esbuild.build({
      entryPoints: [file],
      outfile,
      format: "cjs",
      platform: "node",
      target: "es2020",
      bundle: true,
      sourcemap: "inline",
      logLevel: "silent",
    });
    return outfile;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : JSON.stringify(err, null, 2);
    throw new Error(
      `Failed to bundle config (${path.basename(
        file
      )}). Install "esbuild" to enable TS configs.\nOriginal error: ${message}`
    );
  }
};

const isRuntimeConfig = (value: unknown): value is DromedaryRuntimeConfig => {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  return "components" in obj && "routes" in obj;
};

let tsNodeRegistered: boolean | null = null;

const registerTsNodeIfAvailable = async (): Promise<boolean> => {
  if (tsNodeRegistered !== null) return tsNodeRegistered;

  try {
    const { register } = await import("ts-node");
    register({
      transpileOnly: true,
      skipProject: true,
      compilerOptions: {
        module: "NodeNext",
        moduleResolution: "NodeNext",
      },
    });
    tsNodeRegistered = true;
  } catch {
    tsNodeRegistered = false;
  }

  return tsNodeRegistered;
};

const loadConfig = async (file: string): Promise<DromedaryRuntimeConfig> => {
  const ext = path.extname(file).toLowerCase();
  const needsBundle = isTsExt(ext);
  let importPath = file;
  let tsNodeReady = false;

  if (needsBundle) {
    tsNodeReady = await registerTsNodeIfAvailable();
    if (!tsNodeReady) {
      importPath = await bundleConfig(file);
    }
  }

  const loadModule = async (target: string) =>
    await import(pathToFileURL(target).href);

  let mod;
  try {
    mod = await loadModule(importPath);
  } catch (err) {
    if (needsBundle && tsNodeReady && importPath === file) {
      // ts-node failed, try bundling as a fallback
      importPath = await bundleConfig(file);
      mod = await loadModule(importPath);
    } else {
      throw err;
    }
  }
  const exported = mod.default ?? mod.config ?? mod;
  const unwrapDefault = (value: unknown) => {
    if (
      value &&
      typeof value === "object" &&
      "default" in value &&
      (value as Record<string, unknown>)["default"] !== value
    ) {
      return (value as Record<string, unknown>)["default"];
    }
    return value;
  };
  const resolvedExport = unwrapDefault(exported);

  if (!exported) {
    throw new Error(`Config file "${file}" has no default export.`);
  }

  const configSource =
    resolvedExport ??
    exported ??
    (undefined as unknown as MaybeConfigFn<DromedaryRuntimeConfig>);
  const config = await normalizeConfig<DromedaryRuntimeConfig>(
    configSource as MaybeConfigFn<DromedaryRuntimeConfig>
  );

  if (!isRuntimeConfig(config)) {
    throw new Error(
      `Invalid config from "${file}". Expected shape: { components, routes }`
    );
  }

  return config;
};

const prefixLogger = (logger: Console): Console => {
  const prefixed = new Proxy(logger, {
    get(target, prop, receiver) {
      const original = Reflect.get(target, prop, receiver);
      if (typeof original !== "function") return original;
      const name = String(prop);
      if (
        name === "log" ||
        name === "info" ||
        name === "warn" ||
        name === "error"
      ) {
        return (...args: unknown[]) =>
          (original as Function).apply(target, ["[Dromedary]", ...args]);
      }
      return (original as Function).bind(target);
    },
  });
  return prefixed as Console;
};

const buildContext = (): ComponentContext => {
  const keys: ComponentContext["keys"] = {};

  if (process.env.DROMEDARY_SECRET_KEY) {
    keys.default = process.env.DROMEDARY_SECRET_KEY;
  }

  if (process.env.DROMEDARY_STATUS_KEY) {
    keys.statusBot = process.env.DROMEDARY_STATUS_KEY;
  }

  return {
    logger: console,
    keys,
  };
};

const run = async (configFile: string): Promise<void> => {
  const config = await loadConfig(configFile);
  const ctx = buildContext();
  const runtimeLogger = prefixLogger(console);
  const engine = new RouteEngine(
    config.components ?? {},
    config.routes ?? [],
    ctx,
    runtimeLogger
  );
  const runningMessage = `
         _
     .--' |
    /___^ |     .--.
        ) |    /    \\
       /  |  /\`      '.
      |   '-'    /     \\
      \\         |      |\\
       \\    /   \\      /\\|
        \\  /'----\`\\   /
        |||       \\\\ |
        ((|        ((|      Dromedary ready!
        |||        |||      Config: ${
          path.relative(process.cwd(), configFile) || configFile
        }
 jgs   //_(       //_(\n`;
  console.log(runningMessage);
  const stop = engine.startAll();

  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;

    try {
      stop();
      // eslint-disable-next-line no-console
      console.log("Dromedary stopped");
    } finally {
      process.exit(0);
    }
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
};

const printUsage = () => {
  // eslint-disable-next-line no-console
  console.error(
    [
      "Usage:",
      "  dromedary run [--config <file>]",
      "",
      "Options:",
      "  -c, --config <file>   Path to config file",
      "  -h, --help            Show this help message",
    ].join("\n")
  );
};

const main = async (): Promise<void> => {
  const { command, configPath, showHelp } = parseArgs(process.argv);

  if (showHelp) {
    printUsage();
    process.exit(0);
  }

  if (command !== "run") {
    printUsage();
    process.exit(1);
  }

  const file = findConfig(process.cwd(), configPath);
  await run(file);
};

main().catch((err: unknown) => {
  const message =
    err instanceof Error ? err.message : JSON.stringify(err, null, 2);

  // eslint-disable-next-line no-console
  console.error(`dromedary run failed: ${message}`);
  process.exit(1);
});
