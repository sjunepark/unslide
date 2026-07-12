# Unslide

Unslide is a code-first way to create fixed-page HTML reports. Authors write
plain-text report source, pass ordinary data into it, and receive a static HTML
document made of explicitly composed pages.

The project is intentionally narrower than a presentation framework or a
publishing engine. V1 is for static reports that are laid out page by page. It
does not automatically move content between pages.

Status: **documentation-first; implementation has not started.**

## Start Here

- [PRODUCT.md](PRODUCT.md) — problem, thesis, users, v1 scope, and success.
- [docs/DESIGN.md](docs/DESIGN.md) — desired authoring and viewing behavior,
  expressed without committing to syntax.
- [ARCHITECTURE.md](ARCHITECTURE.md) — system shape, flows, and invariants.
- [PLAN.md](PLAN.md) — current progress and the next implementation slice.
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

The exact authoring syntax, rendering library, CSS organization, and module
layout will be decided while building the first working report. The documents
record product behavior and constraints, not speculative implementation
interfaces.

## Working Principle

If a proposed feature does not make explicit fixed-page HTML reports easier to
author, render, or inspect, it does not belong in v1.
