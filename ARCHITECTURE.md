# Architecture

## Purpose and Boundaries

Unslide turns user-owned report source and data into a standalone HTML document
made of explicit pages. Development tooling renders delivery artifacts for
inspection and may derive a PDF from the same HTML.

Unslide owns compilation, artifact validation, standalone output, deterministic
browser operation, capture, and export. Report source owns the complete DOM,
page geometry, styling, fonts, assets, repeated material, print rules, and
content fit. Callers own business calculations and domain models.

## Target System Shape

```text
user data + user-owned report source
                  |
                  v
        first-party React authoring
                  |
                  v
       standalone HTML artifact <------ artifact protocol
                  |
          +-------+--------+
          |                |
          v                v
   HTML page capture   Chromium PDF export
          |                |
          v                v
     page PNGs         report.pdf
                           |
                           v
                    PDF page capture
```

HTML is canonical. Screenshots and PDF are derived delivery or inspection
artifacts. PDF export uses the same generated HTML rather than a parallel layout
implementation.

## Major Modules

### Report source

User-owned typed source determines the complete document, page sequence, DOM,
CSS, assets, conditional pages, print behavior, and any repeated structure. It
marks capturable pages through the artifact protocol but does not inherit visual
policy from Unslide.

### Artifact protocol and validator

The protocol is the stable seam between arbitrary report output and Unslide
tooling. Protocol v1 uses `data-unslide-page="<id>"` for ordered unique page
markers and defines static visual readiness. The implemented validator reports
missing, empty, or duplicate page IDs and failed font or image readiness
without changing layout. See [`docs/PROTOCOL.md`](docs/PROTOCOL.md).

The marker is behavioral and nonvisual. It does not require a particular
element, class, wrapper, page size, or page-frame module.

### React authoring module

The first-party authoring module evaluates typed TSX and produces the canonical
HTML artifact. It hides compilation, static rendering, local asset inclusion,
document serialization, and actionable errors behind a small interface.

React is the only proven source implementation. Do not expose a generalized
renderer plugin seam until a second real source adapter exists.

### CLI

The CLI is the normal user and agent interface for project initialization,
build, artifact inspection, HTML capture, PDF export, and PDF inspection. It reads
schema-validated operational configuration and delegates to internal modules.

One Effect program owns execution. The executable provides one internal Node
filesystem/path Layer, and the outer boundary translates typed operational
failures to the stable CLI payload and exit-code contract. Effect remains an
implementation detail and does not appear in published authoring declarations.

Each invocation emits one TOON document on stdout. The CLI presenter maps
observed typed failures to a small stable code set and keeps dependency causes
out of that public channel. Browser, protocol, and PDF validation operations
retain complete structured authored diagnostics internally; only the CLI
presenter applies the default issue and text limits or honors command-scoped
`--full`. Success view
models expose existence-only HTML status and factor common page-image output
directories from basename rows without imposing a shared domain schema.

The same boundary replaces Effect's default logger. Logging is disabled by
default. The `info` and `debug` CLI levels install a JSON stderr logger with the
configured minimum level and invocation annotations; `off` supplies no logger
and keeps diagnostics disabled. Major operations add log spans without changing
TOON stdout or the typed failure model. The diagnostic event shape is internal.

Configuration may select entries, outputs, inspection locations, and supported
export behavior. It must not define page geometry, typography, padding, chrome,
or other visual policy.

### Package distribution

The root package is published to npm as `unslide`. Release Please owns package
versions, changelog entries, `v<version>` source tags, and GitHub Releases. A
tag-triggered workflow validates the tagged source before publishing the npm
package with trusted-publisher provenance. Release mechanics do not change the
runtime or artifact protocol boundaries.

### Chromium tooling

One pinned Playwright-managed Chromium build is the canonical browser for HTML
capture and PDF printing. Browser automation stays in development tooling and
is never required to open the completed HTML.

HTML capture screenshots each marked element after readiness. PDF export uses
print media and author-owned paged CSS, prefers CSS page geometry, and then
validates the produced file.

### PDF inspection

PDF inspection uses PDF.js and its pinned Node canvas to rasterize the actual
generated PDF into one ordered image per page at 96 DPI. It never loads source
HTML or substitutes HTML screenshots for PDF evidence.

### Publication transactions

Canonical HTML and PDF use same-directory staging followed by atomic rename,
so a failed build or export cannot replace a prior delivery. HTML and PDF page
images are generated as complete staged sets. Publishing a set first preserves
managed prior images, restores them when replacement fails, and retains exact
recovery staging when rollback cannot finish. Unrelated output files never
enter the transaction.

### Optional scaffolds and recipes

Project scaffolding may create editable report source and configuration.
Optional visual recipes may later be distributed as user-owned source. They are
not dependencies of the artifact protocol, renderer, or exporters.

Stable mechanics remain versioned package code. A managed recipe registry is a
future module only if real adoption demonstrates that one-time scaffolding and
documentation are insufficient.

## Dominant Flows

### Build and HTML inspection

1. The caller prepares display-ready data.
2. Report source composes and marks explicit pages.
3. The authoring module emits standalone HTML.
4. The validator checks the artifact protocol.
5. Chromium loads the artifact and waits for visual readiness.
6. HTML capture writes one image for each marked page.
7. The author or agent inspects the images and revises source.

