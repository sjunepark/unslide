# Unslide

Unslide is a code-first way to create fixed-page HTML reports. Authors write
plain-text report source, pass ordinary data into it, and receive a static HTML
document made of explicitly composed pages.

The project is intentionally narrower than a presentation framework or a
publishing engine. V1 is for static reports that are laid out page by page. It
does not automatically move content between pages.

Status: **V1 complete.** The explicit-page authoring, standalone HTML, isolated
capture, real-report trial, minimum reuse extraction, and clean-checkout
workflow are verified.

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

## Proven Foundation

After both reports repeated the same mechanics, `src/unslide/` centralized the
fixed A4 page geometry, optional chrome with numbering, print separation, and
standalone HTML writer. Report-specific TSX and CSS remain beside each report;
there is no general component catalogue or published package interface.

## Start Here

- [PRODUCT.md](PRODUCT.md) — problem, thesis, users, v1 scope, and success.
- [docs/DESIGN.md](docs/DESIGN.md) — desired authoring and viewing behavior,
  expressed without committing to syntax.
- [ARCHITECTURE.md](ARCHITECTURE.md) — system shape, flows, and invariants.
- [PLAN.md](PLAN.md) — current progress and the next implementation slice.
- [docs/WORKFLOW.md](docs/WORKFLOW.md) — verified install, render, capture,
  validation, and artifact paths.
- [Explicit pages decision](docs/decisions/0001-explicit-pages.md) — why v1
  deliberately avoids automatic pagination.
- [Rendered preview decision](docs/decisions/0002-rendered-preview.md) — why
  browser capture is development tooling rather than part of the report
  runtime.

## V1 in One Sentence

Create a small report from typed code and data, render it to a local static HTML
file, and let a human or coding agent inspect real browser-rendered page images.

## Current Direction

- HTML is the report artifact.
- TypeScript and TSX are the initial authoring direction.
- A report is an ordered set of fixed-size, explicitly authored pages.
- Data reaches report source through ordinary language values and props.
- Headers, footers, and page numbers are ordinary parts of each page.
- A repository command will render page screenshots in isolated headless
  Chromium for agent inspection.
- Playwright is preview tooling only; generated reports do not depend on it.

The spike intentionally keeps report composition and styling local. The real
report trial will determine which mechanics, if any, merit a reusable module.

## Working Principle

If a proposed feature does not make explicit fixed-page HTML reports easier to
author, render, or inspect, it does not belong in v1.

## License

Unslide is available under the [MIT License](LICENSE).
