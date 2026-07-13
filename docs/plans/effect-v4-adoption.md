# Effect v4 Internal Runtime Plan

Status: **Runtime Goals 1 and 2 complete; Runtime Goal 3 is next.**

This is an internal maintenance track governed by
[D5](../decisions/0005-effect-v4-internal-runtime.md). It does not reopen
product scope or change Unslide's public authoring and artifact contracts.

## Migration Invariants

- Work one numbered goal at a time and update this file and root `PLAN.md` in
  the same change.
- Start at exactly `effect@4.0.0-beta.97`. Matching v4 runtime packages use the
  same exact version; no caret, tilde, `latest`, or `beta` range is allowed.
- Use the local Effect v4 source and `effect-solutions` guidance when an API or
  convention is uncertain. Verify examples against the pinned source before
  relying on them.
- Keep Effect internal. The React entry, artifact protocol, project schema, CLI
  grammar, TOON payloads, stderr behavior, and exit codes remain compatible.
- Prefer one coherent Effect implementation over parallel Promise and Effect
  APIs. Bridge only at a boundary that must stay Promise-native.
- Use services and Layers only at proven resource seams. Do not wrap modules
  solely to make the dependency graph look more Effect-like.
- Do not add retries, concurrency, or new timeouts without operation-specific
  semantics and tests. Deterministic local failures are not retryable by
  default.
- Every goal ends with the required implementation `code-review`; include the
  diet lens for new services, Layers, wrappers, and compatibility paths.

## Non-Goals

- Effect v3 or a v3/v4 compatibility layer.
- `effect/unstable/cli`, Effect Config, or Effect Schema as replacements for
  stable Unslide contracts.
- Effect types in published declarations or the browser-evaluated protocol.
- Visual, pagination, report-model, source-adapter, or recipe-registry changes.
- A public dependency-injection or renderer-plugin interface.
- Replacing Unslide's publication transaction with generic temporary-file
  cleanup.

## Runtime Goal 1 — Foundation and Typed Failure Boundary

Status: **complete**

Depends on: completed V2 scope and D5

### Objective

Introduce the pinned v4 runtime and one typed application boundary while
preserving every observable CLI and package behavior.

### Scope

1. Add `effect@4.0.0-beta.97` as an exact runtime dependency.
   - Add another v4 runtime-family package only when this goal uses it, and pin
     it to `4.0.0-beta.97`.
   - Add `@effect/language-service@0.87.0` as an exact development dependency,
     configure its TypeScript plugin, and enable build-time diagnostics in
     repository checks without adding an install lifecycle that runs for packed
     consumers.
   - Prove frozen installation, package build, and clean tarball consumption
     after the tooling change.
2. Define the smallest useful internal tagged failure union from current CLI
   recovery decisions.
   - Include stable context such as command, report, path, phase, and underlying
     cause only where it helps diagnose or map a failure.
   - Do not reproduce every library exception or create serialization schemas
     for errors that never leave the process.
3. Make CLI command execution one root Effect program.
   - Keep parsing and usage errors at the existing boundary.
   - Translate typed operational failures to the existing TOON payload and exit
     code in one exhaustive formatter.
   - Treat invariant violations and unknown programming errors as defects at
     that outer boundary; do not silently turn them into expected failures.
4. Migrate project discovery and configuration loading as the first vertical
   slice. Wrap remaining Promise command implementations once at orchestration,
   rather than adding dual APIs throughout the module tree.
5. Use `Effect.fn` for named operational entry points and `Effect.gen` for
   sequential workflows where they improve traces and error readability.
6. Add focused tests for every tagged failure mapping and retain byte-for-byte
   assertions for help, TOON stdout, empty stderr, and 0/1/2 exits.

### Validation

- `pnpm install --frozen-lockfile`
- `pnpm run check`
- `pnpm test`
- Package build, tarball contents inspection, and the clean packed-consumer
  workflow.
- Production dependency audit and license review for the new runtime package.
- Search built declarations and package exports to confirm that no Effect type
  or internal runtime entry escaped.
- Run the required implementation `code-review` with the diet lens.

### Exit Criteria

- All Effect packages and tools are exactly pinned and install reproducibly.
- The root CLI program has an explicit typed failure channel and one output
  formatter; user-facing behavior is unchanged.
- Config discovery/loading no longer depends on message-prefix inspection or a
  broad catch-all error path.
- No unstable Effect module, public Effect type, speculative service, or
  per-function dual API exists.
- `PLAN.md` points to Runtime Goal 2.

### Completion Evidence

