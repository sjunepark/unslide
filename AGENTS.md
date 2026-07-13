# AGENTS.md

## Start Here

- Read `PRODUCT.md` for v1 scope.
- Read `docs/DESIGN.md` before shaping authoring behavior.
- Read `ARCHITECTURE.md` for responsibilities and invariants.
- Use `PLAN.md` as the live execution state and take the current next action.
- Read the decision records under `docs/decisions/` before revisiting an
  accepted constraint.

## Current Phase

V1 is complete. The page foundation and static output mechanics are proven by
both reports, and the documented workflow passes from a clean checkout. Future
work begins only from real report evidence or an explicit scope decision.

## Commands

- `pnpm install --frozen-lockfile` — install pinned JavaScript dependencies.
- `pnpm exec playwright install chromium` — install the isolated preview browser.
- `pnpm run render:spike` — generate `artifacts/spike/report.html`.
- `pnpm run capture:spike` — capture pages under `.tmp/captures/spike/`.
- `pnpm run render:report` — generate the eight-page operating report.
- `pnpm run capture:report` — capture its pages under
  `.tmp/captures/operating-review/`.
- `pnpm run check` — type-check report and tooling source.
- `pnpm test` — run focused generation and Chromium capture health checks.
- `pnpm run validate` — run all v1 checks and regenerate both reports.

## Scope

- Keep v1 centered on explicit fixed-page HTML reports.
- Treat page overflow as an authoring problem resolved through rendered
  inspection and source edits.
- Keep Playwright or other browser automation in development tooling; completed
  HTML must open without it.
- Keep caller calculations and domain models outside Unslide.
- Let the first real implementation determine syntax, names, and package shape.
- Require evidence from repeated report work before adding reusable concepts.

Automatic pagination, animations, visual editing, automated report linting,
multi-renderer support, and a large design system require an explicit scope
decision before implementation.

## Change Expectations

- Update `PLAN.md` in place when a phase advances or the next action changes.
- Update an accepted decision record when its decision changes; do not leave
  conflicting current guidance elsewhere.
- Keep root documents concise and move detailed rationale into focused files
  under `docs/`.
- Prefer working code from the current phase over speculative interface examples
  in documentation.
- Once code exists, add only commands that have been run successfully from the
  repository root.

## Validation

- Run `pnpm run check` for source changes.
- Run `pnpm test` for page-foundation, rendering, or capture changes.
- Generate and capture the affected report, then inspect every page image for
  content fit and visual defects.
- Verify Markdown links and paths.
- Check that PRODUCT, DESIGN, ARCHITECTURE, decisions, and PLAN agree on v1
  scope.
- Remove implementation syntax that has not been proven by report work.
