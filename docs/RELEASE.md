# Release

Unslide publishes the public npm package `unslide`. Release Please owns normal
version bumps, `CHANGELOG.md`, `v<version>` source tags, and GitHub Releases.
The tag-triggered release workflow validates tagged source and publishes npm.

## One-time setup (completed)

The reviewed `0.1.0` package was bootstrapped from its matching `v0.1.0` tag
because npm requires a package to exist before trusted publishing can be
attached. This command sequence is historical evidence; do not rerun it:

```sh
pnpm run validate
npm pack --dry-run
npm login
npm publish --access public
git tag v0.1.0
git push origin v0.1.0
```

The publish and tag came from the same commit on `main`. The npm trusted
publisher is configured as:

- Publisher: GitHub Actions
- Organization or user: `sjunepark`
- Repository: `unslide`
- Workflow filename: `release.yml`
- Allowed action: `npm publish`

`RELEASE_PLEASE_TOKEN` is configured in the GitHub repository with a
repository-scoped fine-grained PAT. It has Contents, Pull requests, and Issues
read/write access so generated tags trigger `release.yml`. Its source value is
kept in the maintainer's 1Password vault; do not create unmanaged duplicates.

`main` requires pull requests and `CI / Validate package and proof reports`
before merging. npm publishing access disallows ordinary tokens. The release
workflow uses npm OIDC trusted publishing and needs no npm token after
bootstrap.

## Automated flow

Before 1.0, normal `feat:` and `fix:` commits produce patch releases; `!` or a
`BREAKING CHANGE:` footer produces a minor release.

1. Land Conventional Commits on `main` through a CI-validated pull request.
2. Release Please opens or updates the release PR and generated changelog.
3. Review its version, public-contract classification, migration notes, and CI.
4. Merge the confirmed release PR.
5. Release Please creates the matching tag and GitHub Release.
6. `release.yml` revalidates tagged source and publishes npm with provenance.

The release workflow rejects a tag that does not exactly match `package.json`
and skips publication when that package version already exists. Retry an
existing tag with the workflow's `tag` input; do not move a published tag.
