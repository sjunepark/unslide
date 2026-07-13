# HTML Artifact Protocol v1

Protocol v1 is the nonvisual contract between a standalone HTML report and
Unslide's browser tooling. It does not depend on React or the V1 page
foundation.

## Page contract

Every capturable page has a `data-unslide-page="<id>"` attribute.

- The ID must be nonempty and unique within the document.
- DOM order is page order.
- Any capturable HTML element may carry the marker.
- The marker requires no class, wrapper, page geometry, styling, chrome, or
  numbering.

For example:

```html
<article data-unslide-page="summary">...</article>
<figure data-unslide-page="analysis">...</figure>
```

The validator returns each page's ID, zero-based document index, and lowercase
tag name. It reports an artifact with no marked pages, an empty ID, or a
duplicate ID as invalid.

## Static visual readiness

A protocol consumer bounds DOM parsing, then the shared validator bounds full
document load, waits for `document.fonts.ready`, and waits for every HTML image
to finish loading and decode successfully. A failure identifies pending or
failed browser resources and the marked page when an image is inside one.

Document, font, image-loading, and image-decode waits are bounded to five
seconds each so a stalled resource produces an explicit diagnostic instead of
hanging capture. A resource that blocks DOM parsing is reported by the shared
browser loader with its URL.

Protocol v1 has no author-controlled asynchronous readiness signal. The
current fixtures need only static fonts, images, and markup; an additional
signal remains out of scope until a real asynchronous visual demonstrates its
contract.

Readiness validation does not inspect CSS, measure overflow, repair content, or
apply visual defaults. The report remains responsible for all layout and
design.

## Current implementation

- [`src/unslide/protocol.ts`](../src/unslide/protocol.ts) defines protocol
  metadata, validation, readiness, and diagnostics.
- [`src/unslide/browser.ts`](../src/unslide/browser.ts) owns canonical browser
  loading, readiness, and browser/resource diagnostics.
- [`src/unslide/capture.ts`](../src/unslide/capture.ts) captures marked elements
  at their authored bounds and returns structured deterministic results.
- [`tests/fixtures/protocol-valid.html`](../tests/fixtures/protocol-valid.html)
  proves the contract with unrelated semantic elements, non-A4 geometry, no
  V1 foundation, and no repeated chrome.

The former `data-page` marker was removed rather than retained as a second
contract.
