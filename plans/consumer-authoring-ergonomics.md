# Improve Consumer Report Authoring

## Outcome

An author can start or extend a report project, understand source failures,
review one page or a complete report through one trustworthy workflow, and
consume stable artifact evidence without reimplementing Unslide's lifecycle.
The workflow remains headless and preserves report ownership of DOM, geometry,
visual design, print CSS, numbering, and content fit.

## Current state

- The adjacent impairment-report consumer proves that the public React and HTML
  seams can deliver a substantial fixed-page report with bespoke layouts,
  repeated table families, local components, compiled CSS, embedded fonts, and
  HTML-first PDF output.
- Its report sequence remains ordinary readable TSX, but the consumer also owns
  `scripts/page-review.ts`, which reparses project configuration, invokes the
  CLI lifecycle, decodes structured output, reconstructs artifact paths, checks
  page evidence, and selects one page only after full capture.
- Individual `build`, `inspect`, `capture`, `export`, and `inspect-pdf` commands
  are safe and composable. They intentionally do not rebuild upstream
  artifacts, so callers must coordinate freshness themselves.
- Source-loading and rendering failures retain useful internal messages, while
  the normal CLI presentation reduces many of them to a generic command
  failure. Report console output and React warnings can also interfere with the
  single structured stdout document.
- `init` safely creates a first report but cannot add one to an existing
  project. Configuration repeats conventional artifact paths and validates all
  configured source files even when a command targets only one report.
- The public starter demonstrates one page. Public guidance does not yet teach
  the transition to a realistic multi-page report, and the impairment source
  cannot be redistributed as that tutorial.
- Public page results do not use one consistent external number/index model or
  provide directly usable paths. Project discovery does not expose every
  resolved artifact path and state.
- TOON is the only machine-output encoding. The real consumer takes a TOON
  dependency solely to orchestrate Unslide before publishing its own JSON
  result.
- Standalone HTML is the durable artifact seam, but artifact-oriented capture
  and export are not symmetric with existing artifact inspection.
- The React source contract accepts an already-created element rather than the
  conventional zero-prop component form. React installation, consumer type
  checking, asset path bases, and supported font types are not explained as
  one authoring contract.
- PDF validation samples only early page text, so repeated headers can provide
  weaker evidence than representative body content.
- The queued static/interactive plan already owns standards-based HTML parsing,
  protocol metadata, and pre-publication static-policy validation. This plan
  must use that future contract rather than create a competing parser or
  metadata source.

## Execution state

- Goal 1 is specified in [D7](../docs/decisions/0007-consumer-authoring-contracts.md),
  [the CLI contract](../docs/COMMANDS.md),
  [the result and manifest contract](../docs/RESULTS.md), and
  [the React authoring contract](../docs/AUTHORING.md).
- The contract preserves version-1 explicit configuration and dependent PDF
  defaults, defines the intentional pre-1.0 result migration, and keeps the
  static/interactive parser dependency deferred to its queued plan.
- `pnpm run check` passes. Independent implementation, system, design, and
  simplification review findings were applied; no unresolved Goal 1 decision
  remains.
- Goal 1 PR delivery is the current action. Goals 2–5 remain pending.

## Accepted design

### Queue and boundaries

- Execute this plan after the completed Oxlint, Oxfmt, and `tsc` adoption and
  before the static/interactive report-mode plan.
- Preserve explicit fixed pages, standalone HTML as the canonical artifact,
  PDF derived from that HTML, target-native inspection, and report-owned visual
  design and content fit.
- Keep the existing primitive commands. New composition hides Unslide's own
  lifecycle coordination; it does not absorb reference-document discovery,
  visual comparison, business models, or acceptance policy.
- Keep browser automation and artifact publication inside tooling. Keep report
  calculations, visual components, page numbering policy, and design source in
  the caller.

### Complete review workflow

- Add `unslide review` as the author-facing composition of build, validation,
  HTML capture, optional PDF export, and optional PDF-native capture.
- A review always rebuilds canonical HTML. Focused review validates the whole
  artifact but rasterizes only the requested stable page ID or one-based page
  number. Unfocused review processes every page.
- Support a configured-project all-reports form for CI. PDF work remains
  explicit so an HTML-only review does not silently incur PDF cost.
- Write a transactional, versioned review manifest and return the same useful
  summary through the selected stdout encoding. The manifest records the
  report, tool and schema versions, canonical artifact identity, page IDs,
  one-based numbers, directly usable paths, dimensions, hashes, byte sizes,
  warnings, selected scope, and step timings.
