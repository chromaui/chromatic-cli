# Chromatic CLI

Publishes your Storybook to Chromatic and kicks off tests if they're enabled.

<img width="100%" src="https://user-images.githubusercontent.com/321738/82901859-d820ec80-9f5e-11ea-81e7-78d494c103ad.gif" alt="">

<a href="https://www.npmjs.com/package/chromatic">
  <img src="https://badgen.net/npm/v/chromatic" alt="Published on npm">
</a>
<a href="https://www.chromatic.com/builds?appId=5d67dc0374b2e300209c41e7">
  <img src="https://badgen.net/badge/tested%20with/chromatic/fc521f" alt="Tested with Chromatic">
</a>

## Documentation

👉 Read the [Chromatic CLI docs](https://www.chromatic.com/docs/cli)

📝 View the [Changelog](https://github.com/chromaui/chromatic-cli/blob/main/CHANGELOG.md)

## System requirements

The Chromatic CLI (and GitHub Action) is built to run in a variety of environments. We provide support for the following platforms:

- Latest (LTS) versions of Ubuntu, Windows (Server), macOS
- Node.js Current, Active or Maintenance (LTS) versions, according to their [release schedule](https://github.com/nodejs/release#release-schedule)
- Storybook 6.5+

Other platforms/versions may work, but are not officially supported. Certain features may not be available on certain platforms/versions, even if otherwise supported.

## Contributing

Contributions of any kind are welcome! We're available to chat via the Intercom widget on the documentation site.

### Compatibility & versioning

Compatibility is guaranteed between this package and Chromatic like so:

- Production Chromatic ensures it’s compatible with what’s on npm
- What's on the Git tag is equal to what's published on npm for that version
- This package ensures it’s compatible with production Chromatic

To facilitate upgrading in the future, removing and adding features, this is the process:

- Any new features will have to be on Chromatic production before they could be used in this package
- We can add feature flags to be able to test new functionality
- Chromatic production can not remove any features this package depends on until after the usage has been removed from this package in addition to a grace period to allow users to upgrade

### Building and running locally

This project uses `yarn 4`. If you have `yarn 1` installed globally, it is recommended that you run `corepack enable` so that the version of yarn set in `packageManager` in `package.json` is used for this project. You may have to install `corepack`, [see the installation instructions](https://yarnpkg.com/corepack#installation) for more information.

1. Ensure `yarn -v` shows that you're using `yarn 4` for the project
2. Install all dependencies with `yarn install`
3. Build + watch the code locally: `yarn dev`
4. Run a build of all the CLI's stories against a Chromatic project: `yarn chromatic -t <token>`.

#### Running against staging

```bash
CHROMATIC_INDEX_URL=https://index.staging-chromatic.com yarn chromatic -t <token>
```

#### Running against development

To test against a local development version of the Chromatic stack, use

```bash
CHROMATIC_INDEX_URL=https://index.dev-chromatic.com yarn chromatic -t <token>
```

To only test a small number of test stories as a smoke test, use:

```bash
SMOKE_TEST=1 CHROMATIC_INDEX_URL=https://index.dev-chromatic.com yarn chromatic -t <token>
```

### Publishing a new version

We use `auto` to automate the release process. Versions are bumped, tags are created and the changelog is updated automatically. A new release goes out whenever a PR is merged to `main`. A PR **must** have **exactly one** of the following labels before merging:

- `major` triggers a major version bump
- `minor` triggers a minor version bump
- `patch` triggers a patch version bump

Additionally, a PR **may** have exactly one of these labels:

- `release` creates a `latest` release on npm
- `skip-release` does not create a release at all (changes roll into the next release)

We have two types of releases:

- `latest` releases are the general audience production releases, used by most people. Automatically created when merging a PR with the `release` label.
- `canary` releases are intended for testing purposes and should not be used in production, as they may only work against a staging or dev environment. Automatically created on every PR, but does not auto-publish the GitHub Action.

> For GitHub Actions, we may manually publish `chromaui/action-canary`.

A script is provided to manually publish the GitHub Action, though it's typically only necessary for `action-canary` releases:

```sh
yarn publish-action <canary|latest>
```
