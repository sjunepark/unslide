# AGENTS.md

## Start Here

- Read `PRODUCT.md` for the product boundary and current direction.
- Read `docs/DESIGN.md` before shaping authoring behavior.
- Read `ARCHITECTURE.md` for responsibilities and invariants.
- Use `PLAN.md` as the live execution state and take the current next action.
- If `PLAN.md` links an active detailed plan, read it completely before
  starting its goal.
- Read the decision records under `docs/decisions/` before revisiting an
  accepted constraint.

## Current State

The packaged HTML/PDF workflow is current. The repository is at the
consumer-evidence gates recorded in `PLAN.md`; do not implement deferred scope
before an explicit decision accepts it. When work is accepted, execute one
numbered goal at a time and keep its live plan current.

## Commands

- `pnpm install --frozen-lockfile` — install pinned JavaScript dependencies.
- `pnpm exec playwright install chromium` — install the isolated preview browser.
- `pnpm run render:spike` — generate `artifacts/spike/report.html`.
- `pnpm run capture:spike` — capture pages under `.tmp/captures/spike/`.
- `pnpm run export:spike` — export `artifacts/spike/report.pdf`.
- `pnpm run inspect-pdf:spike` — render that PDF under
  `.tmp/pdf-captures/spike/`.
- `pnpm run render:report` — generate the eight-page operating report.
- `pnpm run capture:report` — capture its pages under
  `.tmp/captures/operating-review/`.
- `pnpm run export:report` — export
  `artifacts/operating-review/report.pdf`.
- `pnpm run inspect-pdf:report` — render that PDF under
  `.tmp/pdf-captures/operating-review/`.
- `pnpm run check` — type-check report and tooling source.
- `pnpm test` — run focused generation and Chromium capture health checks.
- `pnpm run validate` — run all checks and regenerate both reports.

## Scope

- Keep Unslide centered on explicit fixed-page HTML reports.
- Treat page overflow as an authoring problem resolved through rendered
  inspection and source edits.
- Keep Playwright or other browser automation in development tooling; completed
  HTML must open without it.
- Keep caller calculations and domain models outside Unslide.
- Keep the artifact protocol nonvisual and let reports own their complete DOM,
  geometry, padding, typography, repeated material, and print CSS.
- Keep project configuration operational; never add visual design fields.
- Treat PDF as a derived artifact of canonical HTML and inspect the actual PDF.
- Require evidence from repeated report work before adding reusable concepts.

Automatic pagination, animations, visual editing, automated report linting,
multi-renderer plugins, a large design system, mixed-geometry PDFs, and managed
recipe upgrades require a later explicit scope decision before implementation.

## Change Expectations

- Update `PLAN.md` in place when the next action changes.
- Update an accepted decision record when its decision changes; do not leave
  conflicting current guidance elsewhere.
- Keep root documents concise and move detailed rationale into focused files
  under `docs/`.
- Prefer working code and current contracts over speculative interface examples
  in documentation.
- Once code exists, add only commands that have been run successfully from the
  repository root.

## Validation

- Run `pnpm run check` for source changes.
- Run `pnpm test` for page-foundation, rendering, or capture changes.
- Generate and capture the affected report, then inspect every page image for
  content fit and visual defects.
- Verify Markdown links and paths.
- Check that PRODUCT, DESIGN, ARCHITECTURE, decisions, PLAN, and any active
  detailed plan agree on current versus planned behavior.
- Remove implementation syntax that has not been proven by report work.
