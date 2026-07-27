# Plan

Active implementation goal: **none**.

Current next action: **exercise the public package in independent consumers,
record evidence against the gates below, and verify the first
Release Please-generated release before widening product scope.**

This file owns current execution state and unresolved evidence gates. Durable
product, design, architecture, support, and release policy belong in their
focused documents and decision records.

## Current State

- The accepted implementation goals through public distribution are complete.
  The public package is `unslide@0.1.0`, and `v0.1.0` identifies its
  reviewed source.
- The hardened CLI contract is canonical in [README.md](README.md); release
  policy and operations belong to
  [D6](docs/decisions/0006-public-npm-distribution.md) and
  [docs/RELEASE.md](docs/RELEASE.md).
- Release Please is configured, but the first subsequent automated release has
  not yet been proven.
- Blockers: none.

## Evidence Gates

| Capability | Reconsider when |
|---|---|
| Managed recipe registry | At least two independent consumers repeatedly need the same editable visual source and one-time scaffolding is insufficient. Any proposal must define source ownership, provenance, dry-run diffs, modification detection, conflicts, and registry trust. |
| Additional source adapters | A second real generator implements the artifact protocol and reveals which behavior actually varies. Evaluation notes: [authoring without mandatory React](docs/research/authoring-without-react.md). |
| Mixed PDF geometry | A real mixed-size report exists and the canonical Chromium version has integration evidence for a reliable path. |
| Agent skill or session integration | Two independent consumer repositories each require manual orientation in multiple sessions after using no-args output and command help. Session hooks additionally require evidence that live state is necessary; session-end capture requires a privacy decision. |
| Unslide-owned browser installer | Multiple supported environments or package-manager workflows show recurring failure with the pinned Playwright installation command. |

No deferred capability is active work until its evidence gate is met and an
explicit scope decision accepts it. When work is accepted, execute one numbered
goal at a time and add a focused detailed plan only if the goal needs one.