- `effect@4.0.0-beta.97` is an exact runtime dependency and
  `@effect/language-service@0.87.0` is an exact development dependency. The
  pinned local plugin schema and `check` script enable build diagnostics without
  adding an install lifecycle. The workspace enforces dependency engine ranges;
  the active release-age policy has one exact exception for the newly published
  tool.
- One named root Effect program owns CLI execution. Four internal
  `Data.TaggedError` cases describe project discovery, configuration, report
  lookup, and bridged command failures; one exhaustive formatter preserves the
  existing TOON payloads and 0/1/2 exits. Unknown exceptions in the migrated
  configuration slice remain defects at the outer boundary.
- Project discovery, JSON/schema validation, safe path resolution, canonical
  path checks, and report lookup use typed Effect channels. Remaining
  Promise-native commands cross one orchestration bridge rather than gaining
  parallel APIs; no service, Layer, unstable import, or public Effect type was
  introduced.
- Tests assert exact help and failure bytes, empty stderr, all exit codes, and
  every tagged failure mapping. On the canonical Node 24.15 environment,
  frozen installation, build diagnostics, package compilation, and full
  validation passed; every regenerated HTML and PDF page image was inspected
  without defects.
- The final tarball retained only the established exports and public
  declarations. A clean packed consumer installed with a frozen lockfile and
  completed initialization, HTML build/inspection/capture, PDF export, and PDF
  inspection; no Effect type appeared in the packed declarations.
- The production audit found no known vulnerabilities. Effect and its added
  transitive dependencies use MIT, ISC, BSD-3-Clause, or Apache-2.0 licenses.
  The implementation review and bounded recheck, including the diet lens,
  ended with no remaining safe finding or decision.

### Suggested `/goal` Objective

> Implement Runtime Goal 1 from `docs/plans/effect-v4-adoption.md`: add the
> exactly pinned Effect v4 foundation and language-service checks, migrate the
> CLI/config vertical slice to a minimal tagged failure boundary, preserve all
> public behavior, update both plans, and complete validation and review.

## Runtime Goal 2 — Scoped Browser and PDF Lifecycles

Status: **complete**

Depends on: Runtime Goal 1

### Objective

Make Chromium, PDF.js, page, canvas, and deadline lifetimes interruption-safe
without changing the serializable artifact protocol or output artifacts.

### Scope

1. Treat the loaded-artifact lifecycle in `browser.ts` as the internal deep
   module for browser acquisition, readiness, validation, and release. Migrate
   its implementation and callers together; do not publish a browser service or
   adapter interface.
2. Acquire and release Playwright browser resources with Effect scopes.
   - Finalizers run on success, typed failure, defect, timeout, and
     interruption.
   - A cleanup failure is retained without masking the primary operation
     failure.
3. Apply the same lifetime model to PDF.js loading tasks, PDF pages, render
   tasks, and canvases. Destruction and cancellation must be idempotent where
   upstream APIs permit it.
4. Add bounded Effect deadlines only to operations with a defined timeout
   policy. Ensure interruption reaches the underlying browser or PDF work
   instead of merely abandoning its Promise.
5. Fix resource-readiness tracking so concurrent requests for the same URL are
   counted by request identity or reference count. This is a direct correctness
   fix, not an Effect abstraction.
6. Keep `validateArtifact` Promise-native, closure-free, and serializable for
   browser evaluation. Bridge it once at the loaded-artifact boundary.
7. Preserve sequential capture/export ordering unless measured evidence earns
   bounded concurrency.
8. Add lifecycle tests for success, operational failure, timeout/interruption,
   and cleanup failure. Prefer real integration evidence; introduce an internal
   test seam only when a failure cannot be induced deterministically.

### Validation

- `pnpm run check`
- `pnpm test`
- Build, inspect, capture, export, and PDF-inspect both proof reports.
- Inspect every affected HTML capture and PDF-native page image.
- Confirm no Chromium process, PDF loading/render task, or recovery temporary
  resource survives completed and failed test workflows.
- Run the required implementation `code-review` with a subagent and the diet
  lens because this goal changes shared cross-module resource behavior.

### Exit Criteria

- Browser and PDF resources have explicit scoped ownership and tested cleanup.
- Timeouts and interruption cannot strand the underlying work.
- Primary and cleanup failures remain diagnosable together.
- Same-URL concurrent resources cannot make readiness complete early.
- Browser protocol and generated HTML, PNG, and PDF behavior remain unchanged.
- `PLAN.md` points to Runtime Goal 3.

### Completion Evidence

- Chromium browser, context, and page ownership now uses one sequential Effect
  scope. The existing 5-second navigation policy is an interrupting Effect
  deadline; real-browser tests prove release after success, operation failure,
  interruption, and cleanup failure.
