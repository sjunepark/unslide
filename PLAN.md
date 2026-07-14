# Plan

There is no active implementation goal.

Current next action: **Gather evidence from real consumer reports for one
deferred product gate.** Propose an explicit scope decision only when that
evidence meets the gate's threshold; do not implement the deferred capability
before then.

Suggested `/goal` objective:

> Gather evidence from real consumer reports for one deferred product gate in
> `PLAN.md`, then propose an explicit scope decision only if that evidence meets
> the gate's stated threshold.

This file is the live execution state. Update current decisions, evidence,
blockers, and the next action in place; do not append session history. Durable
product and technical contracts belong in `PRODUCT.md`, `docs/DESIGN.md`,
`ARCHITECTURE.md`, `docs/SUPPORT.md`, and `docs/decisions/`.

## Current Gates

| Capability | State | Evidence required to reconsider |
|---|---|---|
| Managed recipe registry | Deferred | At least two independent consumers repeatedly need the same editable visual source, and one-time scaffolding or an installed package is insufficient |
| Additional source adapters | Deferred | A second real generator implements the artifact protocol and reveals the behavior that actually varies |
| Mixed PDF geometry | Deferred | A real mixed-size report and integration evidence from the canonical Chromium version |

### Managed recipe registry

A positive decision must define source ownership and optionality plus
provenance, hashes, dry-run diffs, modification detection, conflicts, and
registry trust. No visual recipe may become a runtime dependency.

### Additional source adapters

Do not publish a renderer plugin interface around the React implementation
before the second implementation exposes a proven seam.

### Mixed PDF geometry

Supported PDF export permits arbitrary report-wide geometry but assumes one
geometry per PDF.

## Guardrails

Keep automatic pagination or repair, visual editing, presentation behavior,
universal report schemas, business calculations, mandatory design systems, and
visual project configuration outside the product unless a later decision
explicitly changes scope.

For accepted future work:

- execute one numbered goal at a time;
- add a focused detailed plan only when the goal needs one;
- prove behavior through public seams and real fixtures;
- document commands only after they run successfully;
- finish implementation goals with the required code-review pass; and
- update the relevant decision record and all conflicting current guidance
  when an accepted constraint changes.
