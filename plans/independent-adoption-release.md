# Prove Independent Adoption and the Automated Release Path

## Outcome

Independent consumers can adopt the public package from repository guidance,
and the first Release Please-generated release proves the normal versioning,
tagging, GitHub Release, and npm publication path end to end.

## Current state

- The accepted implementation goals through public distribution are complete.
  The public package is `unslide@0.1.0`, and `v0.1.0` identifies its reviewed
  source.
- The hardened CLI contract is canonical in [README.md](../README.md); release
  policy and operations belong to
  [D6](../docs/decisions/0006-public-npm-distribution.md) and
  [docs/RELEASE.md](../docs/RELEASE.md).
- Release Please is configured, but the first subsequent automated release has
  not yet been proven.
- Independent-consumer evidence and the automated release exercise were
  deliberately excluded from the completed PDF export readiness goal.
- Blockers: none.

## Next action

Define the independent-consumer selection and success evidence, then scope the
first Release Please-generated release exercise without starting either
execution path.
