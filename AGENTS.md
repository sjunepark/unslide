# AGENTS.md

## Start Here

- Read `PRODUCT.md` for v1 scope.
- Read `docs/DESIGN.md` before shaping authoring behavior.
- Read `ARCHITECTURE.md` for responsibilities and invariants.
- Use `PLAN.md` as the live execution state and take the current next action.
- Read the decision records under `docs/decisions/` before revisiting an
  accepted constraint.

## Current Phase

The repository is documentation-only. No setup, build, or validation commands
exist yet. Add commands here only after Phase 1 creates and verifies them.

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

During the documentation-only phase:

- verify Markdown links and paths;
- check that PRODUCT, DESIGN, ARCHITECTURE, decisions, and PLAN agree on v1
  scope; and
- remove implementation syntax that has not been proven by the current phase.
