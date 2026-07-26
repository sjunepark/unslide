# Product

## Idea

Unslide replaces manual static-report authoring in presentation software with
plain-text code and HTML. It serves reports whose pages are deliberately
composed, not documents that need automatic text flow.

Binary authoring formats entangle calculations, wording, and visual placement;
they are difficult for coding agents to inspect and awkward to review as diffs.
HTML already provides the necessary text, tables, images, vector graphics, and
layout, while ordinary code supplies reusable structure and direct data flow.

The thesis is simple: for deliberately designed static reports, code is a
better authoring medium than a slide file.

## User and Job

The primary user is a technical professional who:

- already produces analysis in code;
- wants a polished, repeatable report from those results;
- works with coding agents as authors or reviewers; and
- is willing to decide explicitly what belongs on each page.

Given display-ready values and report source, Unslide produces canonical
standalone HTML that opens locally, can be inspected page by page, and can be
exported to a browser-produced PDF without introducing a second layout system.
Installed, versioned tooling lets other repositories adopt that lifecycle
without copying its implementation.

## Core Workflow

1. Prepare display-ready data in ordinary code.
2. Compose a known set of fixed pages in typed source.
3. Build one standalone HTML artifact.
4. Validate and capture the HTML in isolated Chromium.
5. Inspect every page and revise source.
6. Optionally export the same HTML to PDF and inspect the actual PDF pages.

The author owns content fit. Unslide does not move content, shrink text,
truncate values, or otherwise repair overflow. PDF validation may expose
unintended fragmentation through page-count mismatch, but the correction
remains a source change.

## Principles

- **Explicit pages.** Page membership is authored, not inferred.
- **Ordinary code.** Prefer TypeScript, HTML, and CSS over a bespoke language.
- **Rendered truth.** Source is editable intent; target-native output is the
  visual result.
- **Author-owned design.** Reports own their DOM, geometry, typography,
  repeated material, print rules, and visual system.
- **Nonvisual tooling.** Unslide owns compilation, validation, capture, export,
  and safe publication, not design policy.
- **Ordinary data.** Callers retain business calculations, domain models,
  provenance, and conclusions.
- **One canonical artifact.** PDF and inspection images derive from HTML rather
  than becoming parallel authoring formats.
- **Small public surface.** Add reusable concepts only after report evidence
  shows they hide durable complexity.
- **One path for people and agents.** Automation exercises the real report in
  an isolated browser, not a preview-only renderer or personal browser session.

## Success

Using repository commands and documentation alone, an agent should be able to:

- change report data or layout source;
- regenerate standalone HTML;
- capture readable images for every marked page;
- identify and correct an obvious visual problem; and
- deliver HTML and, when required, a validated PDF without manipulating a
  binary authoring file.

Credibility requires real report trials and packed-consumer evidence, not only
a toy page or an internal API test.

## Product Boundary

Unslide does not provide:

- automatic pagination, content redistribution, or fit repair;
- presentation controls, animations, or slide navigation;
- a drag-and-drop editor;
- a finance-specific or universal report-data model;
- business calculation or provenance infrastructure;
- a required theme, page frame, chrome model, or design system;
- cross-browser pixel parity or alternate rendering engines;
- PPTX, DOCX, or PDF as a primary authoring format;
- mixed page geometry within one PDF; or
- a generalized source, browser, or exporter plugin system backed by only one
  implementation.

## Delivery and Future Scope

React is the first supported authoring module, while the durable artifact seam
remains HTML-based. Reports own all visual source; configuration stays limited
to operational paths. [D3](docs/decisions/0003-headless-artifact-protocol.md)
records that ownership boundary.

PDF is derived from canonical HTML through the supported Chromium pipeline and
inspected from the produced PDF. [D4](docs/decisions/0004-html-first-pdf-export.md)
records the print and validation contract.

Stable behavior is distributed as the public `unslide` npm package. The
package remains 0.x until independent consumers justify a 1.0 compatibility
promise. Optional visual recipes may be distributed only as editable,
report-owned source.

[PLAN.md](PLAN.md) owns the evidence gates for deferred capabilities. A
deferred capability is not current scope until an explicit decision accepts
it.
