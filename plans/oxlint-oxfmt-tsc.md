# Adopt Oxlint, Oxfmt, and tsc

## Outcome

Repository validation has one explicit, fast toolchain in which Oxlint owns
linting, Oxfmt owns formatting, and `tsc` owns type checking, with the same
checks enforced locally and through the existing CI validation path.

## Current state

- `pnpm run check` currently patches the Effect language service and runs
  `tsc --noEmit`; the repository has no configured linter or formatter.
- `pnpm run validate` and CI already delegate source validation to
  `pnpm run check`, so the adoption should preserve that single entry point.
- This work follows the independent-adoption and automated-release plan unless
  explicitly reprioritized.

## Scope

1. Add pinned Oxlint and Oxfmt development dependencies and the smallest
   project-owned configuration needed for TypeScript, React, tests, scripts,
   and generated-file exclusions.
2. Give linting, formatting checks, formatting writes, and type checking clear
   package scripts. Keep `pnpm run check` as their deterministic CI-facing
   composition and preserve the Effect language-service step required by
   `tsc`.
3. Apply Oxfmt once across the owned source and configuration files, then
   resolve Oxlint findings without bundling unrelated behavioral refactors.
4. Update contributor-facing command documentation if the new individual
   scripts are intended for direct use.

Completion requires the formatter check, Oxlint, and `tsc` to pass through
`pnpm run check`; `pnpm test` and `pnpm run validate` to remain green; the
frozen lockfile install to succeed; and CI to exercise the composed check
without a parallel validation path.

## Next action

When this plan becomes current, verify the supported Oxlint and Oxfmt
CLI/configuration surface, then choose the initial rules and formatting scope
before changing dependencies or repository files.
