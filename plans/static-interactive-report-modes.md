# Add Static and Interactive Report Modes

## Outcome

Unslide supports two explicit report-level delivery modes without owning an
animation or interaction framework:

- `static` reports produce passive standalone HTML and retain the supported
  deterministic capture and PDF workflow; and
- `interactive` reports may contain arbitrary report-owned browser behavior,
  while capture and PDF deliberately render a script-disabled initial
  projection and disclose that limitation in structured output.

Authors can keep interactive presentations and printable reports as separate
entries while sharing data, calculations, page modules, and visual source.

## Current state

- The product and protocol currently describe static visual inputs and exclude
  animations, delayed client rendering, presentation controls, and an
  author-controlled readiness signal.
- The React writer renders arbitrary report-owned markup and rejects recognized
  unresolved resource dependencies, but it does not reject inline scripts or
  other active HTML before publishing.
- Browser commands execute page-authored JavaScript because the shared
  Chromium context uses its default setting.
- HTML capture asks Playwright to disable animations. Finite animations are
  consequently advanced to completion rather than representing a defined
  initial state, and PDF export has no equivalent animation-state contract.
- `capture` and `export` consume existing HTML instead of rebuilding it, so a
  build-only policy check would not cover edited or independently generated
  artifacts.
- User direction accepts separate static and interactive report modes,
  arbitrary report-owned interactivity, initial-state capture/PDF for
  interactive reports, and a mandatory warning that interactive HTML may
  differ from its static projection.
- The Oxlint, Oxfmt, and `tsc` adoption is complete. The consumer report
  authoring work adds configured and standalone primitives, focused and
  complete `review` composition, transactional manifests, and packaged
  authoring and CLI references. This work must extend those public workflows
  and validation commands rather than introducing a parallel path.

## Accepted design

### Report-level modes

- A report is `static` or `interactive`; mode is never inferred from markup.
- Mode is report-wide. Mixed per-page execution policies are not part of this
  work.
- Existing reports that do not declare a mode remain static for compatibility.
  New scaffolds declare `static` explicitly.
- Mode is persisted as nonvisual artifact metadata so an HTML artifact remains
  self-describing. Project configuration and artifact metadata must not be
  allowed to disagree; the exact single source and serialization path are
  finalized in Goal 1 without introducing two author-maintained declarations.
- The existing artifact protocol continues to describe the capturable static
  projection. Interactive playback, state transitions, and post-load behavior
  are not readiness claims made by that protocol.

### Static mode

- Static policy is checked against serialized HTML, not React source or caller
  data preparation.
- The same semantic validator runs before atomic HTML publication and before
  `inspect`, `capture`, or `export` opens an existing artifact.
- Static violations are hard, structured `artifact-invalid` failures. They do
  not replace a prior HTML or PDF delivery.
- The validator uses a standards-conforming HTML parser rather than regular
  expressions for element, attribute, and URL-policy decisions.
- The initial prohibited set covers scripts, inline event handlers,
  `javascript:` URLs, executable embedded documents, meta refresh, SVG
  animation elements, and authored CSS animations or transitions. Goal 1 must
  record the exact normative list and how URL and CSS values are normalized.
- Existing standalone-resource checks remain in force and should share parsed
  evidence where doing so removes duplicate or weaker scanning logic.
- Static browser operations disable page-authored JavaScript as defense in
  depth even after semantic validation succeeds.

### Interactive mode

- Unslide supplies no animation vocabulary, component library, timeline,
  navigation model, event system, or client framework. Authors own arbitrary
  embedded JavaScript, CSS, SVG, canvas, controls, and interaction semantics.
- The first-party writer continues to require a complete standalone artifact
  and reject recognized unresolved markup and CSS resource dependencies.
  Runtime behavior inside author scripts is outside Unslide readiness and
  fidelity guarantees.
- Page markers, page geometry, and meaningful printable content must exist in
  the initial HTML. Pages created only by JavaScript do not form a valid static
  projection.
- `inspect`, `capture`, and `export` load the artifact with page-authored
  JavaScript disabled and suppress authored animation and transition behavior.
  The result is defined as the source-authored DOM and base CSS state before
  interactive execution, not the first keyframe, final state, or an
  automatically simulated user state.
- Every browser-derived result for an interactive report carries a stable
  structured warning explaining that the command observed the initial static
  projection and that normal interactive playback may differ.
- Unslide does not validate the correctness, accessibility, or visual fidelity
  of author-owned interaction behavior. Consumer browser tests remain the
  evidence for those behaviors.

### Static and interactive companions

- The documented default is two report entries with separate entry modules
  when both presentation and print delivery matter.
- Companion entries should share caller data, calculations, page modules,
  styles, and assets through ordinary imports. Differences in visibility,
  ordering, prose, and print composition remain explicit at the entry-module
  level.
- Unslide does not automatically derive a static report from arbitrary
  interactions or add a dual-render source interface in this work. A future
  shared-source interface requires repeated consumer evidence that two small
  entry modules are insufficient.

## Goals

Execute one numbered goal at a time. Keep this plan, the roadmap, product
contract, architecture, protocol, support contract, and accepted decisions
consistent whenever a goal changes a durable claim.

### Goal 1 — Accept the execution and projection contract

