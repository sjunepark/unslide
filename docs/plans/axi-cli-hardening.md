# AXI CLI Hardening Plan

Status: accepted

## Suggested `/goal` objective

> Execute `docs/plans/axi-cli-hardening.md` one numbered goal at a time. Harden
> the existing Unslide CLI against the accepted AXI findings while preserving
> TOON stdout, diagnostic-only stderr, exit codes 0/1/2, the explicit parser,
> and the current product boundaries. Keep `PLAN.md` and this plan's current
> state updated in place, and finish with the repository's implementation
> review and full validation.

On activation, first update `PLAN.md` to record this plan as accepted work and
Goal 1 as the current next action. That administrative update reconciles the
new `/goal` with the repository's prior evidence-gathering next action; it does
not count as a numbered implementation goal.

## Objective

Make the current agent-facing CLI more deterministic, actionable, and
token-efficient without introducing a CLI framework, speculative extension
points, session integrations, or report-design policy.

The work changes a private 0.x automation contract. Prefer the clearest final
contract now rather than compatibility aliases or dual output shapes.

## Required context

Before implementation, read:

- `AGENTS.md`, `PRODUCT.md`, `PLAN.md`, and this plan completely;
- `ARCHITECTURE.md`, especially the CLI boundary;
- `README.md` and `docs/WORKFLOW.md` for the current automation contract;
- `docs/decisions/0002-rendered-preview.md` and
  `docs/decisions/0005-effect-v4-internal-runtime.md`;
- the AXI skill and current TOON specification; and
- the relevant source and tests: `src/cli.ts`, `src/unslide/failures.ts`,
  `src/unslide/browser.ts`, `src/unslide/protocol.ts`, `bin/unslide.mjs`, and
  `tests/cli.test.tsx`.

Before writing Effect code, run `effect-solutions list`, then read the guides
for the Effect error, logging, and resource patterns used by the selected goal.

## Scope decisions and recommendations

| # | Finding | Recommendation | Plan location |
|---|---|---|---|
| 1 | `--help` can hide unknown input | Implement now. Validate unknown flags and excess positional arguments before returning help; let help bypass only missing required values. | Goal 1 |
| 2 | Operational failures collapse to generic or raw output | Implement now. Present observed failures with stable public codes and corrective help while retaining raw causes only for debug stderr. Do not build a taxonomy for hypothetical failures. | Goal 2 |
| 3 | Authored/resource diagnostics are unbounded | Implement now. Return bounded structured previews with totals and a command-scoped `--full` escape hatch for operations that can emit authored browser/protocol diagnostics. `--full` may reveal complete authored diagnostics, never raw dependency causes. | Goal 3 |
| 4 | Home status and next steps can mislead | Implement now. Rename existence-only status to `htmlStatus: present|missing` and make help state-aware. Do not infer freshness from modification times. | Goal 4 |
| 5 | Suggested invocation may not run the current executable | Implement now. Use a PATH-verified `unslide` name with a safely quoted absolute-path fallback; retain the repository lifecycle override. | Goal 1 |
| 6 | Page rows repeat output-directory prefixes | Implement now, before the output contract stabilizes. Emit the common directory once and basenames per page. | Goal 4 |
| 7 | No session hook or installable skill | Defer implementation. During plan activation, add a `PLAN.md` evidence gate: reconsider a static skill only after two independent consumer repositories each require manual orientation in at least two sessions after using no-args output and command help. Consider session hooks only if live session-start state is then proven necessary; session-end capture also requires a privacy decision. | Out of scope |

### Browser installation recommendation

Do not add `unslide setup-browser` in this plan. Chromium and the pinned
Playwright installation command are already explicit parts of the supported
environment. Translate launch failures to a short stable
`browser-not-installed` payload and show the exact pinned installation command,
but never forward Playwright's banner, executable search paths, stack, or raw
cause to stdout. Reconsider an Unslide-owned installer only when more than one
supported environment or package-manager workflow proves that the external
command is a recurring source of failure.

## Invariants

- All agent-consumed data, help, confirmations, and errors remain TOON on
  stdout.
- Default stderr remains empty; opt-in logs remain JSON Lines diagnostics.
- Exit code 0 means success or an idempotent no-op, 1 means operational failure,
  and 2 means invalid CLI usage.
- Raw dependency causes and stacks never appear on stdout, including with
  `--full`.
