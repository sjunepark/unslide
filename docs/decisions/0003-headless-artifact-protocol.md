# D3 — Headless Artifact Protocol and Author-Owned Design

Date: 2026-07-13

Status: accepted for V2; artifact protocol v1 implemented

## Context

V1 proved explicit pages, standalone HTML, and isolated browser capture. Its
repository-local foundation also fixed A4 landscape geometry, content insets,
header and footer regions, numbering, CSS class names, and document styling.

Copying that foundation into other repositories would duplicate stable tooling
and visual policy together. Publishing it unchanged would make Unslide's
preferred chrome and geometry part of the caller interface. Neither path gives
adopters centralized behavior upgrades and complete design ownership.

## Decision

V2 separates stable behavior from visual source.

The canonical seam is a small HTML artifact protocol. A valid artifact is
standalone HTML whose explicit pages carry ordered unique nonvisual markers and
whose visual resources have a reliable readiness path.

Report source owns the complete document and all design decisions, including
DOM structure, elements, page geometry, margins, padding, fonts, assets,
repeated material, numbering, screen presentation, and print CSS. Runtime
modules do not inject a wrapper, CSS reset, foundation stylesheet, page frame,
chrome model, or visual tokens.

Stable compilation, serialization, validation, browser capture, and export
behavior belongs in versioned tooling. React remains the first authoring module
because V1 proved it, while the HTML protocol remains independent of React.

Project configuration describes operational paths and explicitly selected tool
behavior. It does not describe visual design.

One-time scaffolds and optional recipes may install editable visual source. They
are not required by the runtime. A managed source registry is deferred until
adoption evidence justifies its upgrade and conflict-management cost.

## Consequences

Benefits:

- Adopters can upgrade stable mechanics without copying implementation files.
- Reports can use unrelated DOM structures and visual systems.
- Headers, footers, chrome, numbering, and fixed design tokens are optional
  report concepts rather than framework concepts.
- Capture and export can serve generators other than React through the durable
  HTML seam.
- Optional recipes remain inspectable and fully editable source.

Costs:

- Reports must define their own page and print behavior or intentionally adopt a
  recipe.
- Validation must distinguish protocol failures from authoring mistakes without
  repairing either.
- Full document and asset ownership makes the first authoring module deeper than
  V1's string writer.
- Source recipe upgrades cannot be treated like normal package upgrades after a
  user edits installed files.

## Rejected Alternatives

- Keep copying the V1 foundation. This distributes maintenance and prevents
  centralized fixes.
- Publish the V1 page foundation unchanged. This makes one report design part of
  the public interface.
- Put design choices in project JSON. This creates a limited design language and
  pushes arbitrary CSS back through escape hatches.
- Build a generalized plugin system immediately. Only one source adapter and one
  browser implementation are proven.

## Revisit When

Revisit the public authoring seam after a second source generator proves a real
adapter need. Revisit managed recipes only after multiple adopters need to
install and update the same visual source.
