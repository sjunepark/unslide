# PDF Export Readiness

Outcome: complete PLAN Goal 1 so PDF export waits for print-activated static
resources and the visual-fidelity boundary is accurate throughout the product
contract.

## State

Status: implementation, review, validation, and visual evidence are complete;
pull-request delivery and feedback handling remain.

Included scope is the print-only PDF-native regression, post-print bounded
readiness, structural-versus-visual guidance, report-owned exact print-color
adjustment, the static-input boundary, starter and packed-consumer evidence,
and linked-development guidance. Independent consumer exercises and the first
Release Please-generated release remain deferred.

## Evidence

- Before the implementation, the focused print-only regression failed during
  export without preserving the delayed resource.
- The regression now proves a successful print-only image in PDF-native output
  and an actionable bounded failure without replacing an existing output.
- A tracked-request regression proves concurrent requests to the same URL are
  tracked independently within the shared readiness deadline.
- `pnpm run validate` passed after implementation and covered source checks,
  tests, packed-consumer behavior, and both configured proof reports.
- Every generated HTML and PDF-native proof-report page image was visually
  inspected for completeness, clipping, typography, and expected color/fill
  preservation.
- The final reviewed diff passed `pnpm run validate`; the regenerated
  proof-report images matched the inspected set exactly.
- Independent implementation review found no remaining safe-fix or
  decision-required findings.

## Next Action

Record the decision and validation evidence on issue #8, then complete
pull-request delivery and feedback handling.
