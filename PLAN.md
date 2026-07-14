# Plan

Active implementation goal: **AXI CLI hardening through Goal 5.**

Current next action: **Execute Goal 5 of
[`docs/plans/axi-cli-hardening.md`](docs/plans/axi-cli-hardening.md): align the
documented contract, review the complete change, and run full validation.**

Suggested `/goal` objective:

> Execute `docs/plans/axi-cli-hardening.md` one numbered goal at a time through
> Goal 5, then stop after the hardened CLI contract, documentation, required
> implementation review, and full validation are complete.

This file is the live execution state. Update current decisions, evidence,
blockers, and the next action in place; do not append session history. Durable
product and technical contracts belong in `PRODUCT.md`, `docs/DESIGN.md`,
`ARCHITECTURE.md`, `docs/SUPPORT.md`, and `docs/decisions/`.

## Active Work

- Completed: Goals 1–4. Parsing, invocation, typed public failures, bounded
  diagnostics, contextual success help, existence-only home status, and compact
  page-output paths now have one deterministic contract.
- Evidence: `pnpm run check` and all 14 CLI tests pass. Exact home tests cover
  missing, mixed, and present HTML states; a two-page end-to-end fixture proves
  actual report names, one output-directory field, basename page rows, and
  directly resolvable HTML-capture and named/explicit PDF-inspection output.
  The focused Goal 4 implementation review found no issues.
- Blockers: none.

## Current Gates

| Capability | State | Evidence required to reconsider |
|---|---|---|
| Managed recipe registry | Deferred | At least two independent consumers repeatedly need the same editable visual source, and one-time scaffolding or an installed package is insufficient |
| Additional source adapters | Deferred | A second real generator implements the artifact protocol and reveals the behavior that actually varies |
| Mixed PDF geometry | Deferred | A real mixed-size report and integration evidence from the canonical Chromium version |
| Agent skill or session integration | Deferred | Reconsider a static skill only after two independent consumer repositories each require manual orientation in at least two sessions after using no-args output and command help. Consider session hooks only if live session-start state is then proven necessary; session-end capture also requires a privacy decision |

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