1. Add a decision record that defines `static` and `interactive`, explains why
   Unslide owns policy and projection mechanics but not interactions, and
   records the separate-entry default.
2. Decide the persisted mode declaration and compatibility behavior so the
   project has one author-controlled declaration and the HTML artifact is
   self-describing without visual source injection.
3. Specify the exact static active-content taxonomy, normalized URL rules,
   CSS/SMIL animation policy, diagnostic fields, and treatment of inert script
   data.
4. Define the interactive initial projection precisely, including JavaScript,
   animations, transitions, media selection, resources, page discovery, text
   evidence, and warning semantics.
5. Update `PRODUCT.md`, `docs/DESIGN.md`, `ARCHITECTURE.md`,
   `docs/PROTOCOL.md`, and `docs/SUPPORT.md` together. Keep built-in animation
   controls and asynchronous readiness outside the accepted scope.

Completion requires the contract to answer how every public command behaves
for both modes, how legacy artifacts are interpreted, and which claims apply
to delivered interactive HTML versus its captured or printed projection.

### Goal 2 — Add semantic artifact-policy validation

1. Introduce one internal artifact-policy module whose small interface accepts
   serialized HTML plus the expected mode and returns validated metadata or
   structured diagnostics.
2. Select and pin a standards-conforming HTML parser. Preserve source location
   evidence when practical so failures identify the offending element,
   attribute, value, and artifact path without dumping unrelated report data.
3. Implement static active-content and mode-metadata validation with focused
   fixtures for casing, entities, malformed-but-browser-accepted markup,
   namespace behavior, URL normalization, raw-text elements, inline SVG, and
   CSS declarations.
4. Run the validator after static markup serialization but before staged HTML
   publication, preserving the existing atomic replacement behavior.
5. Run the same validator against existing HTML before any browser command
   navigates to it. An invalid edited artifact must fail before its authored
   code can execute.
6. Consolidate standalone-resource discovery with parsed evidence where this
   improves correctness without expanding the supported resource contract.

Completion requires regression evidence that every prohibited active-content
class fails before publication and before browser navigation, interactive mode
accepts representative embedded behavior, existing supported static reports
remain valid, and failures never replace prior outputs.

### Goal 3 — Implement mode-aware browser projection

1. Make the shared browser session select its execution policy before
   navigation. Static and interactive projection commands disable
   page-authored JavaScript while Playwright evaluation used by Unslide remains
   available.
2. Replace screenshot-only animation handling with one shared projection step
   used by `inspect`, `capture`, and `export`. It must expose base authored CSS
   state rather than fast-forward finite animations.
3. Preserve bounded document, font, image, and print-resource readiness for the
   projection. Do not add a user-controlled asynchronous readiness signal.
4. Add stable mode and warning records to CLI results. Warnings must remain on
   stdout within the TOON document, preserve the existing exit-code contract,
   and avoid stderr unless logging is explicitly enabled.
5. Prove that interactive scripts cannot mutate the captured or printed
   projection, initial page markers remain discoverable, print geometry and
   page parity remain enforced, and PDF text evidence is taken from the same
   initial projection.

Completion requires focused browser and PDF regressions for synchronous
scripts, timers, DOM-created pages, CSS transitions, finite and infinite CSS
animations, Web Animations, and print-specific static resources.

### Goal 4 — Prove authoring and consumer behavior

1. Update initialization and public guidance for explicit static mode without
   adding a required visual foundation.
2. Add one meaningful interactive proof report with report-owned controls and
   staged visual behavior. Its initial HTML must remain a useful static
   projection, and its script and assets must remain self-contained.
3. Add a companion static entry that reuses ordinary data and page modules
   while making its print composition explicit. Do not add a dual-render
   framework or shared-source adapter.
4. Exercise packed-consumer installation and all public commands for both
   modes. Prove that the interactive HTML behaves normally when opened with
   JavaScript enabled and that Unslide capture/PDF consistently represents the
   warned initial projection.
5. Update the README automation contract and repository workflow with mode
   semantics, companion-entry guidance, structured warnings, failure recovery,
   and the limits of interactive validation.

Completion requires `pnpm run check`, focused tests, `pnpm test`, and
`pnpm run validate` to cover both modes and the packed consumer; both proof
reports to complete their configured build, capture, export, and PDF inspection
flows; every generated HTML and PDF-native page image to be inspected; and a
final `$code-review` with no unresolved actionable findings.

## Non-goals

- An Unslide animation or interaction DSL, timeline, presentation controller,
  navigation shell, or client runtime.
- Automatic conversion of arbitrary interactive behavior into a semantically
  complete printable report.
- Capturing every interaction step, choosing a final state, replaying events,
  or inferring when arbitrary browser code is quiescent.
- Per-page execution modes within one report.
- Network-backed interactive readiness, live-data synchronization, or
  validation of requests initiated by arbitrary author scripts.
- Sandboxing untrusted report source or delivered scripts. Report source
  already executes as trusted caller code during build.
- A second authoring adapter or generalized renderer/plugin seam.

## Next action

After the consumer report authoring plan is complete and this plan becomes
current, execute Goal 1: write the decision record and reconcile the public
contract before changing the schema, renderer, validator, or browser runtime.