### PDF export and inspection

1. The exporter consumes a valid canonical HTML artifact.
2. Chromium applies the report's print CSS and creates a PDF.
3. The exporter verifies that marked HTML page count equals PDF page count.
4. PDF inspection renders the PDF itself to one image per page.
5. The author or agent judges the PDF images and revises the same report source.

## Invariants

- HTML is the canonical artifact and opens without Unslide, Node.js,
  Playwright, a server, or a network request.
- Report source owns every visual and structural design decision.
- Runtime modules inject no reset, foundation CSS, page geometry, wrapper,
  chrome, numbering, typography, or design tokens.
- Every artifact page has one stable unique marker and is discovered in document
  order.
- Unslide never moves content between pages or silently repairs overflow.
- Capture and PDF export consume the canonical HTML, not a preview-only copy.
- PDF export does not assemble raster screenshots into a document.
- One marked HTML page produces one PDF page for supported exports.
- PDF visual inspection renders the produced PDF, not the source HTML.
- Business calculations and domain models stay outside Unslide.
- Project configuration is operational and never becomes a design schema.
- Stable behavior is upgraded through versioned tooling; optional visual recipes
  remain user-owned source.
- Canonical HTML and PDF replace prior deliveries only through atomic rename.
- Managed page-image replacement restores prior files on failure when possible
  and never deletes recovery evidence after incomplete rollback.
- Effect services, Layers, failures, and scopes remain internal to executable
  tooling; public React helpers remain Promise-based.
- New public adapter or plugin seams require at least two proven
  implementations.

## Current Code Map

- `src/unslide/assets.ts` implements the Promise-based local-asset helpers
  exported by `unslide/react`.
- `src/unslide/render.tsx` serializes a report-owned complete React document,
  rejects unresolved resource dependencies, and publishes standalone HTML
  atomically. It injects no shell or visual source.
- `src/unslide/protocol.ts` defines protocol v1 metadata, validation, and static
  readiness independently of React.
- `src/unslide/browser.ts` owns canonical Chromium loading, shared protocol
  readiness, browser/resource diagnostics, and scoped browser/context/page
  release in the calling Effect context without importing React.
- `src/unslide/capture.ts` captures authored page bounds through that browser
  seam and returns deterministic structured results.
- `src/unslide/page-images.ts` transactionally replaces managed page PNG sets,
  restores prior files when possible, preserves unrelated files, and retains
  recovery staging after incomplete rollback.
- `src/unslide/config.ts` discovers the nearest `unslide.json`, validates its
  versioned operational schema, and resolves safe project-relative paths.
- `src/unslide/pdf.ts` prints canonical HTML through the shared browser seam,
  requires authored page geometry, validates page count, common geometry, and
  extractable text with scoped PDF.js loading tasks and pages, and publishes
  the PDF atomically.
- `src/unslide/pdf-inspection.ts` reads only an existing PDF and rasterizes each
  page through scoped PDF.js tasks, pages, render tasks, and native canvases
  into deterministic 96-DPI PNGs.
- `src/unslide/build.ts` and `src/unslide/inspect.ts` provide the named React
  build and canonical artifact-inspection operations used by the CLI.
- `src/unslide/runtime.ts` provides the one internal Node filesystem/path Layer;
  `src/unslide/failures.ts` and `src/unslide/lifecycle.ts` preserve typed failure,
  interruption, and cleanup evidence across operational scopes.
- `src/unslide/logging.ts` installs opt-in Effect JSON logging and provides the
  shared phase instrumentation used across those operational scopes.
- `src/cli.ts` exposes initialization, HTML build/inspection/capture, PDF export,
  and PDF inspection with TOON output, stable exit codes, and global logging
  level parsing.
- `src/unslide/init.ts` plans and safely writes the minimal user-owned project
  scaffold; `src/unslide/react.ts` is the narrow installed authoring entry.
- `src/spike/` and `src/reports/operating-review/` own their full documents,
  page composition, unrelated portrait and A4 landscape geometries, optional
  repeated material, and print rules.
- `tests/*.test.tsx` exercises the public CLI and the protocol, HTML capture,
  PDF export, PDF inspection, authoring, and clean-consumer seams.

Generated HTML and PDF stay under `artifacts/`; disposable HTML and PDF-native
captures stay under `.tmp/captures/` and `.tmp/pdf-captures/`. These locations
are explicit report entries in the root `unslide.json`, not visual policy.

## Related Decisions

- [D1 — Explicit fixed pages](docs/decisions/0001-explicit-pages.md)
- [D2 — Repository-owned rendered preview](docs/decisions/0002-rendered-preview.md)
- [D3 — Headless artifact protocol and author-owned design](docs/decisions/0003-headless-artifact-protocol.md)
- [D4 — HTML-first PDF export](docs/decisions/0004-html-first-pdf-export.md)
- [D5 — Effect v4 for the internal runtime](docs/decisions/0005-effect-v4-internal-runtime.md)
- [D6 — Public npm distribution](docs/decisions/0006-public-npm-distribution.md)
- [Supported delivery contract](docs/SUPPORT.md)
