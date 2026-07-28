# Adopt Oxlint, Oxfmt, and tsc

## Outcome

Repository validation has one explicit, fast toolchain in which Oxlint owns
linting, Oxfmt owns formatting, and `tsc` owns type checking, with the same
checks enforced locally and through the existing CI validation path.

## Current state

- This plan is current on the roadmap.
- Oxlint and Oxfmt are pinned and configured; Oxfmt has been applied across its
  owned repository scope, and the initial Oxlint findings are resolved without
  rule suppressions.
- `pnpm run check` composes the non-writing Oxfmt, Oxlint, and `tsc` checks.
  `pnpm run validate` remains the single CI path and delegates source
  validation to that composition.
- Contributor guidance documents the composed check and individual iteration
  commands.
- Frozen installation, the composed check, the source test suite, and the full
  proof-report validation have passed. Every regenerated HTML and PDF-native
  proof-report page image has been inspected.
- Implementation review found no remaining safe-fix or decision-required
  findings; the public package dry run contains no development-tooling output.

## Decisions

- Pin `oxlint` 1.74.0 and `oxfmt` 0.59.0 as development dependencies. These
  compatible releases have passed the repository's package-release cooldown,
  so adoption does not add supply-chain policy exceptions.
- Use project-owned JSON configuration with explicit exclusions for generated
  package, artifact, and temporary output.
- Run Oxlint's default correctness rules with TypeScript support, the React
  plugin, and warnings promoted to a failing result. Tests use Node's built-in
  runner and need no framework plugin.
- Let Oxfmt own every supported repository file, including fixtures, with a
  check-only CI command and a separate write command.
- Keep the Effect language-service patch adjacent to `tsc` in the dedicated
  type-checking command; compose formatting, linting, and type checking only in
  `pnpm run check`.

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

Deliver the reviewed and validated change through its pull request, then close
the goal and advance the roadmap.
