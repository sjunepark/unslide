# Unslide

Unslide is a code-first way to create fixed-page HTML reports. Authors write
plain-text report source, pass ordinary data into it, and receive a static HTML
document made of explicitly composed pages.

The project is intentionally narrower than a presentation framework or a
publishing engine. V1 is for static reports that are laid out page by page. It
does not automatically move content between pages.

Status: **V1 complete; V2 Core Goal 1 complete.** The repository now verifies
explicit pages through a headless HTML artifact protocol as well as standalone
HTML and isolated capture. The remaining V2 work moves all visual policy into
report-owned source, packages stable tooling, and adds HTML-first PDF export.
See [`PLAN.md`](PLAN.md) before starting work.

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
```

Open `artifacts/spike/report.html` in an ordinary browser. Inspect the three
page images under `.tmp/captures/spike/`. Generated HTML is kept under
`artifacts/`; disposable inspection output is kept under `.tmp/captures/`.

Change values in `src/spike/data.ts` or composition in
`src/spike/report.tsx`, then repeat render, capture, and visual inspection.
The author must correct overflow in source; the tooling does not detect or
repair it.

The credible eight-page operating report uses the same loop:

```sh
pnpm run render:report
pnpm run capture:report
```

Its standalone artifact is `artifacts/operating-review/report.html`; its page
images are under `.tmp/captures/operating-review/`. The typed source and data
live in `src/reports/operating-review/`. Northstar Goods and all report values,
commentary, and decisions are fictional examples created solely to demonstrate
the authoring workflow.

## Current V1 Foundation

After both reports repeated the same mechanics, `src/unslide/` centralized the
fixed A4 page geometry, optional chrome with numbering, print separation, and
standalone HTML writer. Report-specific TSX and CSS remain beside each report;
there is no general component catalogue or published package interface.

That foundation is a verified baseline, not the target public interface. V2
retains the build and inspection behavior while removing required geometry,
chrome, document wrappers, and injected CSS from reusable tooling.

## Start Here

- [PRODUCT.md](PRODUCT.md) — product thesis, proven V1 scope, and accepted V2
  direction.
- [docs/DESIGN.md](docs/DESIGN.md) — desired authoring and viewing behavior,
  expressed without committing to syntax.
- [ARCHITECTURE.md](ARCHITECTURE.md) — system shape, flows, and invariants.
- [PLAN.md](PLAN.md) — current progress and the next implementation slice.
- [docs/WORKFLOW.md](docs/WORKFLOW.md) — verified install, render, capture,
  validation, and artifact paths.
- [docs/PROTOCOL.md](docs/PROTOCOL.md) — implemented HTML page-marker and static
  readiness contract.
- [Explicit pages decision](docs/decisions/0001-explicit-pages.md) — why v1
  deliberately avoids automatic pagination.
- [Rendered preview decision](docs/decisions/0002-rendered-preview.md) — why
  browser capture is development tooling rather than part of the report
  runtime.
- [Headless artifact decision](docs/decisions/0003-headless-artifact-protocol.md)
  — why reports own all DOM and visual design.
- [HTML-first PDF decision](docs/decisions/0004-html-first-pdf-export.md) — why
  PDF derives from canonical HTML and receives target-native inspection.
- [V2 detailed plans](docs/plans/v2-core.md) — the first `/goal`-ready execution
  track; adoption and PDF plans are linked from `PLAN.md`.

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
- Versioned tooling will own compilation, artifact validation, isolated capture,
  and PDF export instead of being copied into consuming repositories.
- PDF will be printed from canonical HTML and visually inspected from the
  produced PDF.
- Optional visual recipes may generate editable source but will not be runtime
  requirements.

These items are planned until their corresponding V2 goals pass. The commands
above remain the supported V1 workflow today.

## Working Principle

Unslide owns the report lifecycle, never the report's design.

## License

Unslide is available under the [MIT License](LICENSE).
