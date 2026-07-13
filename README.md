# Unslide

Unslide is a code-first way to create fixed-page HTML reports. Authors write
plain-text report source, pass ordinary data into it, and receive a static HTML
document made of explicitly composed pages.

New to the codebase? Open the [interactive project guide](docs/PROJECT-GUIDE.html)
for the product mental model, runtime flow, code map, tests, and review focus.

The project is intentionally narrower than a presentation framework or a
publishing engine. V1 is for static reports that are laid out page by page. It
does not automatically move content between pages.

Status: **V1 and the accepted V2 delivery scope are complete.** The
CLI initializes schema-validated projects and builds, inspects, and captures
named reports through installed, versioned tooling. Chromium exports validated
PDFs, and the CLI renders those PDFs to target-native page images. The packaged
workflow is verified end to end; repository execution state is maintained in
`PLAN.md`.

## Rendering Spike

The first implementation uses React's static server renderer for familiar TSX
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

Open `artifacts/spike/report.html` in an ordinary browser. Inspect the three
page images under `.tmp/captures/spike/`. Generated HTML is kept under
`artifacts/`; the validated PDF is `artifacts/spike/report.pdf`; disposable HTML
and PDF inspection output is kept under `.tmp/captures/` and
`.tmp/pdf-captures/` respectively.

Change values in `src/spike/data.ts` or composition in
`src/spike/report.tsx`, then repeat render, capture, and visual inspection.
The author must correct overflow in source; the tooling does not detect or
repair it.

The credible eight-page operating report uses the same loop:

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

With no command, `pnpm --silent run unslide` discovers the nearest
`unslide.json` from the current directory or its parents and lists configured reports. The
directory containing that file is the project root; every configured path is
relative to it. The [versioned schema](schema/unslide.schema.json) rejects
unknown fields and overlapping or escaping paths. Configuration contains only
source and derived-artifact locations, including optional PDF and PDF-inspection
paths; visual choices remain in report source.

The `--silent` package-manager flag keeps CLI stdout as structured TOON for
automation. Exit code 0 means success, 1 an operational failure, and 2 invalid
command usage. Top-level and per-command `--help` forms are noninteractive.

## Adopt from the Local Package

The verified pre-release path uses a packed tarball. From this repository:

```sh
pnpm pack --pack-destination .tmp/package
```

In an existing pnpm project, enforce dependency engine ranges, allow the pinned
`esbuild` install script, and explicitly reject Effect's optional native
MessagePack accelerator in `pnpm-workspace.yaml`, then install that tarball:

```yaml
engineStrict: true
allowBuilds:
  esbuild: true
  msgpackr-extract: false
```

```sh
pnpm add /path/to/unslide/.tmp/package/unslide-0.1.0.tgz
pnpm dlx playwright@1.61.1 install chromium
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
writes standalone HTML. It supplies explicit local-asset helpers and rejects
unresolved resource dependencies, but injects no document shell, stylesheet,
page wrapper, geometry, chrome, or typography. Each proof report owns those
choices beside its source. Local tarball installation is proven; the package's
minimal file list, compatibility contract, and private 0.x release state are
verified through a clean external consumer.

## Package Contract

The 0.1.0 tarball intentionally exposes only:

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

Version 0.1.0 supports Node.js 24.15 or newer within the Node 24 release line
and pnpm 11.12 on the verified macOS arm64 environment. HTML capture and PDF
export use Playwright 1.61.1 and its managed
Chromium; PDF validation and rasterization use PDF.js 6.1.200, with
`@napi-rs/canvas` 1.0.2 providing the pinned Node canvas. Run
`pnpm dlx playwright@1.61.1 install chromium` before the first capture or export.
Other Node versions, package managers, operating systems, and browser engines
are not yet claimed. See the [supported delivery contract](docs/SUPPORT.md) for
the exact matrix, repeatability boundary, accessibility limits, and deferred PDF
features.

`unslide.json` version 1 and artifact protocol v1 are the current persisted
contracts. Explicit unsupported versions fail with manual migration guidance;
the CLI does not rewrite user-owned configuration or report source. Artifacts
created before 0.1.0 without protocol metadata remain compatible as v1.

The first release remains private and 0.x. A stable public release requires an
explicit later decision; 0.1.0 does not promise automated upgrades or
semantic-version stability.

## V1 in One Sentence

Create a small report from typed code and data, render it to a local static HTML
file, and let a human or coding agent inspect real browser-rendered page images.

## Accepted V2 Direction

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

The commands above are the supported repository workflow today. Deferred PDF
and recipe capabilities require later evidence-backed decisions.

## Working Principle

Unslide owns the report lifecycle, never the report's design.

## License

Unslide is available under the [MIT License](LICENSE).