- Do not generate a gallery in this plan. Authors may continue to open HTML,
  PDF, or captured images directly, and consumers may build views from the
  manifest.

### Project and artifact interfaces

- Add safe, dry-run-first `unslide add <name>` behavior that merges one report
  into an existing validated project without overwriting user files.
- Derive conventional HTML, PDF, HTML-capture, and PDF-capture paths from the
  report name. Keep explicit path overrides and all existing confinement,
  symlink, overlap, conflict, and atomic-publication guarantees.
- Treat a missing source as state of that report. It must not prevent read-only
  discovery or artifact operations for an unrelated configured report.
- Add `unslide report <name>` for resolved source and artifact paths, existence
  and last-modified evidence, tool version, and output schema version without
  performing a build or capture. Do not claim dependency-complete freshness
  from filesystem timestamps.
- Add `capture --artifact <html> --output <directory>` and
  `export --artifact <html> --output <pdf>` without requiring `unslide.json`.
  Require explicit outputs and apply safe path resolution, input/output and
  symlink overlap checks, validation, and transactional publication.
- Add global `--format toon|json`; TOON remains the default. Both encodings
  represent the same versioned result model and preserve the existing exit-code
  and empty-default-stderr contract.

### Authoring surface and guidance

- Ship a package-owned progressive authoring guide and a redistributable,
  synthetic multi-page business-report starter selected with
  `init --starter business-report`. Keep the current minimal starter available.
- Teach one continuous path from generated source through a thin document
  entry, explicit report sequence, report-local page furniture, typed
  display-ready data, repeated-family specifications, assets and fonts, screen
  and print CSS, focused review, complete review, and PDF delivery.
- Publish an editable report-local page-manifest pattern that derives displayed
  folios, totals, table-of-contents entries, and cross-references from one
  source of truth. Do not add an Unslide runtime page or numbering component.
- Accept either a complete React element or a zero-prop React component as the
  default source export and publish an authoring source type. Make the React and
  JSX-runtime installation contract explicit and prove it through a packed
  consumer without introducing duplicate React instances.
- State that Unslide evaluates TSX but does not type-check caller source. Give
  the business starter an ordinary TypeScript check path rather than making
  Unslide own consumer compiler policy.
- Let text and inline-asset helpers accept `string | URL`, add common TTF and
  OTF media types, and document path resolution, supported extensions, and
  explicit media-type handling without owning font styling or subsetting.
- Explain that HTML, PDF, manifests, and page captures inherit report
  sensitivity. Scaffold or warn about safe ignore rules for conventional
  `artifacts/` and `.tmp/` outputs.

### Diagnostics and evidence

- Preserve stable error codes while exposing a bounded, curated author-facing
  detail for source loading, invalid exports, asset failures, and compilation
  failures. Keep dependency stacks and raw causes behind explicit debug output.
- Prevent report console output and React warnings from corrupting CLI stdout.
  Route bounded evidence through explicit debug logging, prefer immediate
  scoped capture, and isolate source evaluation when that is required to
  guarantee the automation contract.
- Standardize external page identity around stable `id`, one-based `number`,
  and direct `path`. If a zero-based `index` remains, keep its meaning
  consistent. Make any necessary pre-1.0 correction explicit and update linked
  consumer evidence in the same reviewable slice.
- Improve PDF text preservation evidence so each page samples distinctive
  beginning, middle, and ending content or reports equivalent normalized
  coverage. This remains structural evidence, not a generic visual-fidelity
  claim.
- Make help examples project-aware or generic, add state-aware next actions,
  terminate structured output with a newline, and expose tool and result-schema
  versions.

## Goals

Execute one numbered goal at a time. Update the product contract, design,
architecture, protocol, support documentation, relevant decisions, and public
tests together whenever a goal changes a durable public claim.

### Goal 1 — Specify the authoring and automation contracts

1. Define the exact `review`, `report`, `add`, artifact-mode, starter, and
   global-format command grammar, including invalid combinations and recovery
   guidance.
2. Define one versioned result model shared by TOON and JSON. Specify page
   identity, direct paths, artifact state, warnings, timings, hashes, and
   manifest location and replacement semantics.
3. Define focused versus complete review behavior, all-reports CI behavior,
   HTML-only versus PDF work, freshness guarantees, and failure publication.
4. Define conventional configuration paths, explicit override compatibility,
   source-state isolation, and safe migration of current configurations.
5. Define the React source, dependency, asset, and caller type-checking
   contracts. Record the dependency on the static/interactive plan for parsed
   protocol metadata rather than solving it twice.

