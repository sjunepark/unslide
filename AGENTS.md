# AGENTS.md

<!-- effect-solutions:start -->

## Effect

Before writing Effect code, run `effect-solutions list`, then `effect-solutions show <topic>` for the relevant guide. Do not guess Effect patterns.

<!-- effect-solutions:end -->

## Work

- Read `PRODUCT.md` and follow the current next action in `PLAN.md`. Do not
  implement a deferred capability before an explicit scope decision accepts it.
- Read `docs/DESIGN.md` for authoring changes, `ARCHITECTURE.md` for system
  boundaries, and the relevant `docs/decisions/` record before changing an
  accepted constraint. Read any active detailed plan completely.
- Execute one numbered goal at a time. Update `PLAN.md` in place when its
  decisions, evidence, blockers, or next action change.

## Boundaries

- Produce explicit fixed-page standalone HTML; derive PDF from that HTML.
- Reports own DOM, geometry, visual design, print CSS, and content fit. Tooling
  owns only nonvisual build, validation, capture, and export behavior.
- Keep browser automation in development tooling, caller calculations and
  domain models outside Unslide, and project configuration nonvisual.
- Require repeated report evidence before adding reusable concepts. New
  adapters or plugin seams require two proven implementations.

## Commands and Validation

- Install with `pnpm install --frozen-lockfile` and
  `pnpm exec playwright install chromium`.
- Run `pnpm run check` for source changes, `pnpm test` for rendering or capture
  changes, and `pnpm run validate` for the full suite and both proof reports.
- For a report change, run its `render`, `capture`, `export`, and `inspect-pdf`
  scripts from `package.json`; inspect every HTML and PDF page image.
- For contract or scope changes, keep `PRODUCT.md`, `docs/DESIGN.md`,
  `ARCHITECTURE.md`, `PLAN.md`, and relevant decisions consistent.
