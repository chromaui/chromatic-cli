# Development

## Building and running locally

This project uses `yarn 4`. If you have `yarn 1` installed globally, it is recommended that you run `corepack enable` so that the version of yarn set in `packageManager` in `package.json` is used for this project. You may have to install `corepack`, [see the installation instructions](https://yarnpkg.com/corepack#installation) for more information.

1. Ensure `yarn -v` shows that you're using `yarn 4` for the project
2. Install all dependencies with `yarn install`
3. Build + watch the code locally: `yarn dev`
4. Run a build of all the CLI's stories against a Chromatic project: `yarn chromatic -t <token>`.

### Running against staging

```bash
CHROMATIC_INDEX_URL=https://index.staging-chromatic.com yarn chromatic -t <token>
```

### Running against development

To test against a local development version of the Chromatic stack, use

```bash
CHROMATIC_INDEX_URL=https://index.dev-chromatic.com yarn chromatic -t <token>
```

To only test a small number of test stories as a smoke test, use:

```bash
SMOKE_TEST=1 CHROMATIC_INDEX_URL=https://index.dev-chromatic.com yarn chromatic -t <token>
```

### Running another project against local CLI

#### Call CLI directly

```
node /path/to/cli/repo/dist/bin.js -t <token>
```

_This should work in most cases. However, if you run into weird issues, try the symlink version below._

#### Symlink CLI

1. Navigate to the project you'd like to run builds against
2. Add `chromatic` to your dependencies

   ```
   yarn add chromatic
   ```

3. Use [yarn link](https://yarnpkg.com/cli/link) to symlink your local CLI repo

   ```
   yarn link /path/to/cli/repo
   ```

4. Run your build

   ```
   yarn chromatic -t <token>
   ```

You can also combine this with the `CHROMATIC_INDEX_URL` environment variable to run the build against different versions of Chromatic.

Also note: Since your `chromatic` dependency is symlinked, you can build your local CLI and your project will automatically get the updated code.

## Publishing a new version

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
GH_TOKEN=<your_github_token>yarn publish-action <canary|latest>
```

To generate a new Github token, visit [https://github.com/settings/tokens](https://github.com/settings/tokens) and
create a new token with the `repo` scope.
