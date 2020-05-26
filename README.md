# Chromatic CLI

Publishes your Storybook to Chromatic and kicks off tests if they're enabled.

<img width="100%" src="https://user-images.githubusercontent.com/321738/82901859-d820ec80-9f5e-11ea-81e7-78d494c103ad.gif" alt="">

## Quick Start

```sh
npx chromatic --project-token <your token>
```

After the first run, the CLI will automatically ask you to add a script to your `package.json`.

### Installing

Optionally, you can install `chromatic` as a dependency, while using the same script above.

```sh
npm install -D chromatic
```

If you don't install `chromatic` as a dependency, `npx` will download and run the latest version automatically. This has pros and cons:

- 👍 You'll never be out of date, you'll use the latest version every time, never have to worry about upgrading Chromatic.
- 👍 You won't need to install the package during local development if you're only running it in continuous integration.
- 👎 It will be slower to run because the package has to be downloaded first.

### Usage in a GitHub Action

There are examples here: [/.github/workflows](/.github/workflows).

Do not run this based on a github pull_request event. If you do, the commit and branch will get reported wrong, use [https://github.com/chromaui/action](https://github.com/chromaui/action) instead.

### Main options

```
--project-token <your token>
```

You can also use the environment variable: `CHROMATIC_PROJECT_TOKEN`

> Note: this option was previously known as "--app-code". If you encounter an error referring to this, you should upgrade to the latest version of the Chromatic CLI. See [Migrating to the new CLI package](#migrating-to-the-new-cli-package).

### Storybook options

```
--build-script-name [name], -b  The npm script that builds your Storybook [build-storybook]
--storybook-build-dir, -d <dirname>  Provide a directory with your built storybook; use if you've already built your storybook
```

Deprecated options (for tunneled builds):

```
--script-name [name], -s  The npm script that starts your Storybook [storybook]
--exec <command>, -e  Alternatively, a full command to run to start your storybook
--do-not-start, -S  Don't attempt to start or build; use if your Storybook is already running

--storybook-port <port>, -p  What port is your Storybook running on (auto detected from -s, if set)
--storybook-url <url>, -u  Storybook is already running at (external) url (implies -S)'
--storybook-https  Use if Storybook is running on https (auto detected from -s, if set)
--storybook-cert <path>  Use if Storybook is running on https (auto detected from -s, if set)
--storybook-key <path>  Use if Storybook is running on https (auto detected from -s, if set)
--storybook-ca <ca>  Use if Storybook is running on https (auto detected from -s, if set)
```

These options are not required, this CLI is zero-config if you have a `build-storybook` script in your `package.json`.

### Chromatic options

```
--allow-console-errors  Continue running chromatic even if some there are errors logged during Storybook initialization
--auto-accept-changes [branch]  Accept any (non-error) changes or new stories for this build [only for <branch> if specified]
--exit-zero-on-changes [branch]  Use a 0 exit code if changes are detected (i.e. don't stop the build) [only for <branch> if specified]
--exit-once-uploaded [branch]  Exit with 0 once the built version has been sent to chromatic [only for <branch> if specified]
--ignore-last-build-on-branch [branch]  Do not use the last build on this branch as a baseline if it is no longer in history (i.e. branch was rebased) [only for <branch> if specified]
--preserve-missing  Treat missing stories as unchanged (as opposed to deleted) when comparing to the baseline
--no-interactive  Do not prompt for package.json changes
--only <component:story>  Only run a single story or a glob-style subset of stories (for debugging purposes)
```

### Debug options

```
--skip  Skip chromatic tests (mark as passing)
--list  List available stories (for debugging purposes)
--ci  This build is running on CI, non-interactively (alternatively, pass CI=true)
--debug  Output more debugging information
```

### Environment variables

This package will load any variables from a `.env` file if present

## Issues

If you encounter issues with the CLI please report them via the in-app chat (Intercom widget) or at https://github.com/chromaui/chromatic-cli/issues. Thanks!

## Contributing

Because of the nature of this package: it being a connector between Storybook and a web service, you may need a project token to test this locally. Just send us a message at `opensource@hichroma.com` or sign up for an account!

All contributions are welcome!

## Future plans:

- Migrate to Typescript
- Deprecate all the Storybook options in favor of a sane `--config` flag

## Publishing to npm

We publish with a script:

```sh
./scripts/publish.js
```

You can pass any flags to this you'd normally be able to pass to `npm publish`, such as `--dry-run` or `--tag="alpha"`.

Before publishing we check if the current user has permissions and if the version isn't already on npm

## Compatibility & versioning

Compatibility is guaranteed between this package and Chromatic like so:

- Production Chromatic ensures it’s compatible with what’s on npm
- What's on the master branch is equal to what's published on npm
- This package ensures it’s compatible with production Chromatic

To facilitate upgrading in the future, removing and adding features, this is the process:

- Any new features will have to be on Chromatic production before they could be used in this package
- We can add feature flags to be able to test new functionality
- Chromatic production can not remove any features this package depends on until after the usage has been removed from this package in addition to a grace period to allow users to upgrade

### Migrating to the new CLI package

This package was previously named `storybook-chromatic`. If you still have `storybook-chromatic` installed, you should remove it and install `chromatic` instead:

**With npm:**

```
npm uninstall --save-dev storybook-chromatic
npm install --save-dev chromatic
```

**With yarn:**

```
yarn remove --dev storybook-chromatic
yarn add --dev chromatic
```
