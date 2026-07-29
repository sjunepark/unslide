# Supported Delivery Contract

This document records the verified delivery boundary. It is narrower than what
the underlying libraries may happen to support. `package.json` and the lockfile
remain authoritative for dependency pins.

## Reference Environment

| Component             | Verified release environment     |
| --------------------- | -------------------------------- |
| Host                  | macOS 26 on arm64                |
| Node.js               | 24.15.0                          |
| pnpm                  | 11.12.0                          |
| Playwright            | 1.61.1                           |
| Managed Chromium      | Chrome for Testing 149.0.7827.55 |
| PDF parser/rasterizer | PDF.js 6.1.200                   |
| Node canvas           | `@napi-rs/canvas` 1.0.2          |

The package accepts Node.js 24.15 or newer within the Node 24 release line.
Other operating systems, architectures, Node major versions, package managers,
browsers, PDF engines, and rasterizers are not currently claimed.

Install the package-matched browser before capture or export:

```sh
pnpm dlx playwright@1.61.1 install chromium
```

## Supported Behavior

| Area                | Contract                                                                                                                                       |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Authoring           | Complete report-owned React 19/TSX elements or synchronous zero-prop components producing standalone HTML                                      |
| Artifact            | Protocol v1 ordered unique page markers and static resource readiness                                                                          |
| HTML capture        | One screen-media Chromium PNG per marked page                                                                                                  |
| PDF export          | Chromium print media, bounded readiness for print-active static resources, authored common geometry, backgrounds, and no browser header/footer |
| PDF validation      | Structural checks for a readable nonempty file, marker/page-count parity, authored/common geometry, and extractable text                       |
| PDF inspection      | One ordered 96-DPI PNG per actual PDF page, using no HTML or browser state                                                                     |
| Content exercised   | Source-relative assets; local WOFF2, TTF, OTF, raster and SVG images; inline SVG; links; Korean and English text; authored print color         |
| Semantics exercised | Document title and language, heading outline, marked structure tree, and link annotation                                                       |
| Workflows           | Configured primitives, focused or complete review, all-report review, and standalone HTML capture/export                                       |
| Evidence            | Versioned TOON/JSON results, direct artifact paths and hashes, and transactional last-successful-review manifests                              |
| Publication         | Atomic HTML/PDF/manifest replacement and recoverable managed page-image replacement                                                            |

HTML remains canonical. One marked HTML page produces one PDF page, and all
pages in a supported PDF share one geometry. Project configuration selects
source and output paths; report source owns every visual choice.

Successful PDF validation does not establish visual equivalence with HTML. It
does not detect lost fills, changed colors, clipped visuals, or shifted layout;
inspect every PDF-native page image before delivery. Exact print-color
adjustment is report-owned CSS, and exact reproduction across environments or
arbitrary color spaces is not guaranteed.

Within the reference environment, validation requires stable page structure
and PDF-native PNG output across repeated packed-consumer runs. Chromium embeds
creation and modification timestamps in PDFs, so exact PDF bytes are not a
repeatability contract.

## Accessibility and Best-Effort Semantics

Export requests tagged output and an outline. Verified PDFs expose a marked
structure tree, heading role, document language/title, searchable text, and
link annotations. These checks are delivery evidence, not PDF/UA or WCAG
conformance testing.

Authors remain responsible for meaningful HTML structure, reading order, alt
text, link purpose, language changes, contrast, and font coverage. Chromium
decides the final PDF tag tree and outline text; exact tag mapping, assistive
technology behavior, and outline whitespace are best effort. System-font
fallback and color reproduction outside the reference environment are not
guaranteed; inline local assets when delivery must not depend on the host.

## Not Supported

- mixed page geometry or orientation within one PDF;
- PDF/A or other archival conformance;
- encryption or permission controls;
- digital signatures;
- attachments, AcroForms, or XFA;
- animations, delayed client rendering, or an author-controlled asynchronous
  readiness signal;
- alternate print engines or rasterizers; or
- formal accessibility certification.

Each requires separate evidence and an explicit scope decision.

The packed-consumer proof exercises the business starter's type check, build,
focused and complete review, primitive lifecycle, manifest evidence, and public
documentation from an installed tarball. The independent impairment-report
consumer exercises the same review composition without moving its protected
reference discovery, comparison, or acceptance policy into Unslide.
