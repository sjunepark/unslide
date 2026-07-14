# Repository Workflow

This document records commands that work in the current implementation. The
artifact protocol, headless full-document authoring, canonical capture,
Chromium PDF export, and PDF-native inspection paths are verified through the
packed consumer workflow.

## Supported Development Environment

The workflow is verified in the canonical environment recorded in the
[supported delivery contract](SUPPORT.md). Chromium is the canonical preview
and print engine. The delivered HTML needs only a modern local browser; it does
not need Node.js, Playwright, a server, or a running application.

The repository does not claim cross-browser pixel parity or support multiple
capture engines.

The support contract is authoritative for exact versions and unclaimed
environments; `package.json` and the committed lockfile own the current package
and development dependency pins.

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

In an existing pnpm project, first configure `engineStrict: true`,
`allowBuilds.esbuild: true`, and `allowBuilds.msgpackr-extract: false` in
`pnpm-workspace.yaml`. Then install the public package and its managed browser:

```sh
pnpm add unslide
pnpm dlx playwright@1.61.1 install chromium
```

Initialize and use the installed package:

```sh
pnpm exec unslide init
pnpm exec unslide init --yes
pnpm exec unslide build report
pnpm exec unslide inspect report
pnpm exec unslide capture report
pnpm exec unslide export report
pnpm exec unslide inspect-pdf report
```

The first `init` command shows the planned file writes. The confirmed command
creates a minimal `unslide.json`, a complete React document, and one clearly
removable CSS file. A repeated run is an unchanged no-op; differing files
produce a structured conflict without being overwritten.

For unpublished repository changes, run `pnpm pack --pack-destination
.tmp/package` and install the resulting tarball instead. The clean-consumer
tests use this path to verify the exact package before publication.

## Author, Render, and Inspect

The small fixture lives under `src/spike/`; the credible report lives under
`src/reports/operating-review/`.

All repository report commands route through the schema-validated CLI and
[`unslide.json`](../unslide.json).

| Task | Command | Output |
|---|---|---|
| Render fixture | `pnpm run render:spike` | `artifacts/spike/report.html` |
| Capture fixture | `pnpm run capture:spike` | `.tmp/captures/spike/page-*.png` |
| Export fixture PDF | `pnpm run export:spike` | `artifacts/spike/report.pdf` |
| Inspect fixture PDF | `pnpm run inspect-pdf:spike` | `.tmp/pdf-captures/spike/page-*.png` |
| Render real report | `pnpm run render:report` | `artifacts/operating-review/report.html` |
| Capture real report | `pnpm run capture:report` | `.tmp/captures/operating-review/page-*.png` |
| Export real-report PDF | `pnpm run export:report` | `artifacts/operating-review/report.pdf` |
| Inspect real-report PDF | `pnpm run inspect-pdf:report` | `.tmp/pdf-captures/operating-review/page-*.png` |
| Run all repository checks | `pnpm run validate` | Both delivery artifacts and both target-native capture sets |

The direct forms are `pnpm --silent run unslide build <name>`, `pnpm --silent
run unslide inspect <name>`, `pnpm --silent run unslide capture <name>`, `pnpm
--silent run unslide export <name>`, and `pnpm --silent run unslide inspect-pdf
<name>`.
Run `pnpm --silent run unslide` from the project root or any nested directory
to see the live report list. The nearest
`unslide.json` defines the project root, and its source, HTML, optional PDF,
HTML-capture, and optional PDF-capture paths resolve relative to that directory.
The standalone form is `unslide inspect-pdf --artifact <path> --output
<directory>` and does not require project discovery.

See the README's [CLI automation contract](../README.md#cli-automation-contract)
for TOON stdout, exit codes, stable failures, flags, bounded diagnostics, and
portable recovery commands. Execution logging is opt-in and diagnostic-only.
Treat logging as sensitive because it can include local paths and full Effect
causes. Treat `--full` output as sensitive too: it may include complete
report-authored messages and resource identifiers even though dependency causes
remain excluded.

Open an artifact directly on macOS:

```sh
open artifacts/operating-review/report.html
open artifacts/operating-review/report.pdf
```

The authoring loop is intentionally manual: change typed data or report TSX,
render, capture, inspect every page image, and correct wording or layout in
source. The commands do not detect, redistribute, shrink, or repair overflow.

Capture discovers pages through the implemented
[`data-unslide-page` protocol](PROTOCOL.md), validates their IDs and static
visual resources, and then captures marked elements in document order.

## Artifact Ownership

- `artifacts/` contains generated standalone HTML and validated PDF delivery
  artifacts.
- `.tmp/captures/` contains disposable browser-rendered inspection images.
- `.tmp/pdf-captures/` contains disposable images rasterized from the actual
  PDFs at 96 DPI.
- Both directories are ignored by Git and can be regenerated from source.
- Report data and domain conclusions stay in each report's typed caller-owned
  object. Unslide does not calculate them.

## Current Module Decision

The repository-local React writer serializes a complete author-owned document,
provides explicit local-asset inlining, and injects no visual source. Each
report owns page geometry, chrome or its absence, styles, and print behavior.
The protocol-only capture module, canonical Chromium PDF exporter, and
PDF.js/Node-canvas rasterizer are implemented, and repository commands delegate
through the CLI. PDF inspection reads no source HTML or browser state.

Internally, one Effect v4 program owns CLI execution and receives one Node
filesystem/path Layer at the executable boundary. HTML and PDF publish through
atomic same-directory replacement. Page-image publication preserves unrelated
files, restores prior managed images when possible, and retains recovery
staging if rollback is incomplete. The public `unslide/react` asset helpers
remain Promise-based, and packed declarations expose no Effect types.

The current delivery model uses installed tooling rather than copied
implementation files. Build, validation, capture, export, and PDF inspection
run from the hardened locally packed tooling. See
[D3](decisions/0003-headless-artifact-protocol.md) and
[`ARCHITECTURE.md`](../ARCHITECTURE.md).

## Repository Evidence

`pnpm run validate` is the authoritative current evidence for source checks,
tests, and every configured proof-report HTML/PDF pipeline. Do not copy totals
or generated page measurements into this document; inspect the command output
and artifacts from the run being reviewed.

Validation does not make a visual judgment. After a report change, inspect
every generated HTML and PDF-native page image. The packed-consumer workflow
also remains the proof that installed tooling can initialize, build, inspect,
capture, export, and inspect a standalone report outside this repository.

See the [supported delivery contract](SUPPORT.md) for the canonical environment,
verified content and semantics, accessibility limits, repeatability boundary,
and explicitly deferred features.

Release ownership, bootstrap requirements, credentials, and the automated npm
publishing flow are documented in [RELEASE.md](RELEASE.md).
