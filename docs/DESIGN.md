# Product Design

This document defines the authoring experience and ownership model. The
[artifact protocol](PROTOCOL.md) owns browser-consumption requirements, the
[support contract](SUPPORT.md) owns verified delivery limits, and
[Repository Workflow](WORKFLOW.md) owns commands.

## Authoring Experience

An author or coding agent should be able to:

1. Prepare display-ready values in ordinary code.
2. Compose explicit pages with arbitrary HTML and CSS.
3. Mark those pages without adopting a prescribed element or page component.
4. Build one standalone HTML artifact.
5. Inspect the actual browser-rendered pages.
6. Export the same HTML through the supported browser when PDF is needed.
7. Inspect the actual PDF pages and revise source until both targets are right.

The author decides every visual property. Unslide makes the lifecycle
predictable.

The accepted consumer workflow adds focused or complete `review` as a
composition of these same steps. It records exact artifact evidence but does
not judge the report. See the [CLI command contract](COMMANDS.md),
[result and manifest contract](RESULTS.md), and
[React authoring contract](AUTHORING.md).

The packaged [authoring guide](GUIDE.md) teaches the workflow through editable
business-report source. It keeps the page manifest, repeated page families,
numbering, contents, assets, fit debugging, and visual acceptance inside the
report while the [CLI workflow reference](CLI.md) explains lifecycle freshness.

## Vocabulary

| Term                | Meaning                                                                                        |
| ------------------- | ---------------------------------------------------------------------------------------------- |
| Report              | User-owned source and data that produce a complete ordered document                            |
| Page                | An explicitly composed capturable region and, for supported PDF export, one printed sheet      |
| Page marker         | A nonvisual protocol attribute that gives a page a stable unique identity and observable order |
| Repeated material   | Any report-owned structure reused across pages, such as a label, logo, or number               |
| HTML artifact       | The canonical standalone delivery output                                                       |
| PDF artifact        | A delivery output printed from canonical HTML, not a second renderer                           |
| Inspection artifact | A disposable image rendered from the HTML or PDF target being judged                           |
| Recipe              | Optional editable visual source; never a runtime requirement                                   |

These terms describe behavior, not required React components, classes, or DOM
structure.

## Ownership

### Caller

The caller owns business calculations, domain models, provenance, conclusions,
and values prepared for display. Unslide does not introduce an expression
language or universal report schema.

### Report source

Report source owns:

- the complete document tree and semantics;
- explicit page sequence and conditional pages;
- dimensions, orientation, margins, padding, and overflow behavior;
- screen and print layout;
- fonts, assets, colors, typography, and design tokens; and
- repeated material, numbering, or their absence.

Normal code may reuse report-local components or split content manually.
Unslide does not measure remaining space or redistribute content.

### Unslide

Unslide owns compilation, standalone serialization, protocol validation,
isolated Chromium operation, capture, PDF export, target-native inspection, and
safe artifact publication.

The renderer injects no document shell, reset, stylesheet, page frame,
geometry, chrome, or typography. Validation may report observable contract
failures but never restyles or repairs a report.

## Artifact Boundary

The HTML protocol stays smaller than any authoring implementation. It defines
version metadata, ordered unique page markers, and bounded readiness for the
document, fonts, and images. Protocol v1 supports static visual resources, not
animations or delayed client rendering, and has no author-controlled
asynchronous readiness signal. See [HTML Artifact Protocol v1](PROTOCOL.md)
for the normative contract.

React is the first supported source implementation because the proof reports
establish typed TSX and static server rendering. A generalized renderer seam
remains deferred until a second real implementation reveals what varies.

## Project Configuration

Configuration tells tooling where report source and derived artifacts live.
The [JSON Schema](../schema/unslide.schema.json) is the field-level source of
truth. Geometry, fonts, margins, colors, chrome, and all other visual choices
remain in source.

Conventional artifact paths may be derived from the report name, while source
stays explicit and existing overrides stay authoritative. Source absence is
observable report state rather than a reason to block unrelated artifact work.
Configuration still contains no freshness or visual policy.

## HTML and PDF Inspection

HTML capture loads canonical HTML in isolated Chromium, waits for protocol
readiness, and writes one image per marked element. It works across unrelated
DOM structures and geometries and uses no personal browser state.

PDF export applies report-owned print CSS. A report must provide one active,
unqualified base `@page` size using a supported named size or positive
absolute dimensions. Export rejects missing, non-concrete, or ambiguous sizing
instead of accepting Chromium's implicit Letter fallback. Export waits again
after print media activates so print-only static resources are ready. Exact
print color adjustment remains an authored CSS choice.

For supported export, one marked HTML page must produce one PDF page and all
pages in a PDF share one geometry. The produced PDF is validated before
publication for structural delivery invariants, not generic visual fidelity.
It is then rasterized directly for inspection; every PDF-native page image is
required evidence, and HTML screenshots are not PDF evidence.

Tagged output and outlines are useful defaults, not claims of PDF/UA or WCAG
conformance. Exact environment, semantics, accessibility limits, repeatability,
and deferred PDF features belong to the [support contract](SUPPORT.md).

## Recipes and Continuing Scope

Scaffolding may create removable report source and styling. A managed recipe
registry remains deferred until repeated adoption proves that one-time source
is insufficient; any future design must preserve user ownership, modification
safety, and an explicit conflict path.

Automatic pagination, fit repair, visual editing, presentation behavior,
business calculations, mandatory design systems, and speculative adapters
remain outside the product boundary. [D3](decisions/0003-headless-artifact-protocol.md)
records the rationale, and the
[product scope](../PRODUCT.md#deferred-capability-gates) owns the evidence
gates.
