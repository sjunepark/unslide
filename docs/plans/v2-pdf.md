# V2 PDF Plan

Status: **pending on Adoption Goal 1.**

PDF is a derived target of canonical HTML. This plan must not introduce a
parallel layout model or require Unslide-owned print design.

## PDF Goal 1 — Chromium PDF Export

Status: **pending**

Depends on: Adoption Goal 1

### Objective

Export a valid browser-produced PDF from a named report while preserving
author-owned print CSS and enforcing the one-marked-page-to-one-PDF-page
invariant.

### Scope

1. Add PDF output to the CLI without exposing raw Playwright options.
2. Consume the already-built canonical HTML artifact.
3. Share browser loading and readiness behavior with HTML capture.
4. Print with the canonical Chromium version.
   - Use print media by default.
   - Prefer CSS-defined page size.
   - Include authored backgrounds.
   - Enable tagged output and document outline where supported.
   - Do not add browser header/footer templates.
5. Require report-owned print behavior.
   - The report defines paper geometry and page breaks.
   - Missing or ambiguous geometry fails clearly or requires an explicit
     semantic override; never fall back silently to browser Letter scaling.
6. Parse the produced PDF and validate:
   - the file is readable and nonempty;
   - PDF page count equals artifact marker count;
   - page geometry matches the supported common geometry;
   - expected sample text remains extractable.
7. Write output atomically only after validation succeeds.
8. Cover failures for extra blank pages, content spilling to another sheet,
   missing fonts/images, and invalid output paths.

### Validation

- Focused PDF export and failure-path tests.
- `pnpm run check` and `pnpm test`.
- Export both contrasting proof reports.
- Verify page count, page geometry, and text extraction programmatically.
- Open both PDFs in an ordinary viewer for manual inspection.
- Run the required implementation `code-review` pass, using a subagent because
  export changes a user-facing delivery flow and introduces file parsing.

### Exit Criteria

- One CLI command exports a named report's canonical HTML to PDF.
- No screenshot-to-PDF path exists.
- Report CSS, not configuration defaults, determines design and page geometry.
- A page-count mismatch fails before a misleading artifact is delivered.
- Both proof reports produce readable PDFs with their authored designs.
- `PLAN.md` points to PDF Goal 2.

### Suggested `/goal` Objective

> Implement PDF Goal 1 from `docs/plans/v2-pdf.md`: add semantic Chromium PDF
> export from canonical HTML, enforce report-owned print geometry and page-count
> validation, prove both reports, update plan state, and satisfy every test and
> review criterion.

## PDF Goal 2 — PDF-Native Inspection

Status: **pending**

Depends on: PDF Goal 1

### Objective

Make the actual PDF, rather than HTML print emulation, the visual truth for PDF
delivery review.

### Scope

1. Select the smallest reliable PDF rasterization implementation for supported
   development platforms.
   - Prefer a pinned, automatable dependency.
   - Keep it internal until a second rasterizer creates a real adapter seam.
   - Document installation impact and failure behavior.
2. Add PDF inspection to the CLI.
   - Read an existing PDF or the output of a named report.
   - Write one ordered PNG per PDF page.
   - Keep HTML and PDF inspection outputs distinct.
3. Preserve deterministic output and safe cleanup behavior.
4. Return structured inspection results including page count, dimensions, and
   output paths.
5. Test files with multiple pages, unusual supported geometry, corrupted input,
   and stale output files.
6. Visually compare PDF-native images with authored intent for both proof
   reports; do not require pixel equality with screen-media HTML captures.

### Validation

- Rasterization and cleanup tests.
- PNG signature and minimum-dimension checks.
- `pnpm run check` and `pnpm test`.
- Inspect every PDF page image for both proof reports.
- Verify PDF inspection never reloads source HTML.
- Run the required implementation `code-review` pass, using a subagent for the
  new external rendering dependency.

### Exit Criteria

- PDF inspection consumes only the produced PDF.
- Every PDF page yields one readable, ordered image.
- Corrupt files and rasterizer failures are actionable.
- HTML and PDF inspection evidence cannot be confused by path or command output.
- `PLAN.md` points to PDF Goal 3.

### Suggested `/goal` Objective

> Implement PDF Goal 2 from `docs/plans/v2-pdf.md`: add deterministic
> PDF-native page inspection, prove it consumes only the generated PDF, inspect
> both proof reports, update plan state, and complete all dependency, validation,
> and review requirements.

## PDF Goal 3 — Export Hardening

Status: **pending**

Depends on: PDF Goal 2 and Adoption Goal 3

### Objective

Prove the complete packaged HTML-and-PDF workflow from a clean consumer and
document the supported delivery contract.

### Scope

1. Exercise build, HTML inspection, PDF export, and PDF inspection from the
   packed consumer fixture.
2. Verify deterministic output across repeated runs with the pinned Chromium
   and rasterizer versions.
3. Prove semantic PDF options.
   - Tagged output is requested and present where reliably observable.
   - Document outline behavior is tested with meaningful headings.
   - Document language and basic metadata are preserved where the browser
     supports them.
4. Test local fonts, SVG, images, links, Korean and English text, and authored
   print colors.
5. Document accessibility limits accurately.
6. Add a support matrix for the canonical environment and distinguish supported
   behavior from best effort.
7. Confirm deferred capabilities remain absent: mixed geometry, PDF/A,
   encryption, signatures, attachments, forms, and alternate print engines.
8. Update PRODUCT, DESIGN, ARCHITECTURE, README, WORKFLOW, decisions, and
   `PLAN.md` to describe implemented behavior rather than plans.

### Validation

- Packed clean-consumer workflow.
- Full repository validation and dependency audit.
- Programmatic PDF structure, count, geometry, and text checks.
- Visual inspection of every HTML and PDF page image.
- Markdown-link and documented-command verification.
- Final required implementation `code-review` pass with subagent review of the
  cross-module delivery flow.

### Exit Criteria

- A clean consumer produces standalone HTML and validated PDF through installed
  tooling.
- Both delivery targets have target-native inspection artifacts.
- Documentation states exact supported behavior and limits.
- No report design decision has moved into runtime or project configuration.
- `PLAN.md` records V2 PDF delivery complete and names the next evidence-backed
  product decision.

### Suggested `/goal` Objective

> Implement PDF Goal 3 from `docs/plans/v2-pdf.md`: harden and verify the packed
> HTML/PDF delivery workflow, exercise semantic and multilingual content,
> inspect every target-native page, align all current documentation, and finish
> the required cross-module review.
