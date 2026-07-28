# Oxlint, Oxfmt, and tsc Adoption

Outcome: establish one explicit, fast repository validation toolchain where
Oxlint owns linting, Oxfmt owns formatting, and `tsc` owns type checking
locally and in CI.

## State

Status: active. The implementation is tracked in
[the adoption plan](../plans/oxlint-oxfmt-tsc.md).

Included scope is pinned tool ownership and configuration, one composed local
and CI command surface, repository-wide formatting and lint remediation, and
contributor guidance. Static and interactive report modes are excluded.

## Evidence

- Current Oxc and pnpm documentation plus the pinned CLI help establish the
  supported configuration, ignore, check, write, React-plugin, warning-gate,
  and release-cooldown behavior.
- The pinned dependencies install through `pnpm install --frozen-lockfile`
  without new supply-chain policy exceptions.
- `pnpm run check`, `pnpm test`, and `pnpm run validate` pass with the composed
  local and CI command surface.
- Every regenerated HTML and PDF-native proof-report page image has been
  inspected for completeness, clipping, typography, and expected color and
  fill preservation.
- Independent implementation review found no remaining safe-fix or
  decision-required findings, and `npm pack --dry-run` verified the public
  package contents.
- A pre-existing transitive audit finding through AJV was confirmed unchanged
  by this work and remains outside the toolchain-adoption scope.

## Next Action

Complete implementation review and PR delivery, then close this goal and
advance the roadmap.