Completion requires the public contract to make every new workflow predictable
without relying on implementation knowledge and to preserve the accepted
report/tooling ownership boundary.

### Goal 2 — Make diagnostics and primitive results dependable

1. Implement the shared versioned result presenter and global TOON/JSON
   selection for existing commands while preserving exit codes and the
   empty-default-stderr contract.
2. Add bounded author-facing failure details and regressions for source-load,
   invalid-export, asset, and stylesheet-compilation failures.
3. Isolate report-authored console output from the CLI automation channels and
   prove stdout remains one valid document in both encodings.
4. Normalize page identity and direct paths across HTML inspection, capture,
   PDF inspection, and manifests. Apply the accepted pre-1.0 migration policy
   to public tests and the linked examples consumer.
5. Strengthen PDF per-page text preservation evidence without claiming visual
   correctness.
6. Correct output newlines, help examples, version fields, and state-aware next
   actions while preserving strict flag handling and exit codes.

Completion requires focused public CLI and packed-consumer regressions for
both output formats, failure recovery, and unchanged prior artifact publication
on failure.

### Goal 3 — Improve project setup and the React authoring surface

1. Add conventional path derivation and report-specific missing-source state
   without weakening configuration path safety.
2. Implement dry-run-first `unslide add` with conflict reporting, explicit
   confirmation, and no partial project mutation.
3. Accept element and zero-prop component sources, publish the source type, and
   resolve the React/JSX-runtime package contract through clean packed-consumer
   tests.
4. Extend and document asset helpers for URL inputs and common font formats.
5. Add the synthetic business-report starter, its TypeScript check path, safe
   output ignores, and regressions proving generated source can complete the
   supported lifecycle.

Completion requires both starters and adding a report to work from clean
consumer projects without overwriting existing files or requiring visual
configuration in `unslide.json`.

### Goal 4 — Add the complete review and artifact workflows

1. Implement `unslide report` on the shared versioned presentation model.
2. Add selected-page capture and PDF-native rasterization while retaining
   whole-artifact structural validation and transactional page-image behavior.
3. Implement `unslide review`, transactional manifest publication, optional
   PDF work, and configured-project all-reports execution.
4. Add symmetric artifact capture and export with explicit output paths and the
   same readiness, geometry, validation, input/output separation, symlink
   overlap safety, and publication guarantees as configured reports, without
   requiring project discovery.
5. Keep primitive commands independently usable and prove that review is a
   convenience composition rather than the only inspection path.

Completion requires focused and complete review flows to report trustworthy
evidence without stale upstream artifacts or unnecessary page rasterization.

### Goal 5 — Teach and prove realistic report authoring

1. Publish progressive getting-started and authoring guidance using the
   business starter as the continuous example.
2. Document project growth, report anatomy, repeated-family abstractions,
   report-local numbering and TOC derivation, fonts and assets, screen/print
   ownership, fit debugging, sensitive outputs, and final HTML/PDF inspection.
3. Add a concise command/output/freshness reference covering primitive,
   composite, configured-report, and standalone-artifact workflows.
4. Exercise the impairment report as independent consumer evidence without
   redistributing its protected source material. Keep reference discovery,
   comparison, and acceptance policy outside Unslide.
5. Reconcile `PRODUCT.md`, `docs/DESIGN.md`, `ARCHITECTURE.md`, public package
   contents, support claims, and the next queued plan with the implemented
   surface.

Completion requires the generated business report and packed consumers to run
the documented check, build, focused review, complete review, capture, export,
and PDF inspection paths; `pnpm run check`, focused tests, `pnpm test`, and
`pnpm run validate` to pass; every configured proof-report HTML and PDF page
image to be inspected; and a final `$code-review` with no unresolved actionable
findings.

## Deferred findings

- A first-party review gallery remains deferred. The manifest is sufficient
  for now and does not prevent consumer-owned viewers.
- Core overflow, clipping, or fit linting remains deferred. Document a
  report-local debug pattern and require repeated report evidence plus an
  explicit decision before reopening the accepted boundary.
- Automatic pagination, content redistribution, and fit repair remain outside
  the product.
- Accessibility auditing beyond the existing semantics, tagged-output, and
  extractable-text guarantees needs a separate evidence-backed scope decision.
- A long-lived development server, environment doctor, automatic visual
  scoring, reference-document acceptance, managed visual recipes, built-in
  design components, CSS-framework integration, and new adapter or plugin seams
  remain outside this plan.

## Next action

Finish Goal 1 PR review and feedback handling, then execute Goal 2 without
starting later goals.
