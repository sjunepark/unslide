# React Authoring and Project Contract

This document defines the accepted authoring contract for the active
consumer-authoring plan. It preserves report ownership: every DOM, geometry,
style, print, numbering, and content-fit decision remains ordinary report
source.

This is a target contract, not the released configuration behavior. Goal 3
must change the schema, loader, and tests together before the examples below
are usable. Until then, the packaged schema still requires `html` and
`captures`, and the loader rejects the whole project when any configured source
is missing.

## Project Configuration

`unslide.json` version 1 remains the persisted configuration contract. Each
report keeps one required `source` path and may override any derived artifact
path:

```json
{
  "version": 1,
  "reports": {
    "quarterly-review": {
      "source": "quarterly-review.tsx"
    }
  }
}
```

For a newly minimal report `<name>`, omitted artifact fields resolve to:

| Field         | Default                    |
| ------------- | -------------------------- |
| `html`        | `artifacts/<name>.html`    |
| `pdf`         | `artifacts/<name>.pdf`     |
| `captures`    | `.tmp/captures/<name>`     |
| `pdfCaptures` | `.tmp/pdf-captures/<name>` |

The review manifest is normally derived from the resolved HTML path by
replacing its `.html` suffix with `.review.json`; it is not configurable
separately. If that candidate overlaps a version-1 source or artifact path,
append `-2`, then the next positive integer as needed, before `.json` and use
the first nonoverlapping candidate. For example, a collision at
`artifacts/report.review.json` selects `artifacts/report.review-2.json`.
Existing explicit fields remain authoritative. To preserve current version-1
behavior, an omitted `pdf` next to an explicit `html` replaces that HTML path's
`.html` suffix with `.pdf`, and an omitted `pdfCaptures` next to explicit
`captures` appends `-pdf` to that capture path. When their parent fields are
also omitted, the name-based defaults in the table apply. Loading never
rewrites or upgrades a configuration.

In the Goal 3 implementation, schema, lexical confinement, canonical symlink
confinement, source/output separation, and cross-report output separation will
be validated after defaults are applied. Visual fields remain invalid. Source
existence will be observed only after structural and path validation: a missing
source will be reported by home and `report`, fail build or review of that
report, and not block read-only discovery or artifact operations for other
reports.

## Source Export

`unslide/react` publishes these source types:

```ts
import type { ReactElement } from "react";

export type ReportComponent = () => ReactElement;
export type ReportSource = ReactElement | ReportComponent;
```

A report module's default export must be either a created React element or a
synchronous zero-prop function component. Unslide passes no props and
materializes a component with `React.createElement`; it never calls the
function directly. The result must render a complete `<html>` root.

Missing, primitive, promise, class, memo, lazy, and other object exports are
invalid. Async or suspending components are unsupported by the static renderer.
Source modules are trusted code and may use top-level await. Unslide evaluates
TSX and renders static markup but does not run the caller's TypeScript checker.

The existing default React re-export from `unslide/react` remains available
during 0.x compatibility. New code may use the automatic JSX runtime directly.
No Unslide-specific JSX runtime is introduced.

## React Dependency

React is a required consumer peer in the supported range `>=19.1.0 <20`.
Unslide's internal React DOM renderer resolves that same peer, so report source,
`react/jsx-runtime`, and `unslide/react` share one React instance. The package
does not install a second private React copy.

```sh
pnpm add unslide react
pnpm add -D typescript @types/node @types/react
```

Typed consumers choose their own compiler policy. The business starter uses
`jsx: react-jsx` and provides a report-local `tsconfig.json` so this check is
available without making it part of `unslide build`:

```sh
pnpm exec tsc --noEmit -p <report-name>/tsconfig.json
```

## Asset Helpers

```ts
readTextAsset(source: string | URL): Promise<string>
inlineAsset(source: string | URL): Promise<string>
```

Relative strings resolve from `process.cwd()` and absolute strings remain
absolute. URL objects must use the `file:` scheme. Source-relative URL objects
are preferred because they do not depend on the invocation directory:

```ts
const styles = await readTextAsset(new URL("./report.css", import.meta.url));
const font = await inlineAsset(new URL("./assets/report.ttf", import.meta.url));
```

`readTextAsset` decodes UTF-8 and has no extension allowlist. `inlineAsset`
does not sniff bytes or accept a caller-supplied media type. It maps these
case-insensitive extensions deterministically:

| Extensions      | Media type      |
| --------------- | --------------- |
| `.avif`         | `image/avif`    |
| `.gif`          | `image/gif`     |
| `.jpg`, `.jpeg` | `image/jpeg`    |
| `.png`          | `image/png`     |
| `.svg`          | `image/svg+xml` |
| `.webp`         | `image/webp`    |
| `.woff`         | `font/woff`     |
| `.woff2`        | `font/woff2`    |
| `.ttf`          | `font/ttf`      |
| `.otf`          | `font/otf`      |

Unsupported extensions and non-file URLs fail before reading. Font family,
weight, style, `@font-face`, subsetting, licensing, and use remain report-owned.

## Starters

`minimal` remains the default and preserves the existing single-page element
export. It uses a source-relative URL for its removable CSS.

`business-report` is a synthetic multi-page example. It creates:

- a thin `<name>.tsx` document entry;
- `<name>/report.tsx` for explicit sequence and a typed zero-prop component;
- `<name>/data.ts` for display-ready sample values;
- `<name>/pages.tsx` for report-local furniture, a page manifest, and one
  repeated page family;
- `<name>/styles.css` for screen and print ownership;
- `<name>/assets/README.md` for local font and image guidance; and
- `<name>/tsconfig.json` for the caller-owned type-check command.

The starter demonstrates deriving folios, totals, table-of-contents entries,
and cross-references from one editable report-local page manifest. These are
not Unslide runtime components. It includes no business calculation framework,
visual configuration, managed theme, pagination, or fit repair.

When initialization creates a new `.gitignore`, it includes `artifacts/` and
`.tmp/`. Neither `init` nor `add` overwrites an existing ignore file; results
warn when those conventional sensitive outputs do not appear to be ignored.
HTML, PDF, manifests, and captures inherit the report's sensitivity.

## Future Protocol Work

This plan normalizes React source exports, dependency ownership, asset inputs,
and author guidance only. It does not add another HTML parser or metadata
source. The queued static/interactive-mode plan owns standards-based HTML
parsing, execution-mode metadata, active-content policy, and consolidation of
the current standalone-resource scan.
