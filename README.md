# Unslide

Unslide is a code-first way to create fixed-page HTML reports. Authors write
plain-text report source, pass ordinary data into it, and receive a static HTML
document made of explicitly composed pages.

The project is intentionally narrower than a presentation framework or a
publishing engine. V1 is for static reports that are laid out page by page. It
does not automatically move content between pages.

Status: **V1, V2 Core, V2 Adoption, and PDF export are complete.** The
CLI initializes schema-validated projects and builds, inspects, and captures
named reports through installed, versioned tooling. Chromium exports validated
PDFs; automated PDF-native inspection remains. Repository execution state is
maintained in `PLAN.md`.

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
```

Open `artifacts/spike/report.html` in an ordinary browser. Inspect the three
page images under `.tmp/captures/spike/`. Generated HTML is kept under
`artifacts/`; the validated PDF is `artifacts/spike/report.pdf`; disposable
inspection output is kept under `.tmp/captures/`.

Change values in `src/spike/data.ts` or composition in
`src/spike/report.tsx`, then repeat render, capture, and visual inspection.
The author must correct overflow in source; the tooling does not detect or
repair it.

The credible eight-page operating report uses the same loop:

```sh
pnpm run render:report
pnpm run capture:report
pnpm run export:report
```

Its standalone artifact is `artifacts/operating-review/report.html`; its PDF is
`artifacts/operating-review/report.pdf`; its page images are under
`.tmp/captures/operating-review/`. The typed source and data live in
`src/reports/operating-review/`. Northstar Goods and all report values,
commentary, and decisions are fictional examples.

The repository aliases above use the same CLI that can be called directly:

```sh
pnpm --silent run unslide build operating-review
pnpm --silent run unslide inspect operating-review
pnpm --silent run unslide capture operating-review
pnpm --silent run unslide export operating-review
```

With no command, `pnpm --silent run unslide` discovers the nearest
`unslide.json` from the current directory or its parents and lists configured reports. The
directory containing that file is the project root; every configured path is
relative to it. The [versioned schema](schema/unslide.schema.json) rejects
unknown fields and overlapping or escaping paths. Configuration contains only
source and derived-artifact locations, including an optional PDF path; visual
choices remain in report source.

The `--silent` package-manager flag keeps CLI stdout as structured TOON for
automation. Exit code 0 means success, 1 an operational failure, and 2 invalid
command usage. Top-level and per-command `--help` forms are noninteractive.

## Adopt from the Local Package

The verified pre-release path uses a packed tarball. From this repository:

```sh
pnpm pack --pack-destination .tmp/package
```

In an existing pnpm project, allow the pinned `esbuild` install script in
`pnpm-workspace.yaml`, then install that tarball:

```yaml
allowBuilds:
  esbuild: true
```

```sh
pnpm add /path/to/unslide/.tmp/package/unslide-0.1.0.tgz
pnpm dlx playwright@1.61.1 install chromium
pnpm exec unslide init
pnpm exec unslide init --yes
pnpm exec unslide build report
pnpm exec unslide inspect report
pnpm exec unslide capture report
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
- the [HTML artifact protocol](docs/PROTOCOL.md).

Playwright, browser sessions, validators, capture internals, and speculative
adapter seams are package implementation details. Repository-only product,
architecture, decision, workflow, and execution documents are not part of the
installed contract.

## Supported Environment and Compatibility

Version 0.1.0 supports Node.js 24.x and pnpm 11.12 on the verified macOS arm64
environment. HTML capture and PDF export use Playwright 1.61.1 and its managed
Chromium; PDF validation uses PDF.js 6.1.200. Run
`pnpm dlx playwright@1.61.1 install chromium` before the first capture or export.
Other Node versions, package managers, operating systems, and browser engines
are not yet claimed.

`unslide.json` version 1 and artifact protocol v1 are the current persisted
contracts. Explicit unsupported versions fail with manual migration guidance;
the CLI does not rewrite user-owned configuration or report source. Artifacts
created before 0.1.0 without protocol metadata remain compatible as v1.

The first release remains private and 0.x while packed-consumer and PDF evidence
accumulates. A stable public release requires an explicit later decision; 0.1.0
does not promise automated upgrades or semantic-version stability.

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
- PDF is printed from canonical HTML; automated target-native PDF inspection is
  the remaining delivery slice.
- Optional visual recipes may generate editable source but will not be runtime
  requirements.

Items not yet implemented remain planned until their corresponding V2 goals
pass. The commands above remain the supported repository workflow today.

## Working Principle

Unslide owns the report lifecycle, never the report's design.

## License

Unslide is available under the [MIT License](LICENSE).