- A small internal scope runner retains primary and cleanup causes together at
  the Promise boundary. The existing `Set<Request>` identity accounting and
  its same-URL regression test remain unchanged and pass.
- PDF loading tasks, pages, unsettled render tasks, and native canvases now have
  explicit scoped destruction, cleanup, cancellation, and release. Per-page
  scopes preserve sequential ordering and release each page before the next;
  interruption of stalled page acquisition destroys the loading task exactly
  once, while non-cancellable native encoding and staging writes finish before
  cleanup.
- On Node 24.15.0, full `pnpm run validate` passed, including the packed
  clean-consumer workflow. Both proof reports regenerated, captured, exported,
  and rendered from PDF at their authored page counts.
- Every HTML and PDF-native page image was inspected without overflow,
  clipping, missing glyphs, blank pages, or target drift. Their hashes remained
  identical after the review fix and final validation. No Chromium process,
  PDF task, page-image staging directory, PDF staging file, or recovery
  temporary resource survived the completed or failed workflows.
- Package build and dry-run packing retained the established package surface
  and intended public declarations; no Effect type escaped through a package
  export. No unstable Effect import, service, Layer, adapter, new
  timeout, or concurrent ordering path was introduced.
- The required subagent implementation review and diet lens found no decision
  item. Its one safe finding—interrupting a stalled PDF page acquisition—was
  fixed, independently rechecked, and covered in both PDF workflows.

### Suggested `/goal` Objective

> Implement Runtime Goal 2 from `docs/plans/effect-v4-adoption.md`: migrate the
> browser and PDF lifecycles to scoped Effect v4 resources, fix same-URL request
> accounting, prove cleanup and interruption behavior, preserve the page
> protocol and artifacts, update both plans, and complete full validation and
> review.

## Runtime Goal 3 — Filesystem Transactions and Release Hardening

Status: **next**

Depends on: Runtime Goal 2

### Objective

Complete the coherent internal migration around filesystem and publication
work, remove transition scaffolding, and prove the packaged consumer contract.

### Scope

1. Use v4's top-level filesystem and path services, with the exactly matching
   Node platform Layer, where they preserve the current path and error
   semantics. Keep direct Node APIs when an Effect service would require a
   lossy wrapper or weaken a security invariant.
2. Migrate build, initialization, HTML/PDF publication, and page-image
   publication into the typed operational pipeline.
3. Preserve the existing transaction rules exactly.
   - Canonical HTML and PDF publication remain atomic.
   - Page-image rollback restores prior output when possible.
   - Recovery staging remains available when rollback is incomplete; a scope
     finalizer must not delete the evidence needed for manual recovery.
4. Keep the `unslide/react` asset helpers Promise-based at the public interface.
   Bridge internal filesystem services behind that interface only if doing so
   reduces the implementation rather than creating two paths.
5. Remove Goal 1 transition wrappers, obsolete broad catches, and unused
   Promise-only orchestration after all callers migrate.
6. Recheck the module graph for depth and locality.
   - One application Layer is provided at the executable boundary.
   - Each service represents a real resource or substitutable capability.
   - Internal seams do not become package exports merely for testing.
7. Update `ARCHITECTURE.md`, support documentation, package evidence, D5's exact
   version if it changed, and both plan files to describe only the verified
   implementation.

### Validation

- `pnpm install --frozen-lockfile`
- `pnpm run validate`
- Failure-injection tests for atomic publication, rollback, cleanup failure,
  and retained recovery staging.
- Visual inspection of every generated HTML capture and PDF-native page image.
- Package build and contents inspection, followed by the complete clean
  packed-consumer workflow.
- Production dependency audit and license review.
- Markdown link/path verification and a consistency check across PRODUCT,
  DESIGN, ARCHITECTURE, decisions, and both plan levels.
- Run the required implementation `code-review` with a subagent and the diet
  lens.

### Exit Criteria

- The internal operational pipeline uses one coherent Effect v4 design with no
  v3, unstable imports, accidental dual paths, or speculative public seams.
- Typed failures, scopes, and application Layer ownership cover the resource
  and publication workflows that benefit from them.
- Public CLI, React, schema, protocol, HTML, PNG, and PDF contracts remain
  compatible.
- Full repository and clean-consumer validation pass, all rendered evidence is
  inspected, and current documentation matches the implementation.
- Root `PLAN.md` returns to the consumer-evidence product gate unless new
  evidence has justified another accepted scope decision.

### Suggested `/goal` Objective

> Implement Runtime Goal 3 from `docs/plans/effect-v4-adoption.md`: complete the
> filesystem and publication migration without weakening transaction recovery,
> remove transition scaffolding, harden the package and consumer workflow,
> update current architecture and plans, and complete full validation and
> review.
