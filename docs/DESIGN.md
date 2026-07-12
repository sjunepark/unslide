# V1 Design

This document describes what using Unslide should feel like. It deliberately
avoids defining TSX element names, props, function signatures, CSS class names,
or package boundaries. Those are implementation decisions to make while using
the first report.

## Desired Experience

An author should be able to think in pages:

1. Decide what the report needs to communicate.
2. Decide which pages communicate it.
3. Place data and content on those pages using ordinary code and web layout.
4. Render the report.
5. Inspect the actual pages.
6. Adjust the source until the result is right.

This is intentionally similar to composing a static presentation, except the
source is plain text, the values come directly from code, and repeated structure
can be reused normally.

## Conceptual Vocabulary

These terms describe behavior, not a required implementation interface.

### Report

An ordered collection of explicit pages plus document-level metadata and shared
styling.

### Page

A fixed-size rectangular canvas. It owns a content region and may display shared
page chrome. Page content does not automatically continue elsewhere.

### Page chrome

Repeated material around the page content, such as a report title, engagement
name, confidentiality label, footer, or page number. A cover may intentionally
omit it.

### Report data

Ordinary values supplied by the caller. This can include text, numbers, arrays,
and already-prepared structures for tables or figures. Unslide does not require
a universal report schema.

### HTML artifact

The static document delivered by the renderer. It is the primary v1 output and
must be independently viewable.

### Capture artifact

A temporary image of a rendered page or complete report. It exists only so a
human or agent can judge the real visual result.

## Explicit Composition

Page membership is visible in source. An author can answer “which page contains
this material?” without understanding a pagination algorithm.

Normal code may choose whether a whole page exists. For example, a report may
include a sensitivity page only when sensitivity data is provided. The decision
is made in report source, not by measuring remaining space.

The author may also split a large table manually or introduce another page.
These choices are part of report design and remain readable in the source diff.

## Fixed Geometry

V1 begins with one real report size chosen by the first use case. Page geometry
includes the outer dimensions, usable content region, and reserved chrome
regions.

The first implementation should make these boundaries visually obvious in
screen preview. Browser zoom may change how large a page appears on a monitor,
but must not change its internal layout.

Additional page sizes and per-page orientations are introduced only after a
real report requires them.

## Content Fit and Overflow

Content fit is an authoring responsibility. Unslide does not need an overflow
analyzer, repair system, or report linter in v1.

During development, overflow should remain visually apparent rather than being
silently hidden. The author or agent sees the rendered result and changes the
content, layout, typography, or page allocation.

This is an accepted tradeoff of explicit pagination: variable content can
require a report-source adjustment, while the system remains small and
predictable.

## Headers, Footers, and Page Numbers

Headers and footers are regions inside each explicitly constructed page, not
features of an automatic pagination engine.

Shared mechanics may provide page position and total page count to repeated
chrome. The report remains free to vary or suppress chrome for covers, divider
pages, or other intentional designs.

The first report should determine which repetition is worth centralizing.

## Data Flow

Report data should enter through ordinary typed code. The framework does not
introduce a proprietary variable language, data-binding expression syntax, or
domain schema.

The caller prepares values before rendering. Report source may format and place
those values, but domain computation remains with the caller.

The first spike should test both scalar values and repeated data such as a
small table. That is enough to evaluate whether the authoring approach feels
natural.

## Styling

HTML and CSS perform layout. The project should prefer ordinary web behavior
over custom layout machinery.

V1 needs enough shared styling to establish:

- page dimensions and content regions;
- a screen background that makes page edges visible;
- print page separation;
- a small typography hierarchy; and
- one credible example report.

It does not need a general theme interface, token taxonomy, or large library of
report-specific patterns.

## Rendered Inspection

Source is not visual truth. Font metrics, line wrapping, table width, and visual
balance become real only after browser layout.

The preview workflow therefore produces browser-rendered images. An agent
should be able to run one documented command and inspect one image per page
without access to a user's interactive browser session.

The preview tool should use an isolated profile and require no login state. Its
artifacts are disposable and should not be reviewed as hand-authored files.

## Output Expectations

The v1 artifact is static HTML. It should:

- open locally;
- retain real text and semantic HTML rather than flattening the report to
  images;
- use local or embedded assets needed for the report;
- require no application backend; and
- preserve explicit page separation when printed from the supported browser.

PDF may be produced from the same browser for convenience, but HTML remains the
format that defines v1.

## Criteria for Reuse

Do not create a reusable report concept merely because it can be imagined.
Extract it when at least one of these is observed:

- the same mechanics are repeated across several pages;
- changing the behavior otherwise requires synchronized edits;
- authors repeatedly need knowledge that a shared module can hide; or
- a second real report demonstrates the same need.

Small report-specific markup may remain in report source indefinitely.

## Questions Deliberately Deferred

The following are decided during implementation, using the first report as
evidence:

- the exact TSX authoring syntax;
- the static rendering runtime;
- whether an existing UI library is used at all;
- the names and shapes of reusable report concepts;
- CSS file organization;
- source and package directory layout;
- how assets are embedded;
- whether page size is initially fixed or configurable;
- whether the project is published as a package after v1; and
- which conveniences deserve commands beyond render and capture.

Automatic pagination, visual editing, animations, and automated report linting
are outside v1 rather than deferred syntax questions.
