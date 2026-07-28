# Release

Unslide publishes only the public npm package `unslide`. Release Please owns
normal version bumps, `CHANGELOG.md`, `v<version>` source tags, and GitHub
Releases. The tag-triggered `release.yml` workflow validates tagged source and
publishes npm through OIDC trusted publishing.

## Bootstrap State

`0.1.0` was manually published from the reviewed commit later tagged
`v0.1.0`; the one-time bootstrap is complete and must not be repeated.

`0.1.1` proved the normal Release Please pull request, matching source tag and
GitHub Release, tagged-source validation, and trusted npm publication with
provenance.

The automated path depends on:

- the npm trusted publisher for `sjunepark/unslide` and
  `.github/workflows/release.yml`;
- the GitHub `RELEASE_PLEASE_TOKEN` secret used by
  `release-please.yml`; and
- pull-request and validation protection on `main`.

The credential's source value belongs in the maintainer's credential vault, not
in repository files or an unmanaged project-local copy. npm publication uses
short-lived OIDC credentials and no long-lived npm token.

The fine-grained GitHub token must select `sjunepark/unslide` and grant
read-write access to contents, issues, pull requests, and workflows. Workflow
access is required because a generated release pull request can contain
workflow changes.

## Versioning

Before 1.0:

- ordinary `feat:` and `fix:` commits produce patch releases; and
- `!` or a `BREAKING CHANGE:` footer produces a minor release.

Breaking public-contract changes require migration notes.

## Automated Flow

1. Land Conventional Commits on `main` through a validated pull request.
2. Release Please opens or updates the release pull request.
3. Review its version, changelog, breaking-change classification, migration
   notes, and CI.
4. Merge the confirmed release pull request.
5. Release Please creates the matching tag and GitHub Release.
6. `release.yml` revalidates the tagged source and publishes npm with
   provenance.

## Safety and Retry

The publish workflow rejects any tag that does not equal
`v<package.json version>` or does not identify the checked-out commit. It
skips publication when the version already exists.

Retry an existing immutable tag with the workflow's `tag` input. Never move a
published tag or publish a version from a differently tagged commit.