- `--help` and `--log-level` are accepted consistently for every command.
  `--full` is accepted only by commands documented to emit truncatable authored
  browser/protocol diagnostics. Unknown input still fails with exit 2 and
  inline command help.
- Report source continues to own all DOM, geometry, design, and content fit.
- Keep the explicit parser required by D5. Do not adopt Effect CLI or another
  command framework.
- Keep public output minimal. Do not add `--fields`, pagination, freshness
  tracking, generic adapters, or compatibility output modes.
- Do not implement Claude Code, Codex, or OpenCode hooks, session-end capture,
  or a shipped skill under this plan.

## Numbered goals

### Goal 1 — Make parsing and invocation suggestions deterministic

Refactor validation order without generalizing the parser:

1. Parse the existing global logging flag once and reject duplicates or invalid
   values before any dependency call.
2. For a recognized command, reject unknown flags and excess positional
   arguments even when `--help` is present.
3. Keep `<command> --help` successful without requiring the command's normal
   positional values or paired operation flags.
4. Include `--help` and `--log-level` in every concise command help payload with
   their defaults or behavior. Goal 3 adds `--full` only to the relevant
   command help and parser sets.
5. Replace the launcher's unconditional `pnpm exec unslide` suggestion with one
   command-prefix decision:
   - use the repository lifecycle override for `pnpm --silent run unslide`;
   - otherwise use `unslide` only when PATH resolves to the current executable;
   - otherwise use the current executable's safely shell-quoted absolute path.

Acceptance evidence:

- `build --wat --help` and `build report extra --help` return structured usage
  errors on stdout, empty default stderr, and exit 2.
- `build --help`, `inspect-pdf --help`, and every other command help form return
  exit 0 without touching project or browser dependencies.
- Direct, PATH, repository-script, and paths-containing-spaces invocation
  fixtures produce commands that resolve to the same executable.
- Existing `--log-level` placement and override behavior remains covered.

### Goal 2 — Present stable, actionable operational failures

Use the existing typed failure boundary instead of classifying strings at the
outermost catch:

1. Define the smallest public error-code set justified by current behavior:
   `project-not-found`, `project-config-unreadable`,
   `project-config-invalid`, `report-not-found`, `artifact-not-found`,
   `artifact-invalid`, `browser-not-installed`, and a `command-failed`
   fallback. Reserve `project-config-unreadable` for read/permission failures;
   parse, schema, and path-resolution failures are invalid configuration.
2. Preserve the internal tagged cause, command, report, path, and phase needed
   to select those codes. Add a new internal variant only when an observed case
   cannot be mapped reliably from existing typed state.
3. Return a concise stable message and one complete corrective command or
   template when recovery is available:
   - missing project -> `init`;
   - missing report -> a command template plus the available report names;
   - missing named artifact -> the corresponding `build` or `export` command;
   - positively detected missing browser executable -> the pinned supported
     Chromium installation command;
   - invalid artifact -> the relevant source/build or inspect path.
4. Preserve flags and report names from the invocation when constructing help.
   Fix `init` conflict help so it retains the selected name and confirmation
   semantics.
5. Keep full Effect/dependency causes available only through current debug
   stderr logging.

Do not expose internal class names, Effect types, Playwright banners, Node error
codes, stacks, or filesystem search traces in stdout.

Classify `browser-not-installed` only after a positive missing-executable check.
Other Chromium launch failures, including permissions, sandboxing, or missing
host libraries, remain `command-failed` unless a separate observed recovery
path later earns a stable code.

Acceptance evidence:

- Exact TOON tests cover every public code and corrective-help shape.
- Missing project, unreadable and invalid project configuration, missing
  report, HTML, PDF, browser executable, other browser launch failure, and
  invalid protocol fixtures exercise the public CLI boundary.
- Each error keeps default stderr empty and uses exit 1.
- `--log-level debug` retains diagnostic cause evidence without changing stdout
  bytes.

### Goal 3 — Bound diagnostics without losing recovery information

Replace newline-concatenated issue strings with a small structured diagnostic
model shared by artifact validation and browser operation reporting. Preserve
the complete structured issues in the internal failure and apply output limits
only in the CLI presenter; do not thread CLI verbosity through protocol,
browser, capture, or export APIs:

1. Preserve issue code/source, concise message, optional page ID, and optional
   resource only when they help locate the problem.
