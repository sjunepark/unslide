# Authoring a Report

This guide follows the packaged `business-report` starter from an empty
project to inspected HTML and PDF delivery. The starter is editable report
source, not a required visual framework: keep the parts that fit the report and
replace the rest.

## 1. Create the project

Install Unslide and its consumer-owned React peers, then install the
package-matched Chromium build:

```sh
pnpm pkg set type=module
pnpm add unslide react react-dom
pnpm add -D typescript @types/node @types/react
pnpm dlx playwright@1.61.1 install chromium
```

Preview the files first, then create them:

```sh
pnpm exec unslide init --name quarterly-review --starter business-report
pnpm exec unslide init --name quarterly-review --starter business-report --yes
pnpm exec tsc --noEmit -p quarterly-review/tsconfig.json
```

Unslide evaluates TSX and renders it to static markup. It does not run the
consumer's TypeScript checker, so keep the `tsc` command in the project's
normal checks.

## 2. Know what owns what

The generated project separates the document entry from report-local source:

```text
quarterly-review.tsx          thin configured entry
quarterly-review/
  report.tsx                 complete HTML document and explicit sequence
  data.ts                    typed, display-ready values
  pages.tsx                  page manifest, furniture, and page families
  styles.css                 screen and print design
  assets/README.md           local asset guidance
  tsconfig.json              consumer-owned source check
```

`unslide.json` owns only operational paths. Report source owns the DOM, page
order, geometry, typography, assets, numbering, print rules, and content fit.
Business calculations and provenance should remain in caller code; pass
display-ready values into the report.

Every page is an ordinary element with a stable marker:

```tsx
<main data-unslide-page="operating-summary">...</main>
```

Marker IDs must be nonempty and unique. DOM order is report order.

## 3. Grow the report from one page manifest

The starter's `pageManifest` is report-local source. Use it to keep identity,
folios, table-of-contents entries, and cross-references aligned:

```ts
export const pageManifest = [
  { id: "cover", title: "Quarterly review", kind: "cover" },
  { id: "contents", title: "Contents", kind: "contents" },
  { id: "regions", title: "Regional performance", kind: "region" },
] as const;

export function pageNumber(id: (typeof pageManifest)[number]["id"]): number {
  return pageManifest.findIndex((page) => page.id === id) + 1;
}
```

Render the manifest in order. A report-local frame can derive a displayed
folio from the map index and total from `pageManifest.length`; a contents page
can use the same entries and `pageNumber`. Unslide observes the resulting page
IDs and one-based order but does not provide a page, folio, or TOC component.

When several pages share a real structure, model that family with a typed
specification rather than duplicating markup or building a universal page
schema:

```ts
type RegionPage = {
  id: `region-${string}`;
  title: string;
  revenue: string;
  commentary: readonly string[];
};

const regions: readonly RegionPage[] = [
  {
    id: "region-north",
    title: "North region",
    revenue: "$8.4M",
    commentary: ["Renewals remained strong", "Delivery capacity increased"],
  },
];
```

Keep bespoke pages explicit. Introduce an abstraction only when multiple pages
actually share structure and variation.

## 4. Add fonts and images

Prefer source-relative `file:` URLs so builds do not depend on the invocation
directory:

```tsx
import { inlineAsset, readTextAsset } from "unslide/react";

const [styles, logo, font] = await Promise.all([
  readTextAsset(new URL("./styles.css", import.meta.url)),
  inlineAsset(new URL("./assets/logo.svg", import.meta.url)),
  inlineAsset(new URL("./assets/report.woff2", import.meta.url)),
]);
```

`readTextAsset` reads UTF-8 text. `inlineAsset` accepts AVIF, GIF, JPEG, PNG,
SVG, WebP, WOFF, WOFF2, TTF, and OTF by extension. It returns a data URL; the
report still owns `@font-face`, weights, fallback stacks, font licensing, image
semantics, and any subsetting.

The built HTML must remain standalone. Unslide rejects recognized unresolved
local or network resource dependencies in the first-party React output.

## 5. Own screen and print layout

Give each page explicit screen geometry and define one concrete, unqualified
base `@page` size for PDF export:

```css
@page {
  size: 10in 5.625in;
  margin: 0;
}

[data-unslide-page] {
  box-sizing: border-box;
  width: 960px;
  height: 540px;
  overflow: hidden;
}

@media print {
  [data-unslide-page] {
    break-after: page;
  }

  [data-unslide-page]:last-child {
    break-after: auto;
  }
}
```

Screen and print may differ intentionally, so inspect both. One marked HTML
page must print as one PDF page, and a supported PDF uses one report-wide
geometry.

## 6. Debug fit in source

Unslide does not paginate, redistribute, shrink, truncate, or score content.
For a crowded page, temporarily add report-local diagnostics such as:

```css
[data-unslide-page="regions"] * {
  outline: 1px solid rgb(220 40 40 / 35%);
}
```

Then review only that stable page while editing:

```sh
pnpm exec unslide review quarterly-review --page-id regions
```

Inspect the returned HTML capture at full resolution. Correct the source by
editing copy, type, spacing, geometry, or the explicit page sequence. Remove
the diagnostic CSS before delivery. PDF page-count validation can expose print
fragmentation, but only the PDF-native image reveals the printed layout.

## 7. Review and deliver

A focused review rebuilds and validates the whole HTML artifact but rasterizes
only the selected page:

```sh
pnpm exec unslide review quarterly-review --page-id regions
```

Before HTML delivery, review every page:

```sh
pnpm exec unslide review quarterly-review
```

When PDF is required, rebuild and inspect both targets in one composition:

```sh
pnpm exec unslide review quarterly-review --pdf
```

The successful result and `artifacts/quarterly-review.review.json` contain
direct paths, hashes, dimensions, selected scope, and step evidence. They prove
what the invocation produced; they do not make a visual judgment. Open every
recorded HTML capture and every PDF-native capture before delivery.

Primitive commands remain useful when the caller intentionally manages
freshness, and standalone artifact commands support already-built HTML without
`unslide.json`. See the [CLI workflow reference](CLI.md).

## 8. Add another report safely

Plan all changes before extending a project:

```sh
pnpm exec unslide add annual-plan --starter business-report
pnpm exec unslide add annual-plan --starter business-report --yes
pnpm exec tsc --noEmit -p annual-plan/tsconfig.json
```

`add` reports every conflict before writing and rolls back a failed confirmed
publication. Share caller data or genuinely repeated local modules through
ordinary imports; keep each report's entry, sequence, and delivery choices
explicit.

## 9. Treat outputs as sensitive

HTML, PDF, review manifests, captures, absolute paths, authored diagnostics,
and debug logs inherit the report's sensitivity. The starter uses conventional
`artifacts/` and `.tmp/` paths and creates these ignore rules only when it can
do so without overwriting an existing file:

```gitignore
artifacts/
.tmp/
```

Confirm the repository's real ignore policy when an existing `.gitignore` is
preserved. Share delivery artifacts and logs only through controls appropriate
for the underlying report data.
