# Plan

Active implementation goal: **Goal 1 — harden PDF export readiness and its
visual-fidelity contract.**

Current next action: **reproduce the print-only resource race from
[issue #8](https://github.com/sjunepark/unslide/issues/8) in a focused export
test, then add bounded print-media readiness before PDF generation.**

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

## Goal 1 — Harden PDF Export Readiness and Fidelity Contract

Outcome: the supported exporter waits for resources activated by print media,
publishes only structurally valid PDFs with tested target-native evidence, and
states clearly which visual guarantees remain report-owned or require human or
agent inspection.

Accepted scope:

1. Add focused regression evidence for a resource that becomes active only
   after switching to print media. The test must demonstrate both bounded
   readiness behavior and presence of the resource in PDF-native output.
2. Add the smallest shared browser/export change that waits for print-active
   fonts, HTML images, and tracked requests before `page.pdf()`, preserving the
   existing readiness bound, actionable diagnostics, and atomic publication.
3. Keep PDF validation structural. Align the public contract and workflow so
   “validated PDF” cannot be mistaken for generic visual-fidelity validation,
   and continue to require inspection of every PDF-native page image.
4. Keep print color adjustment in report-owned CSS. Make the optional starter
   and packed-consumer proof request exact print color adjustment while keeping
   cross-environment reproduction and broad palette fidelity outside the
   guarantee.
5. State that protocol v1 supports static visual resources but not animations,
   delayed client rendering, or an author-controlled asynchronous readiness
   signal.
6. Document the linked-consumer development path so local package changes are
   rebuilt or packed before execution; do not add production runtime freshness
   detection.

Completion requires the focused regression to fail before the implementation
and pass afterward; `pnpm run validate` to cover source, packaged-consumer, and
configured proof-report behavior; inspection of every generated HTML and
PDF-native page image; consistency across `PRODUCT.md`, `docs/DESIGN.md`,
`ARCHITECTURE.md`, `docs/PROTOCOL.md`, `docs/SUPPORT.md`, `docs/WORKFLOW.md`,
the accepted PDF decision, and public guidance; and a final code review with no
unresolved actionable findings.

Non-goals: manual or system Print-to-PDF support, generic pixel-difference
scoring, an exact-color guarantee for arbitrary color spaces or rendering
environments, animation stabilization, a new asynchronous readiness protocol,
a second PDF renderer, or production CLI handling for stale linked builds.

After Goal 1, resume the prior next action: exercise the public package in
independent consumers, record evidence against the gates below, and verify the
first Release Please-generated release before widening product scope.

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
