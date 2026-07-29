# Repository Workflow

This runbook owns repository setup, proof-report commands, generated outputs,
and validation. Public installation and CLI automation belong in
[README.md](../README.md).

## Setup

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
```

The supported environment is recorded in the
[Supported Delivery Contract](SUPPORT.md). Chromium is the canonical capture
and print engine; generated HTML requires no development runtime to open.

## Report Loop

The compact fixture lives in `src/spike/`; the richer trial lives in
`src/reports/operating-review/`. Their configured paths are canonical in
[`unslide.json`](../unslide.json).

| Task                 | Command                       | Output                                   |
| -------------------- | ----------------------------- | ---------------------------------------- |
| Build fixture HTML   | `pnpm run render:spike`       | `artifacts/spike/report.html`            |
| Capture fixture HTML | `pnpm run capture:spike`      | `.tmp/captures/spike/`                   |
| Export fixture PDF   | `pnpm run export:spike`       | `artifacts/spike/report.pdf`             |
| Inspect fixture PDF  | `pnpm run inspect-pdf:spike`  | `.tmp/pdf-captures/spike/`               |
| Build trial HTML     | `pnpm run render:report`      | `artifacts/operating-review/report.html` |
| Capture trial HTML   | `pnpm run capture:report`     | `.tmp/captures/operating-review/`        |
| Export trial PDF     | `pnpm run export:report`      | `artifacts/operating-review/report.pdf`  |
| Inspect trial PDF    | `pnpm run inspect-pdf:report` | `.tmp/pdf-captures/operating-review/`    |

Repository aliases call the same schema-validated CLI:

```sh
pnpm --silent run unslide build <name>
pnpm --silent run unslide inspect <name>
pnpm --silent run unslide capture <name>
pnpm --silent run unslide export <name>
pnpm --silent run unslide inspect-pdf <name>
pnpm --silent run unslide review <name>
pnpm --silent run unslide review <name> --pdf
```

Run `pnpm --silent run unslide` from the project root or a nested directory to
list the nearest project's reports. See the README
[automation contract](../README.md#cli-automation-contract) for structured
output, failures, flags, diagnostics, and portable recovery commands.

The authoring loop is:

1. Change typed data, document source, or report-owned CSS.
2. Build the HTML.
3. Capture and inspect every HTML page image.
4. Export the PDF when required.
5. Inspect every PDF-native page image.
6. Correct the same source and repeat.

`review` composes that lifecycle from fresh source and publishes a versioned
manifest last. Use `review <name> --page-id <id>` while iterating on one page,
`review <name>` for complete HTML evidence, and `review <name> --pdf` for final
HTML and PDF evidence. Primitive commands remain useful when testing a single
existing artifact deliberately.

The tooling validates the [page protocol](PROTOCOL.md) and static resources. It
does not measure or repair fit. PDF export waits for print-active static
resources and rejects page-count divergence, which can expose unintended print
fragmentation. Its PDF checks are structural, so successful export never
replaces inspection of every PDF-native page image.

## Artifact Ownership

- `artifacts/` contains generated standalone HTML and structurally validated
  PDF delivery files plus last-successful-review manifests.
- `.tmp/captures/` contains disposable Chromium screenshots of marked HTML
  pages.
- `.tmp/pdf-captures/` contains disposable images rasterized from the actual
  PDFs.
- `artifacts/` and `.tmp/` are ignored by Git and can be regenerated from
  report source.

Report data and conclusions remain in caller-owned typed source. Generated
files are evidence, not an authoring format.

## Validate

```sh
pnpm run format:check
pnpm run lint
pnpm run typecheck
pnpm run check
pnpm test
pnpm run validate
npm pack --dry-run
```

- `format:check` asks Oxfmt to verify every supported repository file without
  changing it; `format` applies the same formatting scope.
- `lint` runs Oxlint's correctness rules and React checks with no tolerated
  warnings.
- `typecheck` patches the Effect language service and runs `tsc --noEmit`.
- `check` composes the formatting, linting, and type-checking commands in the
  same order used by CI through `validate`.
- `test` exercises source-level and packaged behavioral contracts.
- `validate` additionally runs every configured HTML/PDF proof pipeline.
- `npm pack --dry-run` verifies the public package contents.

Validation does not make a visual judgment. After a report change, inspect
every generated HTML and PDF-native page image.

To verify unpublished package changes in a clean consumer, create a tarball and
install the path printed by pnpm:

```sh
pnpm pack --pack-destination .tmp/package
```

A linked consumer runs the package's compiled `dist`, not current TypeScript
source. After changing local package source, run `pnpm run build:package` before
executing through the link, or pack and install a fresh tarball as above.
Production commands do not attempt linked-build freshness detection.

The adoption tests automate this path. Architecture and publication behavior
belong in [ARCHITECTURE.md](../ARCHITECTURE.md); release operations belong in
[Release](RELEASE.md).
