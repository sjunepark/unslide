# Release

Unslide publishes the public npm package `unslide`. Release Please owns normal
version bumps, `CHANGELOG.md`, `v<version>` source tags, and GitHub Releases.
The tag-triggered release workflow validates tagged source and publishes npm.

## One-time setup

The `unslide` name was unclaimed when public distribution was accepted. npm
requires a package to exist before trusted publishing can be attached, so
bootstrap the reviewed `0.1.0` package and its matching tag manually:

```sh
pnpm run validate
npm pack --dry-run
npm login
npm publish --access public
git tag v0.1.0
git push origin v0.1.0
```

Perform the publish and tag only from the same commit on `main`. After the
package exists, configure its npm trusted publisher:

- Publisher: GitHub Actions
- Organization or user: `sjunepark`
- Repository: `unslide`
- Workflow filename: `release.yml`
- Allowed action: `npm publish`

Configure `RELEASE_PLEASE_TOKEN` in the GitHub repository. Use a fine-grained
PAT or GitHub App token, rather than the default `GITHUB_TOKEN`, so generated
tags trigger `release.yml`. Grant Contents, Pull requests, and Issues
read/write access.

Protect `main` and require `CI / Validate package and proof reports` before
merging. The release workflow uses npm OIDC trusted publishing; it does not
require a long-lived npm token after bootstrap.

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
