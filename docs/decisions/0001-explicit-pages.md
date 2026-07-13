# D1 — Explicit Fixed Pages in V1

Date: 2026-07-13

Status: accepted

V2 clarification: explicit page membership remains accepted, but page geometry,
padding, repeated material, and numbering are report-owned design. See
[D3](0003-headless-artifact-protocol.md).

## Context

Static reports need predictable page dimensions, padding, headers, footers, and
page numbers. Automatic pagination introduces a separate class of problems:
content fragmentation, repeated table headers, widows and orphans, flowing
footnotes, running content, and engine-specific page-breaking behavior.

The initial use case does not require variable-length prose to flow through an
unknown number of pages. The author is already willing to compose pages
deliberately, as in a static presentation.

## Decision

V1 models a report as an ordered collection of explicit fixed pages.

Content stays on the page where report source places it. The framework does not
measure remaining space and move content to another page. Source may
conditionally add or remove whole pages.

Overflow is resolved through visual inspection and a source change. There is no
automatic repair or layout-lint subsystem.

## Consequences

Benefits:

- The first implementation is small.
- Page count and composition remain visible in source.
- Headers, footers, and numbering do not require a paged-media engine.
- Agents can edit report structure using ordinary code.
- Rendering behavior is easier to explain and debug.

Costs:

- Unexpectedly long content may require manual adjustment.
- Templates are not guaranteed to accept arbitrary text lengths.
- Large tables may need to be split explicitly.
- Authors must inspect rendered pages before delivery.

These costs are acceptable for the v1 use case.

## Revisit When

Revisit this decision only when real reports repeatedly require unknown-length
content to flow across pages without author intervention. Automatic pagination
should then be evaluated as a distinct capability, not added incrementally to
the explicit-page model.
