# V2 Adoption Plan

Status: **pending on V2 Core.**

This plan replaces manual source copying with installed, versioned tooling while
keeping report design in user-owned source. Use the `axi` skill when implementing
the CLI.

## Adoption Goal 1 — CLI and Project Configuration

Status: **pending**

Depends on: Core Goal 3

### Objective

Provide one shell interface for named report discovery, build, validation, and
HTML capture, backed by deterministic schema-validated JSON configuration.

### Scope

1. Introduce the `unslide` CLI with coherent commands for:
   - building a named report;
   - inspecting an existing artifact; and
   - capturing HTML pages.
2. Define `unslide.json` and publish its JSON Schema from the package.
   - Map report names to source entries and HTML outputs.
   - Configure derived-artifact locations and supported operational behavior.
   - Resolve paths relative to a documented project root.
   - Reject unknown fields and invalid path combinations clearly.
3. Keep all design values out of configuration.
   - No page size, orientation, margin, padding, font, color, chrome, header,
     footer, numbering, or theme fields.
4. Make commands composable and agent-friendly.
   - Useful `--help` output.
   - Noninteractive forms for automation.
   - Stable exit codes and concise errors.
   - Structured detail only where it improves automation.
5. Route existing report commands through the same internal modules before
   removing or replacing V1 scripts.
6. Test configuration discovery from repository root, nested directories,
   spaces in paths, missing entries, and invalid output locations.

### Validation

- CLI-focused tests for help, errors, exit codes, and path resolution.
- `pnpm run check`
- `pnpm test`
- Build and capture both proof reports through the CLI.
- Inspect every generated page image.
- Run the required implementation `code-review` pass with the diet lens.

### Exit Criteria

- A named report builds, validates, and captures through one CLI entry point.
- `unslide.json` has a versioned schema and contains no visual policy.
- Existing internal scripts are either routed through the same implementation or
  removed after documented replacements pass.
- `PLAN.md` points to Adoption Goal 2; PDF Goal 1 becomes unblocked.

### Suggested `/goal` Objective

> Implement Adoption Goal 1 from `docs/plans/v2-adoption.md` using the `axi`
> skill: add the schema-validated operational config and agent-friendly CLI,
> route both proof reports through it, update plan state, and complete all
> validation and review.

## Adoption Goal 2 — Scaffolding and Report Migration

Status: **pending**

Depends on: Adoption Goal 1

### Objective

Prove that a new project and the repository's existing reports can use installed
tooling while owning all report design source.

### Scope

1. Implement deterministic, noninteractive-capable project initialization.
   - Create minimal configuration and one report entry.
   - Generate understandable source with no hidden framework stylesheet.
   - Refuse unsafe overwrites and show planned writes before confirmation.
2. Keep initial scaffolding intentionally small.
   - One headless document example.
   - One optional authored page style for usability, clearly removable.
   - No registry, theme matrix, or managed recipe upgrades.
3. Complete repository migration.
   - The operating review retains its A4 landscape design through explicitly
     owned report source.
   - The contrasting fixture uses another size, typography, spacing, and no
     repeated chrome.
   - Neither imports visual behavior from the runtime.
4. Create a clean consumer fixture outside the implementation source tree.
   - Install or pack the local package.
   - Initialize, build, validate, and capture without copying runtime files.
5. Replace V1 adoption documentation only after the new path passes.

### Validation

- Fresh-directory initialization in interactive and noninteractive modes.
- Repeat initialization to prove safe conflict handling.
- Full build and HTML capture in the clean consumer fixture.
- `pnpm run check`, `pnpm test`, and repository validation.
- Visual inspection of all proof and consumer pages.
- Run the required implementation `code-review` pass, using a subagent if the
  migration changes shared user-facing behavior across modules.

### Exit Criteria

- A consumer adopts Unslide without copying `src/unslide/` or capture scripts.
- All visual source is visible and editable in the consumer.
- The two proof reports demonstrate materially different designs.
- Current docs no longer recommend the V1 copy-in path.
- `PLAN.md` points to Adoption Goal 3.

### Suggested `/goal` Objective

> Implement Adoption Goal 2 from `docs/plans/v2-adoption.md`: add safe minimal
> scaffolding, migrate both proof reports to fully source-owned design, prove a
> clean consumer without copied runtime files, update documentation and plan
> state, and satisfy all validation and review criteria.

## Adoption Goal 3 — Packaging and Upgrade Hardening

Status: **pending**

Depends on: Adoption Goal 2

### Objective

Turn the working V2 implementation into a versioned package whose installation,
exports, errors, and upgrade behavior are credible outside this repository.

### Scope

1. Finalize the smallest package surface.
   - CLI executable.
   - React authoring entry.
   - JSON Schema and documented artifact protocol.
   - No public Playwright, validator-internal, or speculative adapter surfaces.
2. Define supported Node.js, package-manager, and Chromium setup behavior.
3. Test the packed artifact rather than workspace imports.
   - Inspect published files.
   - Install the tarball in a clean fixture.
   - Run init, build, inspect, and capture.
4. Add compatibility checks for config and artifact protocol versions.
5. Define migration errors for unsupported versions without promising automated
   source rewriting.
6. Update README and workflow docs with only commands that passed from the packed
   consumer.
7. Record whether the first release stays `0.x` or is ready for a stable public
   contract.

### Validation

- Package build and contents inspection.
- Clean tarball install with no workspace leakage.
- Full consumer workflow on the supported environment.
- Dependency audit and license review for shipped dependencies.
- Repository validation and Markdown-link verification.
- Run the required implementation `code-review` pass with the diet lens.

### Exit Criteria

- Consumers receive stable mechanics through a package, not copied files.
- Only intentional files and exports ship.
- Protocol and config incompatibilities fail clearly.
- The documented clean-consumer workflow passes.
- `PLAN.md` records the release state and next unblocked PDF goal.

### Suggested `/goal` Objective

> Implement Adoption Goal 3 from `docs/plans/v2-adoption.md`: harden the minimal
> package and upgrade contract, validate the packed artifact in a clean
> consumer, update current docs and plan state, and complete all review and
> release checks.

## Recipe Registry Evidence Gate

Status: **deferred**

Do not turn initialization source into a managed registry by default. Gather
adoption evidence first. A future planning decision must answer:

- Which source is repeated across at least two independent consumers?
- Why an installed package or one-time scaffold is insufficient.
- Whether installed files are immutable generated output or editable user-owned
  source.
- How provenance, hashes, dry-run diffs, modified-file detection, conflicts, and
  registry trust are handled.
- Which parts remain optional so no visual recipe becomes a runtime dependency.
