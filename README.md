# Unslide

Unslide builds explicit fixed-page reports from TypeScript, React, HTML, and
CSS. The canonical artifact is standalone HTML; the same HTML can be captured
in Chromium, exported to a structurally validated PDF, and inspected as
target-native page images.

Reports own the complete document, geometry, styling, print rules, and content
fit. Unslide owns only the nonvisual build, validation, capture, and export
lifecycle. It does not paginate, move overflowing content, or prescribe a
design system.

## Install

Unslide currently supports pnpm projects in the environment documented by the
[delivery contract](docs/SUPPORT.md). Configure pnpm before installation:

```yaml
# pnpm-workspace.yaml
engineStrict: true
allowBuilds:
  esbuild: true
  msgpackr-extract: false
```

```sh
pnpm add unslide react react-dom
pnpm add -D typescript @types/node @types/react
pnpm dlx playwright@1.61.1 install chromium
```

Initialize a report project:

```sh
pnpm exec unslide init
pnpm exec unslide init --yes
```

The first command is a dry run. The confirmed command creates a source-only
`unslide.json`, `report.tsx`, removable starter `report.css`, and a safe
`.gitignore` when one does not exist. It never overwrites files with different
contents.

Choose the multi-page teaching starter or add a report to an existing project:

```sh
pnpm exec unslide init --starter business-report --yes
pnpm exec unslide add quarterly-review --starter business-report
pnpm exec unslide add quarterly-review --starter business-report --yes
pnpm exec tsc --noEmit -p quarterly-review/tsconfig.json
```

`init` and `add` are dry runs without `--yes`. `add` reports every starter-file
conflict before writing and leaves the existing project unchanged on failure.

Build and inspect the report:

```sh
pnpm exec unslide build report
pnpm exec unslide inspect report
pnpm exec unslide capture report
pnpm exec unslide export report
pnpm exec unslide inspect-pdf report
```

`capture` and `export` consume existing HTML, and `inspect-pdf` consumes
an existing PDF. Rebuild upstream artifacts after changing source. Export
waits boundedly for static resources activated by print media, then checks PDF
structure; it does not establish visual fidelity. Inspect every PDF-native page
image. The tooling does not measure or repair content fit, although page-count
validation can reveal unintended print fragmentation.

## Authoring Contract

A report exports a complete React `<html>` document as either a created element
or a synchronous zero-prop component and marks each page with the versioned
[HTML artifact protocol](docs/PROTOCOL.md). Ordinary values and collections
flow into report source without a Unslide data model. `unslide/react` publishes
the `ReportSource` type plus `readTextAsset` and `inlineAsset`; the helpers
accept paths or source-relative `file:` URLs, and binary inlining supports
common image, WOFF, WOFF2, TTF, and OTF formats. Recognized unresolved resource
dependencies are rejected by the first-party writer.

HTML remains independently viewable without React, Node.js, Playwright, or a
server. PDF and inspection images are derived delivery evidence, not parallel
authoring formats.

Protocol v1 supports static visual resources. Animations, delayed client
rendering, and an author-controlled asynchronous readiness signal are not
supported inputs. Print color adjustment is report-owned CSS, and exact color
reproduction across rendering environments is not guaranteed.

The project [JSON Schema](schema/unslide.schema.json) rejects unknown fields.
Each report requires only `source`; conventional HTML, PDF, capture, and
PDF-capture paths are derived by report name unless explicitly overridden.
Configuration loading additionally rejects paths that escape the project root
and overlapping source and output paths. A missing source is report state and
does not block discovery or work on another report. Visual choices do not
belong in configuration.

## CLI Automation Contract

With no command, `unslide` discovers the nearest `unslide.json` from the
current directory or its parents and lists configured reports. Each report
includes absolute source, HTML, PDF, capture, PDF-capture, and review-manifest
path state. Existence and modification time are observations only; they do not
claim freshness.

Every invocation writes one result-schema-v1 document followed by one newline.
TOON is the default; `--format json` selects compact JSON. Both encodings decode
to the same envelope with `toolVersion`, `command`, `status`, `result` or
`error`, and always-present `warnings`, `timings`, and `help` arrays.

| Exit | Meaning                        |
| ---- | ------------------------------ |
| `0`  | Success or an idempotent no-op |
| `1`  | Operational failure            |
| `2`  | Invalid command usage          |

