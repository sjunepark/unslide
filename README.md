# Unslide

Unslide is a code-first way to create fixed-page HTML reports. Authors write
plain-text report source, pass ordinary data into it, and receive a static HTML
document made of explicitly composed pages.

New to the codebase? Open the [interactive project guide](docs/PROJECT-GUIDE.html)
for the product mental model, runtime flow, code map, tests, and review focus.

The project is intentionally narrower than a presentation framework or a
publishing engine. It serves static reports laid out page by page and does not
automatically move content between pages.

The CLI initializes schema-validated projects and builds, inspects, and
captures named reports through installed, versioned tooling. Chromium exports
validated PDFs, and the CLI renders those PDFs to target-native page images.
Repository execution state is maintained in `PLAN.md`.

## Rendering Spike

The small proof report uses React's static server renderer for familiar TSX
semantics. It produces one self-contained HTML file; React and Playwright are
not needed by a recipient opening that file.

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm run render:spike
pnpm run capture:spike
pnpm run export:spike
pnpm run inspect-pdf:spike
```

Open `artifacts/spike/report.html` in an ordinary browser. Inspect every page
image under `.tmp/captures/spike/`. Generated HTML is kept under
`artifacts/`; the validated PDF is `artifacts/spike/report.pdf`; disposable HTML
and PDF inspection output is kept under `.tmp/captures/` and
`.tmp/pdf-captures/` respectively.

Change values in `src/spike/data.ts` or composition in
`src/spike/report.tsx`, then repeat render, capture, and visual inspection.
The author must correct overflow in source; the tooling does not detect or
repair it.

The credible operating report uses the same loop:

```sh
pnpm run render:report
pnpm run capture:report
pnpm run export:report
pnpm run inspect-pdf:report
```

Its standalone artifact is `artifacts/operating-review/report.html`; its PDF is
`artifacts/operating-review/report.pdf`; its HTML and PDF-native page images are
under `.tmp/captures/operating-review/` and
`.tmp/pdf-captures/operating-review/`. The typed source and data live in
`src/reports/operating-review/`. Northstar Goods and all report values,
commentary, and decisions are fictional examples.

The repository aliases above use the same CLI that can be called directly:

```sh
pnpm --silent run unslide build operating-review
pnpm --silent run unslide inspect operating-review
pnpm --silent run unslide capture operating-review
pnpm --silent run unslide export operating-review
pnpm --silent run unslide inspect-pdf operating-review
```

## CLI Automation Contract

With no command, `pnpm --silent run unslide` discovers the nearest
`unslide.json` from the current directory or its parents and lists configured
reports. Each row's `htmlStatus` is only an existence check: `present` means the
configured HTML path exists and `missing` means it does not. It does not claim
that an artifact is current with its source. The contextual `help` commands are
the next supported actions.

The directory containing `unslide.json` is the project root; every configured
path is relative to it. The [versioned schema](schema/unslide.schema.json)
rejects unknown fields and overlapping or escaping paths. Configuration
contains only source and derived-artifact locations, including optional PDF and
PDF-inspection paths; visual choices remain in report source.

The `--silent` package-manager flag keeps CLI stdout as structured TOON for
automation. Every invocation writes one TOON document to stdout. Exit code 0
means success or an idempotent no-op, 1 means an operational failure, and 2
means invalid command usage. Default stderr is empty.

Operational failures use an `error` record with a stable `code` and concise
`message`, plus `report` or `path` when useful. Recovery data such as
`availableReports`, bounded `diagnostics`, and complete commands remains
structured instead of being embedded in prose. The current stable codes
are `project-not-found`, `project-config-unreadable`,
`project-config-invalid`, `report-not-found`, `artifact-not-found`,
`artifact-invalid`, `browser-not-installed`, and `command-failed`. Raw
dependency errors, stacks, browser banners, and filesystem search traces never
appear on stdout.

Top-level and per-command `--help` forms are noninteractive. Unknown flags and
extra values still return exit 2 when combined with `--help`; help bypasses only
missing required values. Commands emitted in `help` use the detected npm, pnpm,
or Yarn repository script runner, a PATH-verified `unslide`, or a safely quoted
absolute executable, so callers should run the emitted command as written.

The global `--log-level <off|info|debug>` flag may appear before or after the
command and overrides `UNSLIDE_LOG_LEVEL`; both default to `off`. Add `--full`
only to `inspect`, `capture`, or `export` to request complete report-authored
browser, protocol, or PDF-validation diagnostics when the default view is
truncated. Default
diagnostics show at most 10 issues and 1,000 Unicode characters per authored
message or resource, with exact totals. `--full` never exposes raw dependency
causes, but it may expose complete authored text and resource identifiers, so
handle its output as sensitive.

Execution logging is off by default, preserving empty stderr. Add
`--log-level info` for major command phases or `--log-level debug` for page,
publication, cleanup, and full Effect-cause evidence. Enabled logs are
newline-delimited Effect JSON on stderr, while stdout remains unchanged TOON.
The pre-release log event shape is diagnostic rather than a stable automation
contract, and ordinary report-page console messages are not forwarded.
Treat enabled logs as sensitive because phase annotations include local paths.
Debug logs additionally include full Effect causes, where an existing failure
message may contain authored text.

## Adopt from the Local Package

The verified pre-release path uses a packed tarball. From this repository:

```sh
pnpm pack --pack-destination .tmp/package
```

In an existing pnpm project, enforce dependency engine ranges, allow the pinned
`esbuild` install script, and explicitly reject Effect's optional native
MessagePack accelerator in `pnpm-workspace.yaml`, then install that tarball and
the managed browser using the command in the
[supported delivery contract](docs/SUPPORT.md):

```yaml
engineStrict: true
allowBuilds:
  esbuild: true
  msgpackr-extract: false
