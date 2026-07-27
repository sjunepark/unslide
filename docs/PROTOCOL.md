# HTML Artifact Protocol v1

Protocol v1 is the nonvisual contract between an HTML report and Unslide's
browser tooling. It is independent of React and prescribes no page element,
geometry, or visual foundation.

## Version

New artifacts declare this metadata in the document head:

```html
<meta name="unslide-protocol" content="1">
```

Artifacts created before package version 0.1.0 may omit the metadata and are
treated as v1. An unknown, empty, or duplicate declaration fails with manual
migration guidance. Unslide does not rewrite report source.

## Pages

Every capturable page carries `data-unslide-page="<id>"`:

```html
<article data-unslide-page="summary">...</article>
<figure data-unslide-page="analysis">...</figure>
```

- The ID is nonempty and unique within the document.
- DOM order is page order.
- Any capturable HTML element may carry the marker.
- The marker adds no class, wrapper, styling, geometry, chrome, or numbering.

Validation returns each page's ID, zero-based document index, and lowercase tag
name. An artifact with no marked pages, an empty ID, or a duplicate ID is
invalid.

## Static Readiness

Browser loading and protocol validation use bounded waits for document load,
`document.fonts.ready`, and every HTML image to load and decode. Failures
identify the pending or failed resource and, when applicable, its marked page.
PDF export repeats readiness after applying print media and also waits for
tracked requests, so resources activated only for print are covered before
Chromium prints.

Document, font, image-load, and image-decode waits are bounded to five seconds
each. All tracked requests share one five-second window per readiness check.
Protocol v1 supports static visual resources. It does not stabilize animations
or delayed client rendering and has no author-controlled asynchronous readiness
signal; those capabilities remain deferred until real inputs establish their
contracts.

Readiness validation does not inspect CSS, measure overflow, repair content, or
apply visual defaults. It also does not enforce the first-party React writer's
separate standalone-resource rules.

## Public Surface

The public contract is this HTML shape. Validation, browser loading, and
capture remain packaged CLI internals; there is no public Playwright or
validator API.
