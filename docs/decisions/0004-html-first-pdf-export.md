# D4 — HTML-First PDF Export

Date: 2026-07-13

Status: accepted for V2; export implemented, PDF-native inspection pending

## Context

Recipients often need PDF delivery, but a separate PDF layout implementation
would create a second visual truth. Building PDF pages from HTML screenshots
would preserve appearance at the cost of real text, semantics, links, and
vector output.

V1 already uses a pinned Playwright-managed Chromium build to judge the
canonical standalone HTML. Chromium also supplies a print-to-PDF path that can
apply report-owned paged-media CSS.

## Decision

PDF is a derived delivery artifact produced from the canonical standalone HTML
through the supported Chromium print pipeline.

Report source owns print media, page size, orientation, margins, page breaks,
color adjustment, and repeated material. The exporter does not inject headers,
footers, paper geometry, or layout rules. It prefers CSS-defined page size and
includes backgrounds by default.

The exporter exposes durable Unslide concepts rather than the browser's raw PDF
option object. Tagged PDF and document outlines are supported defaults, not a
claim of formal accessibility conformance.

For the initial supported path, every marked HTML page must produce exactly one
PDF page, and all pages in one PDF use a common geometry. The exporter parses
the result and fails with an actionable error when page counts differ.

Visual inspection rasterizes the actual PDF into one image per PDF page. HTML
screenshots are not accepted as evidence of PDF correctness.

## Consequences

Benefits:

- HTML and PDF share one source and browser layout implementation.
- PDF delivery does not constrain report DOM or styling.
- Page-count validation catches blank pages and unintended print fragmentation.
- PDF-native inspection preserves the rendered-truth workflow.
- The exporter can remain internal until a second print engine proves a public
  adapter seam.

Costs:

- Authors must supply correct print CSS.
- Screen and print output may differ intentionally and both require inspection.
- A PDF parser and PDF rasterization implementation add development
  dependencies.
- Tagged browser output does not by itself establish PDF/UA compliance.
- Mixed page sizes may require per-page printing and PDF merging.

## Deferred Capabilities

- Mixed geometry or orientation within one PDF.
- PDF/A conformance.
- Encryption and permissions.
- Digital signatures.
- Attachments and interactive forms.
- Multiple print engines.

Each requires separate evidence and should not enlarge the initial exporter
interface.

## Revisit When

Revisit common-geometry output when real reports require mixed page sizes.
Revisit the exporter seam when a second print engine or a post-processing
pipeline has a proven use case.