Default stderr is empty. Operational failures use an `error` record with a
stable `code`, a concise `message`, and relevant structured context. The
current operational codes are `project-not-found`,
`project-config-unreadable`, `project-config-invalid`,
`report-not-found`, `source-not-found`, `artifact-not-found`, `artifact-invalid`,
`browser-not-installed`, and `command-failed`. Usage errors use
`code: usage` with exit 2.

Top-level and per-command `--help` are noninteractive. Unknown flags and extra
values still fail when combined with help; help bypasses only missing required
values. Commands returned in `help` are complete and should be run as
written.

| Option                           | Contract                                                                                     |
| -------------------------------- | -------------------------------------------------------------------------------------------- |
| `--format <toon\|json>`          | Selects the result encoding; may appear once before or after the command                     |
| `--log-level <off\|info\|debug>` | Overrides `UNSLIDE_LOG_LEVEL`; default `off`                                                 |
| `--full`                         | Available only to `inspect`, `capture`, and `export`; removes authored-diagnostic truncation |

Default diagnostics show at most 10 issues and 1,000 Unicode characters per
authored message or resource, with exact totals. `--full` never exposes raw
dependency causes, but it may reveal complete report-authored text and resource
identifiers.

Enabled logging writes newline-delimited Effect JSON to stderr without
changing the selected stdout result. Report-authored console calls and React
warnings are isolated from both automation channels by default and appear only
as bounded structured debug records. `info` records major phases; `debug` adds
detailed lifecycle and Effect-cause evidence. Logging and `--full` output can
contain local paths or authored content and should be handled as sensitive
diagnostics.

## Package Surface and Compatibility

The public package exposes only:

- the `unslide` executable;
- `unslide/react` for React authoring and local-asset helpers;
- the project [JSON Schema](schema/unslide.schema.json);
- the [artifact protocol](docs/PROTOCOL.md); and
- the [supported delivery contract](docs/SUPPORT.md).

Browser sessions, validators, capture internals, and speculative adapter seams
remain implementation details.

`unslide.json` version 1 and artifact protocol v1 are the persisted
contracts. Unsupported versions fail with manual migration guidance; the CLI
does not rewrite user-owned configuration or source. The package remains 0.x,
so breaking public-contract changes require an explicit pre-1.0 minor release
and migration note.

## Repository Development

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm run format
pnpm run check
pnpm run validate
```

Oxlint owns linting, Oxfmt owns formatting, and `tsc` owns type checking.
`pnpm run check` composes their non-writing checks and is the source-validation
entry point used by CI through `pnpm run validate`. Use `pnpm run lint`,
`pnpm run format:check`, or `pnpm run typecheck` when iterating on one concern.

Linked consumers execute compiled `dist`. After changing this repository's
package source, run `pnpm run build:package` before using a link, or run
`pnpm pack --pack-destination .tmp/package` and install the fresh tarball.
The production CLI does not detect stale linked builds.

See the
[Repository Workflow](https://github.com/sjunepark/unslide/blob/main/docs/WORKFLOW.md)
for proof-report commands, generated artifacts, packed-consumer testing, and
visual inspection requirements.

The active consumer-authoring plan's accepted contracts are documented
in [CLI Commands](docs/COMMANDS.md), [Result and Manifest Model](docs/RESULTS.md),
and [React Authoring](docs/AUTHORING.md). The configuration, setup, React, asset,
and existing-command result sections are implemented; review, focused-page,
and standalone capture/export sections remain roadmap work until their goals
are implemented and validated.

Repository-only documentation has one responsibility per file:

- [Product](https://github.com/sjunepark/unslide/blob/main/PRODUCT.md) defines
  the user, job, principles, and scope.
- [Product Design](https://github.com/sjunepark/unslide/blob/main/docs/DESIGN.md)
  defines authoring vocabulary and ownership.
- [Architecture](https://github.com/sjunepark/unslide/blob/main/ARCHITECTURE.md)
  maps runtime components and invariants.
- [Roadmap](https://github.com/sjunepark/unslide/blob/main/ROADMAP.md) records
  current and ordered work; linked plan files own execution detail.
- [Release](https://github.com/sjunepark/unslide/blob/main/docs/RELEASE.md) is
  the publishing runbook.
- [Decision records](https://github.com/sjunepark/unslide/tree/main/docs/decisions)
  preserve accepted rationale.

## License

Unslide is available under the [MIT License](LICENSE).
