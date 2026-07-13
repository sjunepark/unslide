#!/usr/bin/env node
process.env.UNSLIDE_INVOCATION ??= process.env.npm_lifecycle_event === "unslide"
  ? "pnpm --silent run unslide"
  : "pnpm exec unslide";

await import("../dist/cli.js");
