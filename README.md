# Storybook Chromatic & Storybook Chroma

A CLI for uploading/connecting your storybook to chromatic/chroma.

## Install

```sh
yarn add storybook-chromatic
# or
yarn add storybook-chroma
```

## Usage

Add a npm script called `chromatic` to your `package.json`

```
  "chromatic": "chromatic",
```

### Main options

```
--app_code="<your app code>"
```

You can also use the environment variable: `CHROMATIC_APP_CODE`

### Storybook options

```
--build-script-name [name], -b  The npm script that builds your Storybook [build-storybook]
--script-name [name], -s  The npm script that starts your Storybook [storybook]
--exec <command>, -e  Alternatively, a full command to run to start your storybook
--do-not-start, -S  Don't attempt to start or build; use if your Storybook is already running

--storybook-port <port>, -p  What port is your Storybook running on (auto detected from -s, if set)
--storybook-url <url>, -u  Storybook is already running at (external) url (implies -S)'
--storybook-build-dir, -d     <dirname>  Provide a directory with your built storybook; use if you've already built your storybook
--storybook-https  Use if Storybook is running on https (auto detected from -s, if set)
--storybook-cert <path>  Use if Storybook is running on https (auto detected from -s, if set)
--storybook-key <path>  Use if Storybook is running on https (auto detected from -s, if set)
--storybook-ca <ca>  Use if Storybook is running on https (auto detected from -s, if set)    
```

These options are not required, this CLI is 0-config if you have a `build-storybook` script in your `package.json`.

### Chromatic options

```
--auto-accept-changes [branch]  Accept any (non-error) changes or new stories for this build [only for <branch> if specified]'
--exit-zero-on-changes [branch]  Use a 0 exit code if changes are detected (i.e. don't stop the build) [only for <branch> if specified]
--ignore-last-build-on-branch [branch]  Do not use the last build on this branch as a baseline if it is no longer in history (i.e. branch was rebased) [only for <branch> if specified]'
--preserve-missing  Treat missing stories as unchanged (as opposed to deleted) when comparing to the baseline'
--no-interactive  Do not prompt for package.json changes
--only <component:story>  Only run a single story or a glob-style subset of stories (for debugging purposes
```

### Debug options

```
--skip  Skip chromatic tests (mark as passing)
--list  List available stories (for debugging purposes)
--ci  This build is running on CI, non-interactively (alternatively, pass CI=true)
--debug  Output more debugging information
```

## Contributing

Because of the nature of this package: it being a connector between storybook and a commercial service, you may need an app_code to test this locally. Just send us a message at opensource@hichroma.com!

All contributions are welcome!

## Future plans:

- We'd like to unify this so there's just a single package on npm.
- Migrate to Typescript
- Deprecate all the storybook options in favour of a sane `--config` flag

## Publishing

We publish with a script:

```sh
./scripts/publish.js
```

You can pass any flags to this you'd normally be able to pass to `npm publish`, such as `--dry-run` or `--tag="alpha"`.

Before publishing we check if the current user has permissions and if the version isn't already on npm
