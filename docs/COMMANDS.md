# CLI Command Contract

This document defines the released command surface. For a shorter operational
view, see the packaged [CLI workflow reference](CLI.md).

## Invocation and Global Options

`--format` and `--log-level` are global options. Each may appear once, before or
after the command and its arguments, and each requires a separate value.
Joined forms such as `--format=json` are invalid.

```text
unslide [--format <toon|json>] [--log-level <off|info|debug>]
unslide [global options] <command> [command options]
```

TOON remains the default. A valid `--format` controls every result, including
home, help, usage errors, and operational failures. An absent, malformed,
duplicate, or unsupported `--format` is reported as TOON because no valid
alternate encoding was selected. Both encodings end with one newline.

`--help` is available for every command. Help bypasses only missing required
values; unknown flags, duplicates, mixed command forms, and extra values still
fail with exit 2 and command-specific recovery guidance. `--full` is available
only to `inspect`, `capture`, `export`, and `review`; it expands bounded authored
diagnostics but never exposes dependency stacks or raw causes.

## Grammar

```text
unslide
unslide init [--name <name>] [--starter <minimal|business-report>] [--yes]
unslide add <name> [--starter <minimal|business-report>] [--yes]
unslide report <name>
unslide build <name>
unslide inspect <name> [--full]
unslide inspect --artifact <html> [--full]
unslide capture <name> [--page-id <id> | --page-number <number>] [--full]
unslide capture --artifact <html> --output <directory>
  [--page-id <id> | --page-number <number>] [--full]
unslide export <name> [--full]
unslide export --artifact <html> --output <pdf> [--full]
unslide inspect-pdf <name> [--page-number <number>]
unslide inspect-pdf --artifact <pdf> --output <directory>
  [--page-number <number>]
unslide review <name> [--page-id <id> | --page-number <number>]
  [--pdf] [--full]
unslide review --all [--pdf] [--full]
```

`<name>` uses lower-kebab case. Page numbers are positive, one-based integers.
Separate ID and number flags preserve numeric page IDs without ambiguity.

The following combinations are invalid:

- a configured report name together with `--artifact` or `--output`;
- `--artifact` without the required explicit `--output` for capture, export,
  or PDF inspection;
- `--output` in configured-report mode;
- both page selectors, a duplicate selector, a missing selector value, an
  unknown page ID, or an out-of-range page number;
- a page selector with `review --all`;
- a report name with `review --all`;
- `--pdf` outside `review`; or
- a starter selection outside `init` or `add`.

Unknown commands, flags, joined value flags, duplicate singleton flags, and
extra positional values are also usage errors. Recovery output shows a
complete valid invocation using the current executable and selected format.

## Project Discovery and Report State

With no command, Unslide discovers the nearest `unslide.json`, reports every
configured source and artifact path, and suggests actions from observed state.
`report <name>` returns the same resolved evidence for one report without
building, validating, capturing, exporting, or claiming dependency freshness.
A missing source is report state, not an invalid project: it blocks that
report's build or review but not discovery or artifact operations for another
report.

`report` and home expose absolute paths, existence, and an RFC 3339 UTC
last-modified time when the path exists. Directories and files are identified
by kind. Timestamps are observations only; they never establish that an
artifact is fresh relative to source or dependencies.

## Initialization and Addition

Omitting `--starter` selects `minimal`, preserving the existing starter.
`business-report` installs the package-owned multi-page teaching example. Both
`init` and `add` are dry runs unless `--yes` is present.

`init` plans a new project rooted at the current directory. It never overwrites
a symlink or file with different contents. If a later write fails, its result
identifies any exclusively created files that safely remain, preserving the
existing recovery contract.

`add` requires an existing valid project and an unconfigured name. Its plan
includes the report entry and every starter file, reports all conflicts before
writing, and leaves the project unchanged on conflict. With `--yes`, it stages
the complete change, atomically replaces `unslide.json`, and rolls back newly
created files if publication fails. It never rewrites package metadata or an
existing TypeScript configuration.

## Primitive and Artifact Workflows

Configured primitive commands resolve paths from `unslide.json`. `build`
publishes canonical HTML; `inspect`, `capture`, and `export` consume existing
HTML; `inspect-pdf` consumes an existing PDF. Primitive commands never rebuild
their upstream artifact.

Artifact forms resolve relative paths from the invocation's current directory
and accept absolute paths. They require no project. Before browser or file
work, Unslide resolves symlinks through the nearest existing ancestor and
rejects an input equal to, containing, or contained by its output. Export
requires an `.html` input and `.pdf` output; page-image outputs are directories.
The same readiness, validation, geometry, and publication guarantees apply in
configured and artifact modes.

Capture and PDF inspection validate the entire input before selection. A
focused run rasterizes only the chosen page and transactionally replaces the
managed `page-*.png` set with exactly that selected scope, removing managed
images from earlier complete runs while preserving unrelated files. This
prevents unselected stale images from appearing to belong to the current run.

## Review

A single-report review executes these steps in order:

1. build and atomically publish canonical HTML;
2. validate the complete HTML artifact;
3. capture all pages or only the selected page;
4. when `--pdf` is present, export and structurally validate the complete PDF;
5. when `--pdf` is present, inspect all PDF pages or the selected ordinal page;
6. publish the review manifest last.

Selecting an HTML page by ID determines its one-based ordinal before PDF
inspection. `--pdf` always means both PDF export and PDF-native inspection;
there is no mode that silently prints without producing inspection evidence.
Without `--pdf`, existing PDF and PDF-capture outputs are untouched and omitted
from the new manifest.

`review --all` reviews configured reports in lexical name order, with one
shared PDF choice. It does not accept page selection. Reports run independently
and the command continues after a report failure so CI receives one complete
result. Each successful report replaces its own manifest. Exit 1 means at
least one report failed; completed reports and their evidence remain valid.

Publication is step-atomic, not a transaction across the whole review. A later
failure preserves that step's previous output and the previous manifest, while
earlier successful steps from the failed review may already be published. The
failure result lists completed and published steps and reports the manifest as
unchanged. Artifact hashes in the previous manifest make any mismatch with
newer paths detectable.

Successful review proves that canonical HTML was rebuilt in that invocation
and that every recorded derived artifact came from that HTML. It does not infer
freshness from timestamps, inspect external references, score visual fidelity,
or judge content fit. Human or agent inspection of every recorded target-native
image remains required.
