# Supported Delivery Contract

This matrix records the verified 0.1.0 behavior. It is intentionally narrower
than what the underlying browser and libraries may happen to support.

## Canonical Environment

| Component | Verified version |
|---|---|
| Host | macOS 26.5.1 arm64 |
| Node.js | 24.15.0 |
| pnpm | 11.12.0 |
| Playwright | 1.61.1 |
| Managed Chromium | Chrome for Testing 149.0.7827.55 |
| PDF parser/rasterizer | PDF.js 6.1.200 |
| Node canvas | `@napi-rs/canvas` 1.0.2 |

The package accepts Node.js 24.15 or newer within the Node 24 release line; the
table records the exact environment used for complete validation. Other
operating systems, architectures, Node major versions, package managers,
browsers, PDF engines, and rasterizers are not currently claimed.

## Supported Behavior

| Area | Contract |
|---|---|
| Authoring | Complete report-owned React/TSX documents producing standalone HTML |
| Artifact | Protocol v1 ordered unique page markers and static resource readiness |
| HTML inspection | One screen-media Chromium PNG per marked page |
| PDF export | Chromium print media, authored common geometry, backgrounds, no browser header/footer |
| PDF validation | Readable nonempty file, marker/page-count parity, authored/common geometry, extractable text |
| PDF inspection | One ordered 96-DPI PNG per actual PDF page, using no HTML or browser state |
| Content exercised | Local WOFF2, raster and SVG images, inline SVG, links, Korean and English text, authored print colors |
| Semantics exercised | Document title and language, heading outline, marked structure tree, link annotation |
| Publication | HTML/PDF publish atomically; managed page-image sets restore prior output on failure when possible and retain recovery staging after incomplete rollback |

HTML remains canonical. One marked HTML page must produce one PDF page, and all
pages in a supported PDF use one common geometry. Project configuration selects
only source and output locations; report source owns every visual choice.

Repeated packed-consumer runs preserve the validated page structure and exact
PDF-native PNG hashes in the canonical environment. Chromium writes creation
and modification timestamps into PDFs, so PDF file bytes are not promised to be
identical across runs.

## Accessibility and Best-Effort Semantics

Export requests tagged output and an outline. The verified PDFs expose a marked
structure tree, heading role, document language/title, searchable text, and
link annotations. These checks are useful delivery evidence, not PDF/UA or WCAG
conformance testing.

Authors remain responsible for meaningful HTML structure, reading order, alt
text, link purpose, language changes, contrast, and font coverage. Chromium
decides the final PDF tag tree and outline text; exact tag mapping, assistive
technology behavior, and outline whitespace are best effort. System-font
fallback and color reproduction outside the canonical environment are also not
guaranteed; inline local assets when delivery must not depend on the host.

## Not Supported

- mixed page geometry or orientation within one PDF;
- PDF/A or other archival conformance;
- encryption or permission controls;
- digital signatures;
- attachments, AcroForms, or XFA;
- alternate print engines or rasterizers; and
- formal accessibility certification.

Each requires separate evidence and an explicit scope decision.
