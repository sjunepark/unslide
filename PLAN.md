# Plan

Status: **V1 complete; V2 Core Goal 1 complete.**

Current next action: **Run Core Goal 2 — implement headless React authoring.**
See [`docs/plans/v2-core.md`](docs/plans/v2-core.md).

Suggested `/goal` objective:

> Implement Core Goal 2 from `docs/plans/v2-core.md`. Keep `PLAN.md` and the
> detailed plan current, preserve the artifact protocol and intended V1 report
> output, run the required validation and code-review pass, and stop only when
> the goal's exit criteria are satisfied or a concrete blocker is recorded.

This file is the live execution state. Update statuses, decisions, blockers,
validation, and the current next action in place. Do not append session logs.

## Accepted Direction

V2 keeps explicit fixed pages and standalone HTML while replacing the
repository-copy adoption model:

- HTML is the canonical artifact.
- A small nonvisual artifact protocol identifies pages and readiness.
- Reports own their entire DOM and every visual decision.
- Versioned tooling owns build, validation, capture, and export mechanics.
- React is the first authoring module, not the artifact definition.
- Project configuration is operational rather than visual.
- PDF is derived from canonical HTML through Chromium and inspected from the
  produced PDF.
- Optional visual recipes remain user-owned source and are not runtime
  requirements.

See [D3](docs/decisions/0003-headless-artifact-protocol.md) and
[D4](docs/decisions/0004-html-first-pdf-export.md).

## Guardrails

Keep these outside V2 unless a later decision changes scope:

- automatic pagination or content redistribution;
- automatic shrinking, truncation, or overflow repair;
- a visual editor, animations, or presentation controls;
- a universal report schema or business calculation layer;
- required page frames, chrome, headers, footers, typography, or themes;
- design values in project configuration;
- a public plugin system before two real adapters exist;
- mixed page geometry within one PDF before canonical-browser evidence; and
- managed source-recipe upgrades before adoption evidence justifies them.

## Execution Rules

- Work one numbered goal at a time and update its plan file in the same change.
- Preserve working V1 commands until their documented replacement passes.
- Do not document planned commands as available before they run successfully.
- Use fixtures to prove behavior through the public seam, not private helpers.
- Every implementation goal ends with the required code-review pass.
- Any change to an accepted constraint updates its decision record and all
  conflicting current guidance.

## Progress

| Track | Goal | State | Depends on | Exit evidence |
|---|---|---|---|---|
| Foundation | V1 phases 0–4 | Complete | — | Clean install and full V1 validation |
| Planning | V2 architecture and goal plans | Complete | V1 evidence | PRODUCT, DESIGN, ARCHITECTURE, D3, D4, and detailed plans agree |
| Core | 1. Artifact protocol and validator | Complete | V2 planning | Protocol v1, shared validator, independent fixtures, and unchanged V1 captures |
| Core | 2. Headless React authoring | Ready | Core 1 | Full-document rendering injects no visual policy |
| Core | 3. Canonical HTML capture | Pending | Core 2 | Unrelated geometries capture through the protocol |
| Adoption | 1. CLI and project configuration | Pending | Core 3 | Named reports build, inspect, and capture through one CLI |
| Adoption | 2. Project scaffolding and migration | Pending | Adoption 1 | Clean consumer uses installed tooling; both reports are source-owned |
| Adoption | 3. Packaging hardening | Pending | Adoption 2 | Versioned package workflow passes from a clean consumer fixture |
| PDF | 1. Chromium PDF export | Pending | Adoption 1 | Canonical HTML produces validated searchable PDF |
| PDF | 2. PDF-native inspection | Pending | PDF 1 | Actual PDF pages render to inspection images |
| PDF | 3. Export hardening | Pending | PDF 2, Adoption 3 | Both proof reports pass HTML and PDF delivery workflows |
| Recipes | Evidence gate | Deferred | Adoption evidence | Explicit decision on whether a registry earns its cost |

## Detailed Plans

- [`docs/plans/v2-core.md`](docs/plans/v2-core.md) — artifact protocol,
  headless React authoring, and canonical HTML capture.
- [`docs/plans/v2-adoption.md`](docs/plans/v2-adoption.md) — CLI, JSON
  configuration, scaffolding, report migration, and package hardening.
- [`docs/plans/v2-pdf.md`](docs/plans/v2-pdf.md) — browser PDF export,
  artifact validation, PDF-native inspection, and release hardening.

The tracks are ordered by dependency, not by file ownership. PDF Goal 1 may
start after Adoption Goal 1 because it needs the CLI and report lookup, while
Adoption packaging can continue independently after migration.

## V1 Verified Baseline

V1 is the regression baseline, not the target public interface:

- React static rendering produces standalone HTML for a three-page fixture and
  an eight-page operating review.
- The reports use explicit pages driven by ordinary typed data.
- Isolated Chromium writes one inspection PNG per page.
- Both reports open locally and print as the expected A4 landscape page count.
- A frozen pnpm install and `pnpm run validate` pass from a clean exported tree.

The current V1 foundation still injects A4 geometry and chrome. V2 goals remove
that requirement without discarding the proven authoring and inspection loop.

## Decision Gates

### Recipe registry

Do not build a shadcn-style registry during the core migration. Reconsider only
after at least two consumer reports show repeated demand for installing the same
editable visual source. A positive decision must specify provenance, dry-run
diffs, modification detection, and conflict behavior before managed upgrades
are promised.

### Additional source adapters

Do not publish a renderer plugin interface around the React implementation.
Reconsider when a second generator produces the artifact protocol and reveals
which behavior actually varies.

### Mixed PDF geometry

Initial PDF support permits arbitrary report-wide geometry but assumes one
geometry per PDF. Reconsider only with a real mixed-size report and integration
evidence from the canonical Chromium version.

## Next Action

Begin Core Goal 2. Replace the V1 visual authoring foundation with a full-
document React path while preserving the now-implemented artifact protocol.
