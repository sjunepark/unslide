# Architecture

Status: **pre-implementation**. This document fixes system responsibilities and
invariants while leaving code-level interfaces to the first implementation
spike.

## Purpose and Boundary

Unslide turns user-owned report source plus user-owned data into a static HTML
document composed of explicit fixed pages. A development-only capture path
renders that HTML in a real browser and saves page images for inspection.

Unslide owns page structure, shared document styling, static rendering, and the
preview workflow. It does not own the calculations that produce report values,
the meaning of a report's domain, or automatic decisions about where content
should move.

## System Shape

```text
user data + report source
            |
            v
      static report renderer
            |
            v
        report.html --------------------> ordinary browser
            |
            | development only
            v
   isolated browser capture
            |
            v
     page-01.png, page-02.png, ...
```

The HTML artifact is the product output. Page images are temporary observation
artifacts used while authoring.

## Major Responsibilities

### Report source

User-owned typed source determines:

- which pages exist and their order;
- which data appears on each page;
- page-specific structure and wording; and
- intentional conditional pages.

The exact source syntax and rendering runtime are not architecture decisions
yet. TypeScript and TSX are the starting direction because they provide ordinary
data flow and agent-readable markup.

### Page foundation

The shared page foundation establishes only the mechanics repeated by every
report:

- fixed page geometry;
- the content region;
- optional repeated page chrome such as headers and footers;
- page position and total-page context where needed; and
- screen and print presentation of page boundaries.

It does not decide report-specific layout or automatically fit content.

### Static renderer

The static renderer evaluates the report source against supplied data and emits
an HTML artifact. It owns the document shell and the inclusion of the styles and
assets required by the output.

The renderer must not require a client application, application state, or a
network request to display the completed report.

### Browser capture

Browser capture is a development adapter. It launches an isolated browser,
loads the generated HTML, waits until the page is visually ready, and creates
images suitable for human or agent inspection.

Playwright with Chromium is the initial direction because it is programmable,
cross-platform, and independent of a user's browser profile. It remains outside
the generated report and outside the report's public runtime interface.

## Authoring Flow

1. The author or agent changes report data, wording, or layout source.
2. The renderer produces the current HTML artifact.
3. The capture adapter renders the artifact in Chromium.
4. The adapter saves the whole document or individual pages as images.
5. The author or agent inspects those images.
6. If content overflows or the composition is weak, the source is revised.

There is no second preview layout. Inspection exercises the same HTML and CSS
that a recipient opens.

## Page Behavior

A report is an ordered collection of pages. Each page has a fixed width and
height. Content belongs to the page on which the source places it.

The browser may lay out content within a page using normal HTML and CSS, but
Unslide does not fragment a page's content or move it to a later page. This
keeps page count and page composition under source control.

Conditional source may add or remove an entire page. When that happens, page
numbering follows the final ordered collection.

## Invariants

- The HTML artifact remains viewable without Playwright.
- Page images are derived artifacts and never become authoring source.
- Browser capture uses the generated report rather than a preview-only copy.
- V1 never moves content between pages automatically.
- Overflow is corrected by changing report source; it is not silently repaired,
  shrunk, or truncated by the framework.
- User data remains ordinary caller-owned data.
- Business calculations stay outside Unslide.
- Preview automation stays outside the runtime required by report recipients.
- A new reusable concept requires evidence from real report repetition.
- Exact syntax is decided from implementation experience, then documented.

## Renderer Scope

One browser engine is sufficient for v1. Chromium is the canonical development
preview engine. Unslide does not promise identical rendering across every
browser or operating system.

This is a preview contract, not a claim that screenshots are the report format.
Recipients still receive HTML.

## Current Code Map

There is no implementation tree yet. Start with:

- [PRODUCT.md](PRODUCT.md) for scope and success criteria.
- [docs/DESIGN.md](docs/DESIGN.md) for expected behavior.
- [PLAN.md](PLAN.md) for the first implementation slice.

The first spike will establish the smallest workable source and tool layout.
Package boundaries, file names, framework choice, and public interfaces should
not be documented before that evidence exists.

## Related Decisions

- [D1 — Explicit fixed pages in v1](docs/decisions/0001-explicit-pages.md)
- [D2 — Repository-owned rendered preview](docs/decisions/0002-rendered-preview.md)
