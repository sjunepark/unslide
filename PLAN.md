# Plan

Status: rendering-loop spike complete; real-report trial next.

Current next action: **Phase 2 — real report trial.**

This is the live plan. Update completed work, decisions, blockers, and the next
action in place. Do not append session logs.

## Scope Guardrails

V1 is an explicit fixed-page HTML report tool. Keep the following outside the
implementation plan unless a later decision changes scope:

- automatic pagination;
- animations and presentation controls;
- visual drag-and-drop editing;
- report linting or automatic overflow repair;
- a large report design system;
- multiple browser adapters;
- domain-specific data or calculation models; and
- speculative package interfaces.

The first implementation exists to discover good syntax. The plan therefore
specifies outcomes and evidence, not proposed function signatures or element
names.

## Progress

| Phase | State | Exit artifact |
|---|---|---|
| 0. Foundation | Complete | Product, design, architecture, decisions, and live plan |
| 1. Rendering-loop spike | Complete | Three-page data-driven HTML report plus agent-readable page captures |
| 2. Real report trial | Next | One credible report reproduced through the complete loop |
| 3. Minimum reuse extraction | Pending | Small interface justified by repeated real usage |
| 4. V1 hardening | Pending | Fresh-clone workflow and documented v1 release |

## Phase 0 — Foundation

Completed:

- Defined the product thesis and primary user.
- Limited v1 to explicit fixed pages.
- Chose HTML as the primary artifact.
- Recorded TypeScript and TSX as the initial authoring direction without fixing
  syntax.
- Separated browser capture from the report runtime.
- Chose Playwright with Chromium as the initial preview direction.
- Explicitly excluded automatic pagination and report linting from v1.

No implementation scaffold or dependency has been created yet.

## Phase 1 — Rendering-Loop Spike

### Objective

Prove the smallest complete loop from typed data and report source to static
HTML and agent-inspectable rendered pages.

### Work

1. Choose the smallest credible TypeScript/TSX static-rendering setup.
   - Decide the rendering runtime while writing the spike.
   - Prefer familiar behavior over a custom JSX runtime or bespoke language.
   - Record the reason only after the code demonstrates the choice.

2. Create one deliberately small report fixture.
   - Use three explicit pages: a sparse cover, a normal content page, and a
     denser page containing repeated data such as a table.
   - Feed it typed sample data rather than hard-coding every displayed value.
   - Include a repeated footer and page numbering so the shared mechanics are
     exercised.

3. Produce a static HTML artifact.
   - Make page edges visible in ordinary screen viewing.
   - Preserve fixed page separation in browser print preview.
   - Keep the output locally viewable without a running application.

4. Add the rendered-inspection command.
   - Launch isolated headless Chromium.
   - Load the actual generated artifact.
   - Wait for the document and fonts to be visually ready.
   - Save one readable image per page in a temporary output directory.
   - Make failures concise and actionable for a shell-driven agent.

5. Exercise one intentional overflow.
   - Change sample content so one page visibly exceeds its intended region.
   - Confirm the image makes the problem apparent.
   - Fix the source manually; do not add an overflow detector.

6. Document only the commands that now exist.
   - Installation.
   - HTML generation.
   - Page capture.
   - Opening the final artifact.

### Decisions Made During This Phase

The implementation evidence should settle:

- which static TSX renderer is actually used;
- whether a development server adds enough value to keep;
- the initial page size and geometry;
- the simplest representation of shared page chrome;
- how the output includes its CSS and sample assets; and
- where generated HTML and temporary captures live.

Do not attempt to settle future theme, pagination, plugin, or public-package
interfaces.

### Exit Artifact

A new agent can follow repository instructions to:

1. install dependencies;
2. change a supplied report value;
3. generate the report;
4. capture its pages;
5. inspect the images;
6. make a layout correction; and
7. open the final static HTML.

The spike may be rewritten rather than preserved if using it reveals a simpler
authoring shape.

### Verified Outcome

- React static server rendering provides familiar typed TSX without a client
  application or development server.
- A4 landscape (`297mm × 210mm`) is the initial fixed geometry.
- Report-local composition supplies shared chrome and final page positions;
  the cover suppresses chrome explicitly.
- CSS is embedded in `artifacts/spike/report.html`, so the output has no runtime
  or network dependency.
- Isolated Chromium captures the actual HTML to one PNG per page under
  `.tmp/captures/spike/` after document and font readiness.
- An intentional table-row spacing increase visibly pushed content beyond the
  page in capture. Restoring the authored spacing corrected the output; no
  overflow detector or repair path was added.
- Installation, render, capture, type-check, and local-open paths were run from
  the repository root.

## Phase 2 — Real Report Trial

### Objective

Test the idea against real report pressure before treating the initial syntax
as a reusable interface.

### Work

- Select one existing static report or representative subset.
- Recreate approximately six to ten pages with realistic Korean and English
  text, numbers, a table, and at least one figure or image.
- Populate it from one coherent data object produced outside the report.
- Let an agent perform at least one content revision and one visual revision
  through the capture loop.
- Observe where the spike causes repetition, awkward data flow, or unclear
  ownership.
- Record findings by updating current design and decisions rather than keeping
  a chronological diary.

### Exit Artifact

A credible report that would be useful independently of framework development,
plus a short list of proven authoring friction.

## Phase 3 — Minimum Reuse Extraction

### Objective

Turn only repeated, stable mechanics into a small reusable interface.

### Work

- Compare the spike and real report.
- Identify mechanics repeated across pages or reports.
- Centralize page geometry, shared chrome, numbering, document output, and
  capture only where repetition demonstrates value.
- Keep report-specific layout in report source.
- Remove spike-only abstractions that did not simplify the real report.
- Document the resulting interface after it exists.

### Exit Artifact

A small reusable module whose deletion would force meaningful mechanics back
into multiple report files. If deletion merely removes thin wrappers, keep the
solution report-local instead of publishing a library.

## Phase 4 — V1 Hardening

### Objective

Make the proven workflow repeatable from a clean checkout.

### Work

- Pin the selected dependencies and browser setup.
- Ensure generated artifacts and temporary captures are separated clearly.
- Verify the HTML artifact opens locally without preview tooling.
- Add focused automated checks for generation and capture-command health only
  where they prevent real regressions.
- Document supported development platforms and the canonical preview engine.
- Provide one minimal example and the real report example.
- Decide whether the reusable module should be published or remain repository
  local.

### V1 Exit Criteria

- Explicit pages render at the intended fixed dimensions.
- Ordinary typed data drives visible report content.
- Shared chrome and page numbering work across the real report.
- The final HTML opens independently.
- A shell-driven agent can generate and inspect per-page images without a
  personal browser connection.
- The authoring interface has been simplified after real-report use.
- Installation, render, capture, and artifact paths are documented.
- No out-of-scope system was introduced to solve a hypothetical future need.

## Deferred Backlog

Consider only after v1 evidence:

- additional page sizes or mixed orientations;
- reusable visual themes;
- formal PDF delivery;
- more sophisticated figures;
- cross-browser testing;
- nontechnical authoring surfaces;
- automatic pagination; and
- a public package and versioning policy.

## Next Action

Begin Phase 2 by authoring one coherent six-to-ten-page operating report from
ordinary typed data. Use Korean and English content, a table, and at least one
locally embedded figure or image. Keep composition report-local and record the
friction revealed by a content revision and a visual revision.
