# Research — Authoring Without Mandatory React

Status: deferred research. React remains the supported authoring module.

This note preserves the alternatives and evaluation criteria for a future
decision. It does not change current scope, the public interface, or the
evidence gate in [PLAN.md](../../PLAN.md).

## Question

Should report authors be required to use React/TSX, or should Unslide offer a
framework-neutral or dependency-free authoring experience?

There are two distinct concerns:

1. **User-facing coupling:** authors must understand JSX conventions and see
   React in their source and types.
2. **Installed coupling:** installing Unslide also installs React and React DOM.

A design can remove the first concern while retaining React internally. Removing
both requires a different renderer or a less structured authoring format.

## Current Decision

Keep the current React writer for now.

It provides typed TSX, function components, automatic escaping, natural list
and conditional composition, mature HTML/SVG serialization, and static server
rendering. Authors need only the static subset of React; reports do not use
hooks, client state, hydration, or a browser-side React runtime.

The delivered artifact remains standalone HTML. Validation, capture, PDF
export, and PDF inspection consume the HTML protocol and remain independent of
React. This separation is accepted in
[D3](../decisions/0003-headless-artifact-protocol.md).

## User-Experience Baseline

Any replacement should be compared with the tasks authors perform, not only
with dependency count or renderer implementation size.

| Experience | Current React/TSX | Plain HTML string |
|---|---|---|
| Initial syntax | JSX in a `.tsx` module | Template literals in a `.ts` module |
| Reusable structure | Typed function components | Functions returning strings |
| Lists and conditions | Native expressions and arrays | Interpolation, branching, and explicit joining |
| Dynamic-value safety | Escaped by default | Requires disciplined escaping |
| Refactoring | Typed props and child values | Mostly string-level checking |
| Invalid markup feedback | Type and renderer diagnostics | Often deferred to parsing or browser validation |
| Framework knowledge | Basic React and JSX conventions | HTML and string-template conventions |
| Delivered HTML/PDF | Standalone and static | Can be identical |
| CLI workflow | Existing commands | Can remain identical after build |

Plain strings lower the onboarding requirement for a simple report but become
less ergonomic and less safe as reports add repeated pages, conditional
sections, tables, charts, and arbitrary data.

## Options

### 1. Keep React as the public authoring module

This retains the strongest proven experience and the smallest implementation
risk. The cost is that React remains visible in report source, public types,
and the installed dependency graph.

### 2. Put an Unslide JSX interface in front of React

Configure report source with `jsxImportSource: "unslide"` and expose Unslide
node types and JSX runtime entries. Authors would continue writing TSX without
importing or typing against React. React could initially remain an internal
serialization implementation.

This makes the authoring interface framework-neutral from the user's
perspective and preserves current ergonomics. It does not remove React from
the installed dependency graph, and React serialization behavior could still
become an implicit compatibility constraint.

### 3. Accept complete HTML strings from source modules

Move the authoring seam to the artifact Unslide actually consumes: a source
module exports complete HTML, and Unslide validates and publishes it. Authors
could use plain TypeScript, React, Svelte server rendering, a template engine,
or another local generator without a generalized plugin system.

This is the smallest stable interface and removes React from the core. Raw
strings, however, are a user-experience regression for composition, escaping,
typing, and diagnostics. Supporting arbitrary source compilers may also move
setup and build complexity into each consumer repository.

Do not support a `ReactElement | string` union in the core as a long-term
solution: it retains React coupling while making the authoring contract
broader.

### 4. Build an Unslide-owned static JSX renderer

An Unslide JSX runtime could preserve function components, fragments, arrays,
conditionals, typed props, and automatic escaping without React.

This provides the closest dependency-free replacement experience, but Unslide
would permanently own HTML and SVG attribute semantics, void elements, text
and attribute escaping, raw-text elements such as `style` and `script`, error
diagnostics, TypeScript JSX declarations, and compatibility behavior. It should
not be accepted merely because a small proof can render basic markup.

### 5. Use Svelte or another framework renderer

Svelte can compile components for server rendering and produce static head and
body markup without client hydration. Its component syntax may feel more
HTML-oriented than React.

As the default, this substitutes a Svelte compiler and server-rendering
dependency for React rather than achieving framework neutrality. Vue, Preact,
and similar choices have the same structural problem. They remain reasonable
caller-owned generators if the core accepts complete HTML.

### 6. Use Web Components

Web Components primarily define elements that upgrade in a browser. Using them
as the authoring model would either ship JavaScript in every report or require
a browser build step that serializes the upgraded DOM. Custom-element timing,
Shadow DOM styling, page discovery, static readiness, printing, and no-script
behavior would become part of the artifact contract.

This moves authoring behavior into a browser runtime or another rendering path
without improving fixed-report composition, so it is a poor default for
Unslide's static artifact workflow.

### 7. Use htmx

htmx adds browser behavior through attributes and HTML requests. It is not a
source templating or static-rendering system. Its main value is interaction
with endpoints, while Unslide deliberately produces offline, noninteractive
reports. It does not address the authoring problem.

### 8. Provide an Unslide HTML template helper

A tagged template could flatten arrays and escape interpolated values while
remaining framework-free. It would be lighter than a JSX runtime but weaker in
typing and tooling. Context-sensitive handling for attributes, URLs, CSS,
scripts, and trusted raw fragments makes a safe helper more substantial than a
simple string tag.

This option must be judged as a new template language owned by Unslide, not as
free convenience.

## Preferred Direction If Evidence Requires Change

Keep complete HTML as the durable artifact seam. Do not replace React with a
different mandatory application framework solely to change dependencies.

Choose the next step according to the demonstrated problem:

- If users object to React concepts but value TSX, prototype an Unslide JSX
  interface backed by the existing renderer.
- If users need to bring real non-React generators, prove one generator against
  the HTML protocol before defining an adapter seam.
- If users require no installed framework while retaining JSX ergonomics,
  evaluate an Unslide-owned static renderer against the full compatibility and
  maintenance cost.
- If a simple HTML-string workflow proves sufficient for real reports, prefer
  it over inventing another authoring abstraction.

## Evidence Required to Revisit

Revisit only when at least one of these produces concrete evidence:

- Independent consumers reject or work around React authoring.
- A real second generator produces a complete protocol-compliant report.
- React creates a measured installation, security, compatibility, or tooling
  problem rather than a theoretical concern.
- A dependency-free prototype preserves the authoring quality of a substantial
  report.

The current [PLAN.md](../../PLAN.md) gate for additional source adapters still
applies. A future implementation requires an explicit scope decision.

## Prototype Evaluation

Use a substantial proof report rather than a toy document. Compare the current
writer and candidate while performing the same work:

1. Scaffold and build the first page.
2. Extract reusable page structure and typed inputs.
3. Render lists, conditional sections, tables, inline SVG, CSS, and local
   assets.
4. Pass dynamic text containing HTML-sensitive characters.
5. Introduce malformed markup, an invalid attribute, and a bad child value;
   compare when and how each failure is reported.
6. Run the report's build, capture, export, and PDF-inspection workflow and
   inspect every produced page.
7. Compare source readability, diff quality, agent edit reliability, setup
   burden, generated artifact quality, and implementation ownership.

If the evidence supports a change, record the accepted interface and migration
policy in a new decision record, then update `PRODUCT.md`, `docs/DESIGN.md`,
`ARCHITECTURE.md`, `PLAN.md`, and the support contract as applicable.
