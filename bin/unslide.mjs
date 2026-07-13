#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const launcherPath = fileURLToPath(import.meta.url);
const invocation = process.env.npm_lifecycle_event === "unslide"
  ? "pnpm --silent run unslide"
  : "pnpm exec unslide";
const result = spawnSync(
  process.execPath,
  ["--import", require.resolve("tsx"), fileURLToPath(new URL("../src/cli.ts", import.meta.url)), ...process.argv.slice(2)],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      UNSLIDE_BIN: launcherPath,
      UNSLIDE_INVOCATION: process.env.UNSLIDE_INVOCATION ?? invocation,
    },
  },
);

if (result.signal) process.kill(process.pid, result.signal);
process.exitCode = result.status ?? 1;
