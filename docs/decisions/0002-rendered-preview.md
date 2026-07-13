# D2 — Repository-Owned Rendered Preview

Date: 2026-07-13

Status: accepted for the first implementation

V2 clarification: the isolated browser path remains accepted behind packaged
tooling and the headless artifact protocol. PDF-native inspection is specified
separately by [D4](0004-html-first-pdf-export.md).

## Context

Neither people nor agents can reliably judge a visual report from source alone.
Font metrics, line wrapping, overflow, and visual balance exist only after a
rendering engine performs layout.

Requiring an agent to connect to a user's interactive Chrome session makes the
workflow dependent on external browser state and per-agent integration.

## Decision

The repository will provide a command that launches an isolated headless
browser and captures the actual generated report as images.

Playwright with Chromium is the initial implementation direction. It is
development tooling, not a runtime dependency of the generated HTML and not a
required dependency for report recipients.

The capture path should make individual page images easy for vision-capable
agents to inspect. It may also create a full-document image or PDF when useful,
but those outputs are secondary.

V1 does not add automated visual scoring, overflow linting, or baseline-image
regression machinery. The purpose is to let the author or agent see the real
result.

## Consequences

Benefits:

- Agents can render reports without access to personal browser sessions.
- Every author uses the same preview command and browser family.
- Page images are easy to inspect with ordinary vision tooling.
- The same path can later support browser-produced PDF if needed.

Costs:

- Development setup includes a browser automation dependency and browser
  binary.
- Preview output consumes temporary disk space.
- Chromium rendering does not guarantee pixel parity with every recipient's
  browser.

The browser dependency is accepted because it automates an unavoidable visual
rendering step.

## Revisit When

Revisit the adapter if a substantially simpler stable tool provides the same
isolated, cross-platform, scriptable rendering behavior, or if the supported
delivery renderer changes away from Chromium.
