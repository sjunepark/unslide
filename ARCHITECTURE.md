# Architecture

## Purpose and Boundaries

Unslide turns caller-owned data and report source into a standalone HTML
document made of explicit pages. It can capture that HTML, derive a
structurally validated PDF, and rasterize the PDF for visual inspection.

Callers own business calculations and domain models. Report source owns the
complete document, page composition, geometry, styling, assets, print rules,
and content fit. Unslide owns only compilation, validation, deterministic
browser operation, capture, export, and safe publication.

```text
caller data + report-owned source
               |
               v
        standalone HTML  <--- protocol v1
           /        \
          v          v
   HTML page PNGs   Chromium PDF
                         |
                         v
                   PDF page PNGs
```

HTML is the canonical artifact. Every other output is derived delivery or
inspection evidence.

## Component and Code Map

| Area                    | Start here                                                                                                                                                                 | Responsibility                                                                                                                 |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| CLI and project model   | `src/cli.ts`, `src/unslide/config.ts`, `src/unslide/init.ts`                                                                                                               | Command grammar, project discovery, safe configuration, scaffolding, and public result shaping                                 |
| React authoring         | `src/unslide/react.ts`, `src/unslide/assets.ts`, `src/unslide/build.ts`, `src/unslide/render.tsx`                                                                          | Minimal public authoring entry, explicit asset inlining, TSX evaluation, standalone serialization, and atomic HTML publication |
| Artifact validation     | `src/unslide/protocol.ts`, `src/unslide/inspect.ts`                                                                                                                        | Versioned page markers and bounded static readiness, independent of React                                                      |
| Browser capture         | `src/unslide/browser.ts`, `src/unslide/capture.ts`                                                                                                                         | Isolated Chromium lifecycle, browser diagnostics, and marked-element screenshots                                               |
| PDF delivery            | `src/unslide/pdf.ts`, `src/unslide/pdf-inspection.ts`                                                                                                                      | Chromium printing, PDF validation, and PDF.js/Node-canvas rasterization of the actual PDF                                      |
| Runtime and publication | `src/unslide/runtime.ts`, `src/unslide/failures.ts`, `src/unslide/lifecycle.ts`, `src/unslide/logging.ts`, `src/unslide/file-publication.ts`, `src/unslide/page-images.ts` | Internal Effect services, typed failures, scoped cleanup, opt-in diagnostics, and transactional file/page-image replacement    |
| Review composition      | `src/unslide/review.ts`, `src/unslide/review-manifest.ts`                                                                                                                  | Fresh lifecycle composition, focused evidence, all-report continuation, and last-successful-review manifests                   |
| Proof reports           | `src/spike/`, `src/reports/operating-review/`                                                                                                                              | Unrelated report-owned visual systems exercising the same nonvisual lifecycle                                                  |
| Verification            | `tests/*.test.tsx`, `tests/fixtures/`                                                                                                                                      | Public CLI, protocol, publication, PDF, workflow, and clean-consumer contracts                                                 |

The typed command/result boundary serves `report`, `add`, artifact
capture/export, and review composition. Review remains orchestration over the
same build, validation, capture, export, and inspection modules; it is not a
second renderer. Result presentation and manifest serialization share one
semantic model, while the manifest writer uses the same-directory staging and
rename publication pattern.

## Dominant Runtime Flow

1. The CLI discovers the nearest `unslide.json`, validates its version and
   fields, and resolves safe project-relative paths.
2. The authoring adapter evaluates a named TSX entry and serializes its complete
   React document. The writer rejects recognized unresolved resource
   dependencies and atomically publishes standalone HTML.
3. Browser-based commands load that HTML in isolated Chromium, collect
   actionable browser evidence, and run the protocol validator.
4. `capture` screenshots marked elements in document order and transactionally
   replaces the managed HTML-page image set.
5. `export` applies print media, reruns bounded readiness for print-active
   static resources, requires authored page geometry, creates a PDF, verifies
   page parity, geometry, and extractable text, then atomically publishes it.
6. `inspect-pdf` reads only the existing PDF and transactionally replaces its
   target-native page-image set.

Commands remain composable: capture and export do not rebuild HTML, and PDF
inspection does not consult HTML or browser state.

`review` is the explicit composition: it always rebuilds HTML, validates the
whole artifact, limits only rasterization when focused, and optionally produces
and inspects PDF. Each step publishes independently and a versioned manifest is
published last, so hashes—not timestamps—bind successful evidence to canonical
HTML.

