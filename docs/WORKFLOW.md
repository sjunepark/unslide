# V1 Workflow

This document records commands that work in the current implementation. The V2
artifact protocol, headless full-document authoring, and canonical capture path
are active in these commands; follow [`PLAN.md`](../PLAN.md) for the remaining
migration state.

For an interactive overview and authoring guide to the V1 implementation, open
[`docs/index.html`](index.html) directly in a browser. Its copy-in recipe is
historical guidance for V1, not the accepted V2 adoption model.

## Supported Development Environment

V1 is verified on macOS with Apple silicon, Node.js 24, pnpm 11, and the
Playwright-managed Chromium build. Chromium is the canonical preview and print
engine. The delivered HTML needs only a modern local browser; it does not need
Node.js, Playwright, a server, or a running application.

The repository does not claim cross-browser pixel parity or support multiple
capture engines in v1.

## Install

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
```

The frozen install uses the committed lockfile, and pnpm is pinned through
`package.json`. Browser installation is development-only and does not add
anything to generated reports.

## Author, Render, and Inspect

The small fixture lives under `src/spike/`; the credible report lives under
`src/reports/operating-review/`.

| Task | Command | Output |
|---|---|---|
| Render fixture | `pnpm run render:spike` | `artifacts/spike/report.html` |
| Capture fixture | `pnpm run capture:spike` | `.tmp/captures/spike/page-*.png` |
| Render real report | `pnpm run render:report` | `artifacts/operating-review/report.html` |
| Capture real report | `pnpm run capture:report` | `.tmp/captures/operating-review/page-*.png` |
| Run all v1 checks | `pnpm run validate` | Both HTML artifacts and capture sets |

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
The protocol-only capture module is implemented; the script remains a thin
repository wrapper until the CLI replaces it.

The accepted V2 direction supersedes copy-in as the adoption model. Stable
build, validation, capture, and export behavior will move to versioned tooling;
there is not yet a published package interface. See
[D3](decisions/0003-headless-artifact-protocol.md) and the
[V2 adoption plan](plans/v2-adoption.md).

## Clean-Checkout Evidence

The complete workflow was verified on 13 July 2026 from a clean exported tree
on macOS 26.5.1 arm64 with Node.js 24.11.0, pnpm 11.12.0, Playwright 1.61.1,
and its managed Chromium build:

- `pnpm install --frozen-lockfile` completed from the committed lockfile;
- `pnpm exec playwright install chromium` completed successfully;
- `pnpm run validate` passed both focused tests and generated 3 fixture pages
  plus 8 operating-report pages;
- every generated page image was visually inspected;
- both HTML artifacts contained no external URLs, scripts, or linked styles;
- direct local opening required no server or Playwright runtime;
- Chromium print output contained exactly 3 and 8 A4 landscape pages; and
- every repository-local Markdown link resolved.
