# D7 — Consumer Authoring and Automation Contracts

Date: 2026-07-29

Status: accepted

## Context

The existing primitives safely build, validate, capture, export, and inspect
fixed-page reports, but consumers must coordinate freshness and reconstruct
evidence themselves. CLI outputs are unversioned and inconsistent about page
indexes and paths. Configuration repeats conventional artifact paths, one
missing source blocks unrelated reports, and React authoring supports only an
already-created element with a package-private React installation.

The adjacent impairment report proves that these gaps create real consumer
orchestration without justifying a visual framework, new adapter, or broader
artifact protocol.

## Decision

Adopt the target contracts in [CLI Command Contract](../COMMANDS.md),
[CLI Result and Review Manifest Contract](../RESULTS.md), and
[React Authoring and Project Contract](../AUTHORING.md).

The main choices are:

- keep every primitive and add `review` as lifecycle composition, with
  explicit PDF work and unambiguous page-ID or one-based-number focus;
- keep HTML as the durable seam and add symmetric standalone capture and export
  without requiring a project;
- expose one versioned semantic result envelope through newline-terminated TOON
  or compact JSON;
- use stable IDs and one-based page numbers publicly and remove the ambiguous
  public `index` field in the next pre-1.0 feature release;
- return resolved absolute paths and exact byte/hash evidence rather than
  making callers combine directories and basenames;
- publish one last-successful-review manifest per report, bound to canonical
  HTML and optional PDF hashes, after every requested step succeeds;
- keep review steps independently transactional and report partial publication
  on failure instead of claiming an impractical multi-artifact transaction;
- derive conventional artifact paths while preserving explicit version-1
  overrides and their dependent PDF defaults without rewriting configuration;
- treat source absence as per-report state rather than project invalidity;
- add dry-run-first, rollback-safe report addition without absorbing package or
  compiler configuration;
- accept created elements or synchronous zero-prop function components and use
  consumer-owned React as one shared peer instance; and
- extend path helpers to file URLs and common font types while leaving every
  visual asset decision in report source.

The review manifest is evidence for the exact successful invocation, not a
freshness oracle or visual verdict. Focused review replaces managed page images
with only the selected scope so stale pages cannot masquerade as current
evidence. An all-reports review continues in lexical order and exits 1 if any
report fails, while retaining successful per-report manifests.

## Compatibility

Configuration version 1 and artifact protocol v1 remain unchanged. Existing
explicit configuration paths and element exports keep working. TOON stays the
default. The result-envelope and page-identity correction are an intentional
pre-1.0 public change and require a feature release with migration notes;
linked consumer evidence changes in the same implementation slice.

React moves from a private package copy to a required consumer peer in the
supported React 19 range. Packed-consumer validation must prove one React
instance, automatic JSX runtime use, caller type checking, both source-export
forms, and the asset contract before this is released.

## Consequences

Authors gain one trustworthy focused or complete review path, while primitive
commands remain independently composable. Automation can choose JSON without a
TOON dependency and consume direct paths and hashes without parsing project
configuration.

The CLI needs a typed parse/result boundary before adding more orchestration.
Review failure reporting must distinguish completed publication from an
unchanged manifest. Direct absolute paths and debug logs are sensitive output.
Selected capture requires full validation before limited rasterization, and
standalone selected PDF inspection must validate all pages before rendering
the selection.

No gallery, visual scoring, fit repair, reference comparison, design system,
or plugin surface follows from this decision.

## Deferred Dependency

The static/interactive-mode plan remains authoritative for standards-based HTML
parsing, protocol execution metadata, and pre-publication static policy. This
work must reuse that later contract rather than introduce a competing parser or
metadata source.
