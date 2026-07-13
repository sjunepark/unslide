# Architecture

Status: **V1 is implemented and verified. V2 artifact protocol v1 and its
validator are implemented; the remaining target architecture is accepted and
planned.** See `PLAN.md` for the current migration step.

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
build, artifact inspection, HTML capture, and PDF export. It reads
schema-validated operational configuration and delegates to internal modules.

Configuration may select entries, outputs, inspection locations, and supported
export behavior. It must not define page geometry, typography, padding, chrome,
or other visual policy.

### Chromium tooling

One pinned Playwright-managed Chromium build is the canonical browser for HTML
capture and PDF printing. Browser automation stays in development tooling and
is never required to open the completed HTML.

HTML capture screenshots each marked element after readiness. PDF export uses
print media and author-owned paged CSS, prefers CSS page geometry, and then
validates the produced file.

### PDF inspection

PDF inspection rasterizes the actual generated PDF into one image per page. It
must not substitute HTML screenshots for PDF evidence. The implementation also
checks page count and geometry that can be observed reliably from the file.

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
- New public adapter or plugin seams require at least two proven
  implementations.

## Current V1 Code Map

The migration starts from a working but visually opinionated implementation:

- `src/unslide/page.tsx` currently owns A4 page structure and chrome. V2 removes
  it from the required runtime and preserves any useful design as optional
  report-owned source.
- `src/unslide/foundation.css` currently owns geometry and print styling. V2
  stops automatic injection and moves visual rules to reports or recipes.
- `src/unslide/render.tsx` currently owns the HTML shell and combines foundation
  and report CSS. V2 evolves it into the headless React authoring path.
- `src/unslide/protocol.ts` defines protocol v1 metadata, validation, and static
  readiness independently of React and the V1 visual foundation.
- `scripts/capture.ts` validates `[data-unslide-page]` elements and captures
  them in Chromium. V2 later moves the capture workflow behind the CLI.
- `src/spike/` and `src/reports/operating-review/` are migration fixtures.
- `tests/workflow.test.tsx` is the current end-to-end test surface.

Generated HTML stays under `artifacts/`; disposable V1 captures stay under
`.tmp/captures/`. V2 output locations are finalized only after the CLI and
configuration phases prove them.

## Related Decisions and Plans

- [D1 — Explicit fixed pages in V1](docs/decisions/0001-explicit-pages.md)
- [D2 — Repository-owned rendered preview](docs/decisions/0002-rendered-preview.md)
- [D3 — Headless artifact protocol and author-owned design](docs/decisions/0003-headless-artifact-protocol.md)
- [D4 — HTML-first PDF export](docs/decisions/0004-html-first-pdf-export.md)
- [V2 core plan](docs/plans/v2-core.md)
- [V2 adoption plan](docs/plans/v2-adoption.md)
- [V2 PDF plan](docs/plans/v2-pdf.md)
