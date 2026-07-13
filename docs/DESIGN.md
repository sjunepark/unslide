# Product Design

Status: **V1 behavior is proven, artifact protocol v1 is implemented, and the
React authoring interface now renders report-owned complete documents without
visual policy. V2 continues with canonical capture, package-based adoption,
and HTML-first PDF export.**

This document describes the intended authoring experience and ownership model.
Exact TypeScript names and command syntax remain implementation outcomes unless
they already exist in the V1 workflow.

## Desired Experience

An author or coding agent should be able to:

1. Prepare display-ready values in ordinary code.
2. Compose a known set of explicit pages with arbitrary HTML and CSS.
3. Mark those pages for Unslide without adopting a prescribed page element.
4. Build one standalone HTML artifact.
5. Inspect the actual browser-rendered pages.
6. Export the same HTML through the canonical browser to PDF when needed.
7. Inspect the actual PDF pages and revise source until both targets are right.

The author decides every visual property. Unslide makes the build and inspection
loop predictable.

## Conceptual Vocabulary

These terms describe behavior rather than required source syntax.

### Report

User-owned source and data that produce an ordered static document. A report
owns its complete HTML structure, document metadata, styles, fonts, assets, and
page composition.

### Page

One explicitly composed region intended for independent capture and, when PDF
is requested, one printed sheet. A page may use any element and any geometry.
Content does not automatically continue to another page.

### Page marker

A nonvisual artifact-protocol marker that gives a page a stable unique identity
and makes its order observable to tooling. The marker does not add an element,
class, style, size, padding, or chrome.

### Repeated material

Any report-owned structure repeated across pages, such as a title, logo,
confidentiality notice, running label, or page number. Unslide does not name or
require header, footer, or chrome regions. Ordinary source may reuse whatever
the report needs.

### HTML artifact

The canonical standalone output. It retains semantic HTML and real text, opens
without the Unslide development runtime, and supplies the input for capture and
PDF export.

### PDF artifact

A derived delivery output produced by printing the canonical HTML through the
supported browser. It is not a second renderer or authoring source.

### Inspection artifact

A disposable image rendered from the delivery target being judged. HTML
inspection captures HTML pages; PDF inspection rasterizes the generated PDF
pages.

### Recipe

Optional editable source that demonstrates a design or repeated report-local
pattern. Recipes may include page geometry, typography, repeated material,
tables, or figures, but the rendering tool never requires them.

## Author-Owned Design

Report source owns all visual and structural decisions, including:

- the full document tree and semantic elements;
- page dimensions, orientation, margins, padding, and overflow behavior;
- screen and print layout;
- fonts, colors, rules, backgrounds, and design tokens;
- repeated material and page numbering, or their absence;
- CSS organization and optional styling dependencies; and
- page-specific and conditional composition.

The reusable renderer must not inject a reset, foundation stylesheet, wrapper,
page frame, or default chrome. It may validate observable artifact behavior but
must not repair or restyle the report.

## Explicit Composition and Content Fit

Page membership remains readable in source. Normal code may conditionally add
or remove a whole page, and authors may split content manually. Unslide does
not measure remaining space and move content between pages.

Overflow remains an authoring problem. Inspection should expose it, and export
validation may report that marked HTML pages produced an unexpected number of
PDF sheets. Tooling must not silently shrink, truncate, or redistribute content.

## Data Flow

Data enters report source through ordinary typed values. Callers own business
calculations, domain models, provenance, and conclusions. The authoring module
does not introduce a proprietary expression language or universal report
schema.

## Artifact Protocol

The public artifact contract should remain smaller and more durable than any
authoring module:

- the output is independently viewable HTML;
- pages are discoverable in document order through a versioned nonvisual
  marker;
- page identities are present and unique;
- fonts, images, and optional asynchronous visuals have an observable readiness
  path; and
- capture or export failures identify the page or resource involved.

React is the first source adapter because V1 proved typed TSX and static server
rendering. The HTML contract must remain usable by other generators without
requiring a generalized plugin interface in V2.

## Project Configuration

Project configuration tells tooling how to operate. It may describe report
entries, output paths, inspection directories, registry locations, or explicit
export choices.

It must not become a design schema. Fonts, page sizes, margins, padding,
colors, chrome, and visual tokens stay in source. Configuration should be
schema-validated and deterministic, with clear diagnostics for unsupported or
unknown fields.

## Distribution and Recipes

Stable behavior belongs in a versioned package so fixes and migrations remain
local to the implementation. One-time project scaffolding may create report
source and configuration.

A source registry is optional later work. If evidence justifies it, registry
items should be visual recipes or complete report starters that users own after
installation. Modified generated source must never be overwritten silently.
Managed upgrades would require provenance hashes, dry-run diffs, and an
explicit conflict path; that system is not part of the initial V2 core.

## HTML Inspection

The capture path loads the canonical HTML in isolated Chromium, waits for
visual readiness, discovers the marked pages, and writes one image per page.
It must work for unrelated DOM structures and page geometries.

The browser profile remains isolated and requires no login state. Inspection
artifacts are disposable and do not become authoring source.

## PDF Export and Inspection

PDF export prints the canonical HTML with Chromium print media. Report CSS owns
paper geometry, page breaks, color adjustment, and print-specific presentation.
The initial exporter should prefer CSS page size, include report backgrounds,
and support tagged output and a document outline without exposing the raw
browser option surface as Unslide's interface.

Export succeeds only when:

- the HTML artifact satisfies the page protocol;
- required resources are ready;
- the browser produces a readable PDF;
- the number of PDF pages equals the number of marked HTML pages; and
- the resulting PDF can be inspected page by page.

Initial V2 supports arbitrary report-wide page geometry but does not promise
mixed page sizes or orientations in one PDF. Mixed geometry requires a separate
evidence-backed decision because it may require per-page printing and PDF
merging.

Tagged output and outlines are useful defaults, not a claim of PDF/UA
compliance. Formal accessibility, PDF/A, encryption, signing, attachments, and
other publishing requirements remain separate future capabilities.

## Evidence Required for V2

The target interface is not proven until all of the following coexist:

- the current operating review still renders and captures correctly;
- a contrasting fixture uses different geometry, typography, spacing, and no
  repeated chrome;
- neither report imports required visual source from the runtime;
- a clean consumer fixture installs the versioned tooling instead of copying
  implementation files;
- HTML capture works through the common artifact protocol; and
- browser-produced PDF export and PDF-native inspection pass for both reports.

## Continuing Scope Boundaries

Automatic pagination, automatic fit repair, a visual editor, animations,
business calculations, a mandatory design system, and speculative renderer
plugins remain outside the accepted direction.

## Evidence from V1

The three-page spike and eight-page operating review proved explicit page
composition, typed data, standalone HTML, isolated Chromium capture, and the
need for rendered inspection. They also showed that report-specific figures,
tables, bilingual layouts, and visual systems are clearest as direct source.

V1 centralized A4 geometry and chrome because both initial reports repeated
them. That was useful implementation evidence, but copying that visual
foundation into other repositories would distribute policy and maintenance
together. V2 retains the proven rendering mechanics while moving all visual
policy back to report-owned source.
