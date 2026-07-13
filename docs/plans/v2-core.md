# V2 Core Plan

Status: **Goal 1 ready; Goals 2–3 pending.**

This plan establishes the durable HTML seam before packaging or PDF work. Keep
`PLAN.md` synchronized whenever a goal changes state.

## Core Goal 1 — Artifact Protocol and Validator

Status: **ready**

### Objective

Define and prove the smallest nonvisual contract that lets Unslide discover and
validate arbitrary report pages without owning their DOM or CSS.

### Scope

1. Define protocol version 1 around `data-unslide-page="<id>"`.
   - IDs are nonempty and unique within the artifact.
   - Document order is page order.
   - The marker may appear on any capturable HTML element.
   - The marker adds no required class, wrapper, style, or geometry.
2. Define readiness for static artifacts.
   - Wait for document load and `document.fonts.ready`.
   - Wait for every report image to load and decode or fail explicitly.
   - Specify one optional author-controlled readiness signal for asynchronous
     visuals only if a fixture demonstrates the need.
3. Add one validator used by tests and browser tooling.
   - Report missing, empty, or duplicate page IDs.
   - Preserve page order and return observable page metadata.
   - Report resource and readiness failures with useful context.
   - Do not inspect visual style or repair content.
4. Migrate the V1 marker from `data-page` to the protocol marker atomically.
   Remove the old marker path instead of supporting two indefinite contracts.
5. Add fixtures independent of the V1 page foundation.
   - Arbitrary semantic elements.
   - No header, footer, or numbering.
   - Non-A4 geometry.
   - Duplicate and missing-ID failures.
6. Update only documentation that describes behavior now implemented.

### Likely Change Surface

- A focused protocol/validation module under `src/unslide/`.
- `scripts/capture.ts` as the first protocol consumer.
- `src/unslide/page.tsx` only for the temporary marker migration.
- `tests/` fixtures and workflow coverage.
- Current workflow documentation after the new marker passes.

Names and file placement may change if a smaller interface emerges, but the
observable contract and exit criteria must not.

### Validation

- `pnpm run check`
- `pnpm test`
- `pnpm run validate`
- Inspect all regenerated V1 page images.
- Confirm fixtures pass without importing `Page` or `foundation.css`.
- Run the required implementation `code-review` pass and apply safe findings.

### Exit Criteria

- One documented marker contract identifies every report page.
- Validation failures identify the relevant page or resource.
- The existing 3-page and 8-page reports still capture correctly.
- At least one unrelated, non-A4, chrome-free fixture validates through the same
  interface.
- No visual rule is required by the protocol.
- `PLAN.md` points to Core Goal 2.

### Suggested `/goal` Objective

> Implement Core Goal 1 from `docs/plans/v2-core.md`: establish protocol v1,
> migrate the page marker, add validation and independent fixtures, preserve V1
> output, update plan state, and satisfy every validation and review criterion.

## Core Goal 2 — Headless React Authoring

Status: **pending**

### Objective

Replace V1's visual page foundation and string-oriented writer with a React
authoring module that renders a user-owned complete document without injecting
visual policy.

### Scope

1. Design the smallest report-definition interface around rendering a complete
   HTML document.
   - The report controls `<html>`, `<head>`, document language, metadata,
     `<body>`, page elements, and styles.
   - Compilation and serialization details stay behind the interface.
2. Remove automatic `foundation.css` loading and document-shell construction
   from the reusable runtime.
3. Move V1 A4 geometry, screen presentation, print rules, and numbered chrome
   into explicitly imported report-owned source.
   - Keep it local to the reports or in an optional recipe location.
   - Do not retain a required `PageChrome` or page-frame interface.
4. Establish the local asset strategy for standalone HTML.
   - Prove CSS, images, SVG, and fonts needed by the fixtures.
   - Fail clearly on unresolved local assets.
   - Do not silently permit network dependencies in a standalone build.
5. Keep caller data ordinary and report-owned.
6. Add interface-level tests.
   - Full document metadata survives rendering.
   - Arbitrary DOM and CSS survive unchanged.
   - No runtime reset, wrapper, classes, geometry, typography, or chrome appear.
   - Escaping and output-path behavior remain safe.

### Validation

- `pnpm run check`
- `pnpm test`
- Regenerate both existing reports and compare their intended page count.
- Inspect every HTML capture.
- Search generated artifacts for unexpected runtime CSS, wrappers, or external
  URLs.
- Run the required implementation `code-review` pass, including the diet lens
  for the new authoring interface.

### Exit Criteria

- Deleting report-owned styling removes the design instead of revealing an
  Unslide default design.
- Both reports own their complete visual source explicitly.
- Standalone HTML remains the output and opens without development tooling.
- The React interface contains no header, footer, chrome, padding, font, theme,
  or fixed-geometry concepts.
- `PLAN.md` points to Core Goal 3.

### Suggested `/goal` Objective

> Implement Core Goal 2 from `docs/plans/v2-core.md`: create the headless React
> authoring interface, remove runtime visual injection, move V1 design into
> report-owned source, prove standalone local assets, and complete all stated
> validation and review.

## Core Goal 3 — Canonical HTML Capture

Status: **pending**

### Objective

Make browser capture a robust consumer of the artifact protocol, independent of
the React authoring implementation and of page design.

### Scope

1. Refactor capture around the protocol validator and one shared browser
   readiness path.
2. Capture marked elements at their authored bounding boxes regardless of page
   size, orientation, class names, or surrounding layout.
3. Keep output deterministic.
   - Stable document order and file naming.
   - Stale page-image cleanup without deleting unrelated files.
   - Pinned browser behavior and actionable launch errors.
4. Surface console errors, failed local resources, invalid pages, and readiness
   timeouts with concise context.
5. Return a structured capture result for the later CLI while keeping internal
   Playwright details private.
6. Exercise at least two contrasting reports:
   - the A4 landscape operating review with report-owned repeated material;
   - a different geometry with no repeated material and unrelated DOM.

### Validation

- `pnpm run check`
- `pnpm test`
- Run capture twice to prove deterministic cleanup and naming.
- Inspect every output image from both contrasting reports.
- Confirm capture does not import the React authoring module.
- Run the required implementation `code-review` pass.

### Exit Criteria

- Capture depends only on a valid HTML artifact and the protocol.
- Both contrasting reports produce correct per-page PNGs.
- Browser and resource failures are actionable.
- No page-size or visual assumptions remain in capture.
- `PLAN.md` points to Adoption Goal 1.

### Suggested `/goal` Objective

> Implement Core Goal 3 from `docs/plans/v2-core.md`: make canonical HTML
> capture a protocol-only module, prove arbitrary design and deterministic
> outputs with contrasting reports, update plan state, and pass all validation
> and review criteria.
