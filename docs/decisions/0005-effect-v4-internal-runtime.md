# D5 — Effect v4 for the Internal Runtime

Date: 2026-07-13

Status: accepted

## Context

Unslide's public model is intentionally small, but its tooling coordinates many
failure-prone resources: filesystem publication, Chromium, PDF.js loading
tasks, canvases, deadlines, cleanup, and rollback. The current Promise-based
implementation works, yet these operations do not share a typed failure model
or structured lifetime management.

Effect can improve those internal mechanics. Starting with Effect v3 would add
a second migration because v4 has native APIs and design conventions that
differ in meaningful ways. This project can tolerate beta API churn, and the
cost of an intentional upgrade is less important than converging on the design
we expect to keep.

## Decision

Adopt Effect v4 for Unslide's internal operational runtime. Use the exact
versions `effect@4.0.0-beta.97` and
`@effect/platform-node-shared@4.0.0-beta.97`; do not use Effect v3 as a bridge.

The adoption follows these constraints:

- Pin `effect` and every v4 runtime-family package to the same exact beta
  version. Pin independently versioned Effect development tools exactly too.
  Upgrade only in a deliberate change that reruns the full validation and
  clean-consumer workflow.
- Keep Effect behind package and CLI boundaries. No Effect type becomes part of
  `unslide/react`, the artifact protocol, project configuration, or another
  published contract.
- Use top-level v4 modules. An `effect/unstable/*` dependency requires new
  evidence and an update to this decision before adoption.
- Preserve the existing CLI parser, TOON stdout, default-empty stderr, and
  0/1/2 exit behavior. Do not replace it with Effect's CLI module. Explicit
  `info` or `debug` logging may install Effect's JSON logger on stderr; its
  pre-release event shape is diagnostic rather than a published contract.
- Preserve Ajv and the published JSON Schema for `unslide.json`. Do not replace
  project configuration with Effect Config or Effect Schema.
- Keep the browser-evaluated artifact validator Promise-native and
  self-contained so Playwright can serialize it into the page.
- Model only actionable internal failures as a small tagged union. Prefer
  `Data.TaggedError` for these non-serialized failures; defects remain defects.
- Use scopes for real resource lifetimes and interruption-safe cleanup. Preserve
  the primary failure when cleanup also fails.
- Introduce `Context.Service` and Layers only for genuine shared resources or
  alternate implementations. With one real adapter, keep the seam internal and
  provide Layers once at the application boundary.
- Use Effect's native logger, annotations, log spans, and minimum-level
  reference for internal execution evidence. Replace the default logger even
  when logging is off so it cannot contaminate structured stdout.
- Keep domain-specific publication and rollback semantics explicit. A generic
  scope must not erase recovery artifacts that are intentionally retained after
  incomplete rollback.

## Consequences

Benefits:

- Browser, PDF, canvas, and temporary-resource cleanup can be expressed and
  tested as lifetimes instead of dispersed `try`/`finally` blocks.
- Expected failures become explicit and can be translated to the stable CLI
  contract in one place.
- Deadlines and interruption can compose with cleanup without growing another
  local orchestration framework.
- New code follows v4-native module and service conventions immediately.

Costs:

- Beta upgrades may require source changes before v4 reaches a stable release.
- Contributors must learn Effect's error, scope, and environment model.
- Promise bridges remain at Playwright serialization and public authoring
  boundaries.
- Effect does not remove the need to reason about Unslide-specific atomicity,
  rollback, and recovery invariants.

## Rejected Alternatives

- **Adopt v3 first.** Its maturity does not justify teaching the codebase a
  design that would then need a second migration.
- **Wait for v4 stable.** This avoids churn but leaves the most failure-prone
  internals on the current ad hoc lifetime model without a product reason to
  wait.
- **Adopt Effect everywhere.** Replacing stable public contracts, Ajv, the CLI
  grammar, or the serializable page protocol would add coupling without
  improving their behavior.
- **Wrap every dependency as a service.** A seam with one implementation and no
  variation would enlarge the test and maintenance surface without adding
  depth.

## Revisit When

Revisit the exact version when v4 reaches a stable release or a required beta
upgrade is proposed. Revisit the public boundary only if a real consumer needs
to compose directly with Effect. Revisit an unstable module only when a
concrete feature cannot be implemented credibly with the top-level v4 APIs.
