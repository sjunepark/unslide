# D6 — Public npm Distribution

Date: 2026-07-14

Status: accepted

## Context

Unslide's CLI, React authoring entry, artifact protocol, package contents, and
clean-consumer path were exercised by contrasting reports and packed-consumer
tests. Keeping adoption limited to local tarballs would have withheld versioned
upgrades without adding useful product evidence.

The package is still pre-1.0. Its Node 24-only support range, Effect v4 beta
internals, and narrow validated environment make a 1.0 compatibility promise
premature.

## Decision

Publish the unscoped public npm package `unslide` under the MIT license.
Release Please owns normal version bumps, `CHANGELOG.md`, `v<version>` tags,
and GitHub Releases. A tag-triggered GitHub Actions workflow validates tagged
source and publishes only the npm package through npm trusted publishing.

While the version is below 1.0, normal features and fixes produce patch
releases. Commits marked with `!` or a `BREAKING CHANGE:` footer produce minor
releases. The current package and persisted protocol contracts remain narrow;
public distribution does not promote deferred adapters, recipes, pagination,
or mixed-geometry support.

`0.1.0` was bootstrapped manually because npm trusted publishing could be
attached only after the package existed. The reviewed publish commit was then
tagged `v0.1.0`; the configured `release.yml` trusted publisher and Release
Please own later releases.

## Consequences

- Consumers can install `unslide` from npm and receive explicit versions.
- Release changes are reviewed as ordinary pull requests and validated before
  tags or publication.
- The first publish required an authenticated one-time manual step; later
  publishes use short-lived OIDC credentials and provenance.
- Public 0.x releases communicate instability but still require explicit
  breaking-change classification and migration notes.

## Revisit When

Consider 1.0 only after independent consumers exercise installation, CLI
automation, authoring imports, configuration, and artifact protocol upgrades.
The first public publish fixed the unscoped package name.