```

```sh
pnpm add /path/printed/by/pnpm-pack.tgz
pnpm exec unslide init
pnpm exec unslide init --yes
pnpm exec unslide build report
pnpm exec unslide inspect report
pnpm exec unslide capture report
pnpm exec unslide export report
pnpm exec unslide inspect-pdf report
```

The first `init` is a dry run. `--yes` creates only `unslide.json`,
`report.tsx`, and an optional `report.css`; it never overwrites differing
files. The generated source owns its complete document and styling and imports
only the nonvisual React authoring entry from the installed package.

## Current Authoring Path

`src/unslide/render.tsx` accepts a complete report-owned React document and
writes standalone HTML. The separate Promise-based asset helpers support
explicit local inlining, while rendering rejects unresolved resource
dependencies and injects no document shell, stylesheet, page wrapper, geometry,
chrome, or typography. Each proof report owns those choices beside its source.
Local tarball installation is proven; the package's minimal file list,
compatibility contract, and private 0.x release state are verified through a
clean external consumer.

## Package Contract

The current tarball intentionally exposes only:

- the `unslide` executable;
- `unslide/react` for React plus local-asset helpers;
- the [project JSON Schema](schema/unslide.schema.json); and
- the [HTML artifact protocol](docs/PROTOCOL.md) and
  [supported delivery contract](docs/SUPPORT.md).

Playwright, browser sessions, validators, capture internals, and speculative
adapter seams are package implementation details. Other repository-only
product, architecture, decision, workflow, and execution documents are not part
of the installed contract.

## Supported Environment and Compatibility

See the [supported delivery contract](docs/SUPPORT.md) for the authoritative
environment and dependency matrix, browser-install command, repeatability
boundary, accessibility limits, and deferred PDF features. `package.json` and
the committed lockfile remain authoritative for the current package and
development dependency pins.

`unslide.json` version 1 and artifact protocol v1 are the current persisted
contracts. Explicit unsupported versions fail with manual migration guidance;
the CLI does not rewrite user-owned configuration or report source. Artifacts
created before 0.1.0 without protocol metadata remain compatible as v1.

The first release remains private and 0.x. A stable public release requires an
explicit later decision; 0.1.0 does not promise automated upgrades or
semantic-version stability.

## Product Boundary

- HTML is the canonical report artifact.
- TypeScript and TSX remain the first authoring direction, while the artifact
  contract stays HTML-based.
- A report is an ordered set of fixed-size, explicitly authored pages.
- Data reaches report source through ordinary language values and props.
- Reports own their complete document, geometry, padding, fonts, repeated
  material, print rules, and every other design choice.
- Versioned tooling owns compilation, artifact validation, isolated capture,
  and validated Chromium PDF export instead of being copied into consuming
  repositories.
- PDF is printed from canonical HTML and target-native inspection rasterizes
  only the resulting PDF.
- Optional visual recipes may generate editable source but will not be runtime
  requirements.

The commands above are the supported repository workflow today. Deferred PDF,
adapter, and recipe capabilities require later evidence-backed decisions.

## Working Principle

Unslide owns the report lifecycle, never the report's design.

## License

Unslide is available under the [MIT License](LICENSE).