2. By default, emit at most 10 issues and at most 1,000 characters per authored
   message or resource. When an item is shortened, report its total character
   count.
3. Include `shown`, `total`, and `truncated` aggregates. Add a `help` command
   carrying the original invocation plus `--full` only when anything was
   truncated.
4. Add `--full` as a presentation option only for `inspect`, `capture`, and
   `export`, the commands that can emit authored browser/protocol diagnostics.
   It disables authored issue count and character limits at the CLI boundary.
   It must not expose raw dependency causes, alter log level, or change
   operational module behavior. Reject it on other commands with exit 2 and
   inline command help.
5. Keep protocol data structured internally and convert to TOON only at the CLI
   output boundary.

Acceptance evidence:

- Fixtures cover more than 10 simultaneous issues, a message longer than 1,000
  characters, a long data URI, and mixed browser/protocol issues.
- Default output is bounded and reports exact totals.
- `--full` returns all authored diagnostics and is suggested only for truncated
  output.
- Dependency launch/read/render failures remain translated under `--full`.

### Goal 4 — Make success output precise, contextual, and compact

Revise output view models without adding a generic schema layer:

1. Change home rows from ambiguous `status: built|not-built` to
   `htmlStatus: present|missing`; document that this is existence only.
2. Emit two or three contextual home suggestions:
   - include `build <name>` when any HTML artifact is missing;
   - include inspection/capture choices when artifacts are present;
   - use placeholders when the output does not select one report.
3. After a successful named build, suggest the actual report's `inspect` and
   `capture` commands. After export, suggest `inspect-pdf`. Keep inspect,
   capture, and PDF-inspection confirmations self-contained.
4. For HTML capture and named/explicit PDF inspection, emit the output directory
   once and page basenames in rows. Retain each command's existing page
   identifier or index, as applicable, plus its existing dimensions; do not add
   a second identity field merely to normalize the row shapes.
5. Do not compute freshness from timestamps or scan report dependency graphs.

Acceptance evidence:

- Exact home-view tests cover all-present, mixed, and missing-artifact states.
- Success-output tests prove contextual commands preserve the real report name.
- Multi-page tests prove directory prefixes occur once and page paths remain
  unambiguous and directly resolvable.
- TOON schemas remain small and no list pagination or `--fields` surface is
  introduced.

### Goal 5 — Align contracts, validate, and review

1. Update `README.md` as the concise canonical automation contract: TOON
   stdout, diagnostic stderr, exit codes, global flags, stable error shape,
   home status meaning, and portable help commands.
2. Keep `docs/WORKFLOW.md` focused on repository report commands and link back
   to the README contract rather than duplicating it.
   Document that `--full` may expose complete report-authored diagnostics and
   should be handled as sensitive output.
3. Update `ARCHITECTURE.md` if the implemented failure or output boundary
   differs from its current description. Update D5 only if an accepted
   constraint changes; do not rewrite the decision merely to narrate code.
4. Update `PLAN.md` in place with the completed decisions, validation evidence,
   blockers, and next action. Keep this file's status and current state concise.
5. Run the implementation-review path from the `code-review` skill. Include the
   diet lens because this work adds a command-scoped flag and public
   error/output surface. Use a focused review subagent for the user-facing CLI
   contract.
6. Apply obvious safe findings, re-run the bounded review, and report any
   remaining decisions instead of silently expanding scope.

Required validation:

```sh
pnpm run check
pnpm test
pnpm run validate
```

Also run direct executable probes for no-args output, all command help forms,
unknown input combined with help, every stable operational error, default and
full diagnostic output, paths containing spaces, and PATH/absolute invocation.

## Current state

- Current goal: Goal 3 — bound diagnostics without losing recovery information.
- Completed: Goals 1–2. The parser and invocation prefix are deterministic. The
  typed failure boundary presents all eight accepted public codes, distinguishes
  missing Chromium from other launch failures, retains corrective report/name
  context, and keeps raw causes on debug stderr only.
- Validation: `pnpm run check` and the complete `tests/cli.test.tsx` suite pass.
  A focused Goal 2 review found that authored capture/export operation failures
  needed an explicit typed distinction; that safe fix and its invalid-geometry
  and invalid-print-CSS regressions pass the bounded recheck.
- Next action: preserve browser/protocol issues structurally and add the
  command-scoped bounded/default versus `--full` presentation contract.
- Blockers: none.

Update this section in place while executing. Do not append session logs.