## CLI and Runtime Boundary

One Effect program owns executable operations. The Node filesystem/path Layer
is provided once at the boundary; typed internal failures, scopes, and cleanup
evidence do not enter the public React declarations or artifact protocol.

The typed CLI parser and presenter translate command outcomes into the shared
TOON/JSON result envelope and exit-code contract documented in
[README.md](README.md#cli-automation-contract). Complete authored diagnostics
remain structured internally; only the presenter bounds them or applies
`--full`. The executable root performs the sole stdout write after execution,
logging, and cleanup. Effect logging writes directly to stderr when enabled;
report-authored console calls are captured separately so default stderr stays
empty and stdout remains exactly one result document.

Configuration selects source and derived-artifact paths only. The schema and
loader reject unknown fields, unsafe paths, and source/output overlap; they do
not model visual design.

The package is distributed as `unslide`. Release rationale belongs to
[D6](docs/decisions/0006-public-npm-distribution.md), and operational publishing
belongs to [docs/RELEASE.md](docs/RELEASE.md).

## Publication Model

HTML and PDF outputs are written to same-directory staging paths and renamed
only after successful generation and validation, so a failure cannot replace a
prior delivery.

Project setup derives conventional artifact paths after schema validation.
`init` preserves truthful partial-creation evidence; `add` preflights every
starter file, validates the merged configuration, stages the complete change,
atomically replaces `unslide.json`, and rolls back files created by a failed
publication.

Page-image commands generate a complete staged set before replacing managed
files. Publication preserves unrelated files, restores prior managed images
when possible, and retains recovery staging when rollback cannot finish.

## Invariants

- First-party output is a complete local HTML file with no recognized
  unresolved resource dependency; opening it requires no Unslide runtime,
  Node.js, Playwright, or application server.
- Report source owns every visual and structural design decision.
- Runtime modules inject no document shell, CSS reset, page geometry, wrapper,
  chrome, numbering, typography, or design token.
- Every artifact page has one stable unique marker and is discovered in DOM
  order.
- Protocol validation observes identity and static readiness; it does not judge
  CSS, measure overflow, or repair content.
- Protocol v1 does not stabilize animations, delayed client rendering, or an
  author-controlled asynchronous completion signal.
- Unslide never moves content between pages.
- Capture and PDF export consume canonical HTML, not a preview-only copy.
- PDF export prints HTML rather than assembling screenshots.
- One marked HTML page produces one PDF page for supported exports.
- Supported PDFs use one report-wide geometry.
- PDF validation is structural; PDF-native page images remain the visual
  evidence.
- PDF inspection renders the produced PDF, never source HTML.
- Business calculations and domain models stay outside Unslide.
- Project configuration remains operational and nonvisual.
- Missing report source is observable report state and does not invalidate an
  otherwise safe project.
- Report source and rendering resolve matching consumer-owned React 19 and
  React DOM peers; sources may export a created element or a synchronous
  zero-prop component.
- Canonical deliveries are replaced atomically; page-image replacement
  preserves unrelated files and recovery evidence.
- Effect services, failures, Layers, and scopes remain internal; public React
  helpers remain Promise-based.
- A public adapter or plugin seam requires at least two proven implementations.
- Public page numbers are one-based; stable HTML page IDs remain the identity
  used to correlate focused HTML and parity-validated PDF evidence.

## Related Contracts and Decisions

- [Product Design](docs/DESIGN.md)
- [HTML Artifact Protocol v1](docs/PROTOCOL.md)
- [Supported Delivery Contract](docs/SUPPORT.md)
- [D1 — Explicit fixed pages](docs/decisions/0001-explicit-pages.md)
- [D2 — Isolated rendered preview](docs/decisions/0002-rendered-preview.md)
- [D3 — Headless artifact protocol and author-owned design](docs/decisions/0003-headless-artifact-protocol.md)
- [D4 — HTML-first PDF export](docs/decisions/0004-html-first-pdf-export.md)
- [D5 — Effect v4 internal runtime](docs/decisions/0005-effect-v4-internal-runtime.md)
- [D6 — Public npm distribution](docs/decisions/0006-public-npm-distribution.md)
- [D7 — Consumer authoring and automation contracts](docs/decisions/0007-consumer-authoring-contracts.md)
