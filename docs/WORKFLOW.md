# Repository Workflow

This document records commands that work in the current implementation. The V2
artifact protocol, headless full-document authoring, and canonical capture path
are active in these commands; follow [`PLAN.md`](../PLAN.md) for the remaining
migration state.

## Supported Development Environment

The workflow is verified on macOS with Apple silicon, Node.js 24, pnpm 11, and the
Playwright-managed Chromium build. Chromium is the canonical preview and print
engine. The delivered HTML needs only a modern local browser; it does not need
Node.js, Playwright, a server, or a running application.

The repository does not claim cross-browser pixel parity or support multiple
capture engines.

## Install

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
```

The frozen install uses the committed lockfile, and pnpm is pinned through
`package.json`. Browser installation is development-only and does not add
anything to generated reports.

## Initialize a Consumer

The verified local-package workflow starts by packing this repository:

```sh
pnpm pack --pack-destination .tmp/package
```

In an existing pnpm project, configure `allowBuilds.esbuild: true` in
`pnpm-workspace.yaml`, install the resulting tarball, and run:

```sh
pnpm add /path/to/unslide-0.0.0.tgz
pnpm dlx playwright@1.61.1 install chromium
pnpm exec unslide init
pnpm exec unslide init --yes
pnpm exec unslide build report
pnpm exec unslide inspect report
pnpm exec unslide capture report
```

The first `init` command shows the planned file writes. The confirmed command
creates a minimal `unslide.json`, a complete React document, and one clearly
removable CSS file. A repeated run is an unchanged no-op; differing files
produce a structured conflict without being overwritten.

## Author, Render, and Inspect

The small fixture lives under `src/spike/`; the credible report lives under
`src/reports/operating-review/`.

All repository report commands route through the schema-validated CLI and
[`unslide.json`](../unslide.json).

| Task | Command | Output |
|---|---|---|
| Render fixture | `pnpm run render:spike` | `artifacts/spike/report.html` |
| Capture fixture | `pnpm run capture:spike` | `.tmp/captures/spike/page-*.png` |
| Render real report | `pnpm run render:report` | `artifacts/operating-review/report.html` |
| Capture real report | `pnpm run capture:report` | `.tmp/captures/operating-review/page-*.png` |
| Run all repository checks | `pnpm run validate` | Both HTML artifacts and capture sets |

The direct forms are `pnpm --silent run unslide build <name>`, `pnpm --silent
run unslide inspect <name>`, and `pnpm --silent run unslide capture <name>`.
Run `pnpm --silent run unslide` from the project root or any nested directory
to see the live report list with machine-readable TOON stdout. The nearest
`unslide.json` defines the project root, and its source, HTML, and capture paths
resolve relative to that directory.

Open an artifact directly on macOS:

```sh
open artifacts/operating-review/report.html
```

The authoring loop is intentionally manual: change typed data or report TSX,
render, capture, inspect every page image, and correct wording or layout in
source. The commands do not detect, redistribute, shrink, or repair overflow.

Capture discovers pages through the implemented
[`data-unslide-page` protocol](PROTOCOL.md), validates their IDs and static
visual resources, and then captures marked elements in document order.

## Artifact Ownership

- `artifacts/` contains generated standalone HTML delivery artifacts.
- `.tmp/captures/` contains disposable browser-rendered inspection images.
- Both directories are ignored by Git and can be regenerated from source.
- Report data and domain conclusions stay in each report's typed caller-owned
  object. Unslide does not calculate them.

## Current Module Decision

The repository-local React writer serializes a complete author-owned document,
provides explicit local-asset inlining, and injects no visual source. Each
report owns page geometry, chrome or its absence, styles, and print behavior.
The protocol-only capture module is implemented, and current repository render
and capture commands delegate through the CLI.

The accepted V2 direction supersedes copy-in as the adoption model. Build,
validation, and capture now run from locally packed tooling; package hardening
and export remain. See
[D3](decisions/0003-headless-artifact-protocol.md) and the
[V2 adoption plan](plans/v2-adoption.md).

## Clean-Checkout Evidence

The complete workflow was verified on 13 July 2026 from a clean exported tree
on macOS 26.5.1 arm64 with Node.js 24.11.0, pnpm 11.12.0, Playwright 1.61.1,
and its managed Chromium build:

- `pnpm install --frozen-lockfile` completed from the committed lockfile;
- `pnpm exec playwright install chromium` completed successfully;
- `pnpm run validate` passed focused protocol, authoring, CLI, and clean-consumer
  tests and generated 3 fixture pages plus 8 operating-report pages;
- every generated page image was visually inspected;
- both HTML artifacts contained no external URLs, scripts, or linked styles;
- direct local opening required no server or Playwright runtime;
- the contrasting fixture captured as three 900×1200 portrait pages while the
  operating review retained eight A4 landscape pages;
- a packed tarball initialized, built, inspected, and captured a standalone
  960×540 consumer report outside the repository; and
- every repository-local Markdown link resolved.
