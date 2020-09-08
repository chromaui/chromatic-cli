# 5.2.0-beta.0 - 2020-09-08

- Keep track of baselines when doing squash or rebase merges.

# 5.1.0 - 2020-08-03

- If the build directory we defined is empty, try to detect the actual build output directory from the Storybook build log and warn about it.
- Show a user-friendly error message if we still don't find any Storybook files to publish.
- We now read package.json using `pkgUp`, so theoretically you can run `chromatic` from a subdirectory.
- Added the `--output-dir (-o)` flag to use instead of a temp dir.
- Added `buildScript` to the error json output so we won't have to ask for it in support every time.
- Added a global promise rejection handler, in case we accidently forget to catch them.
- Added a user-friendly error message when build-storybook fails.
- Fixed the `--debug` flag so it actually prints something.
- Fixed the `--only` flag.
- Fixed issue with `node-loggly-bulk` when using Yarn 2.

# 5.0.0 - 2020-06-19

- Completely overhauled the CLI, with improved UX and better error handling
- Removed JSDOM and its shims to avoid a whole category of issues with broken builds
- Added a version upgrade check that warns when a new major update is available
- Added --junit-report to generating build reports for integration with other tools
- Changed --only to accept a simple glob
- Moved documentation to the Chromatic website

# 4.0.3 - 2020-05-18

- Replace child_process.execSync with execa
- ADD mock for execCommand in JSDOM

# 4.0.2 - 2020-04-26

- REMOVE node_env development https://github.com/chromaui/chromatic-cli/pull/81
- ADD ability to create a patch build for pull requests
- ADD extra parameters to upload https://github.com/chromaui/chromatic-cli/pull/107
- IMPROVE readability of error message from build-storybook https://github.com/chromaui/chromatic-cli/pull/112
- IMPROVE user experience during onboarding
- RENAME appCode to projectToken https://github.com/chromaui/chromatic-cli/pull/109
- REMOVE adding a environment variable when adding script, use cli flag instead https://github.com/chromaui/chromatic-cli/pull/105

# 3.5.2 - 2020-02-18

- FIX version of JSDOM to 16.1 as 16.2 includes a conflicting custom element support https://github.com/chromaui/chromatic-cli/issues/95

# 3.5.1 - 2020-02-06

- FIX setting the `fromCI` flag from our github action https://github.com/chromaui/action/issues/14

# 3.5.0 - 2020-01-28

- CHANGE so the CLI stop on storybook runtime errors https://github.com/chromaui/chromatic-cli/issues/75
- ADD a flag (`--allow-console-errors`) to continue on storybook runtime errors https://github.com/chromaui/chromatic-cli/issues/75
- ADD early warning system for if the storybook output folder is empty https://github.com/chromaui/chromatic-cli/issues/78
- IMPROVE readability of the error when build-storybook fails https://github.com/chromaui/chromatic-cli/issues/73
- IMPROVE readability of the error when storybook runtime throws an error https://github.com/chromaui/chromatic-cli/issues/73
- FIX `Intl.PluralRules.supportedLocalesOf is not a function` error https://github.com/chromaui/chromatic-cli/issues/76

# 3.4.0 - 2019-12-25

- FIX pubish script

# 3.3.0 - 2019-12-25

- IMPROVE logging when git fails
- FIX script for windows
- ADD `--exit-once-uploaded` flag
- FIX escape chararacters in error messages

# 3.2.0 failed upload to npm

# 3.1.0 - 2019-11-04

- ADD jsdom shim for SVG elements
- ADD jsdom shim for fetch
- Bugfix jsdom shim for Intl

# 3.0.3 - 2019-10-15

- ADD compatibility with github action
- ADD test with github action
- ADD compatibility with github env vars for tracing git branch
- Bugfix running on windows by using cross-spawn

# 3.0.2 - 2019-10-09

- ADD licence file
- Bugfix compatibility with CHROMA_APP_CODE
- Bugfix report list of addons

# 3.0.1 - 2019-10-08

- ADD chroma bin

# 3.0.0 - 2019-10-03

- Bugfix indentation of messages in terminal
- REMOVE the need for the clientside addon
- unify the 2 related packages into a single repository

# 2.2.2 - 2019-08-25

- Bugfix for compatibility with localtunnel`

# 2.2.0 - 2019-08-23

- Add support for docs-mode (Storybook 5.2 feature).

- Add support for a new parameter: `pauseAnimationsAtEnd`. Read about it here: https://www.chromatic.com/docs/animations

- Retry requests to uploading storybooks in case of network problems.

# 2.1.1 - 2019-08-06

- Upgrade `axios` dependency for security update

# 2.1.0 - 2019-07-17

- Add a `--skip` flag to indicate a commit is not going to be built (and still tag the PR as passing).
- Allow `chromatic` story parameters to be functions of `({ id, kind name })` -- in particular e.g. `chromatic: { viewport: () => [/*something dynamic based on story info */]}`
- A fix for issues involving story listings differing between browsers.

# 2.0.0 - 2019-07-17

- We now default to building and uploading your storybook, rather than starting and tunneling it. This has many benefits including increased reliability and better support for Live View. You'll need to ensure you have a `build-storybook` script defined in `package.json` (as added by the Storybook CLI). To get the old behaviour, pass `-s` to the `chromatic test` command.

- We now support HTTPS storybooks (using the `--ssl` flag and friends).

- We polyfill `window.Intl` in our JSDOM environment.

- We polyfill `window.customElements` in our JSDOM environment.

# 1.4.0 - 2019-06-20

- Retry requests to the API server if one fails rather than bailing out on builds.

# 1.3.3 - 2019-04-19

- Fixed issue with uploaded builds and Storybook 5 URLs.

# 1.3.2 - 2019-04-02

- Added a new `diffThreshold` Storybook parameter you can use to control the anti-aliasing threshold we use for diffing if you find that certain images are tripping our diff.

- Fix an issue with handling rebased branches in unusual CI systems.

# 1.3.1 - 2019-03-21

- Add a dedicated endpoint for `isChromatic` so you don't need to load our full package to use it (which is useful if you want to use it inside your app, which we generally don't advise).

# 1.3.0 - 2019-02-28

- Change the default behaviour around starting the storybook; if we find something running on the port, we assume it's your storybook, instead of requiring you to pass `-S/--do-not-start`.

- Add a new flag `--preserve-missing` which means any stories that are missing from the last build will be assumed to be unchanged. Use this if you are doing tricky things around dynamically building your Storybook based on code changes.

# 1.2.6 - 2019-02-05

- Fix an issue with Angular/zone.js failing to patch our `MutationObserver` mock

# 1.2.5 - 2019-01-30

- Fix an issue with using `isChromatic()` inside Jest (storyshots).

- Some rendering timing fixes to better support Storybook version 5

# 1.2.4 - 2019-01-18

- Added an export `isChromatic()` to determine if code is running under test.

- Added JSDOM mocks for `CreateObjectUrl` and `MutationObserver`

- Added a parameter `{ chromatic: { disable: true } }` to skip a story in chromatic

- Added a parameter `{ chromatic: { noScroll: true } }` to avoid scrolling screenshots in (non-chrome) browsers.

# 1.2.3 - 2018-12-28

- Allow overwriting the polyfills we create in JSDOM mode. (This is a bugfix for some libraries that bundle their own polyfills).

# 1.2.2 - 2018-12-10

- Allow controlling package initialization timing via `import configure from 'storybook-chromatic/configure'; configure()`

- Add a flag `--ignore-last-build-on-branch=X` to not use the last build on a branch no matter what (which helps with rebasing, see: http://docs.chromaticqa.com/branching-and-baselines#rebasing).

# 1.2.1 - 2018-12-04

- Update logging dependency from `loggly` to `node-loggly-bulk` due to security vulnerabilities.
  NOTE: this package was only used by our CLI tool and so there is no need for concern, but this new version should avoid tripping security tools.

# 1.2.0 - 2018-10-29

- Pass `chromatic` parameters from Storybook@4, supporting:

  - Viewports: http://docs.chromaticqa.com/viewports
  - Delay: http://docs.chromaticqa.com/delay

- Better logging from the package to allow us to debug build problems.

- Fix regression for node v6

- Fix for supporting stories that use Canvas APIs in JSDOM

# 1.1.0 - 2018-10-15

- Fix to work on Windows CI

- Added a `--storybook-build-dir` parameter that allows you to upload a pre-built storybook.

# 1.0.2 - 2018-08-23

- Fix a bug with Live View and Storybook@3.4

# 1.0.1 - 2018-07-26

- We now set the `CHROMATIC_APP_CODE` variable for you, with explicit instructions to remove it (and set via CI) in less secure applications.

- Some small bugfixes to support unusual usages.

# 1.0.0 - 2018-07-02

- Renamed the package from `react-chromatic` to `storybook-chromatic`, to indicate support for all view layers that Storybook supports!

- Tweaked to focus soley on Storybook -- simply `import 'storybook-chromatic';` (no `/storybook-addon` required). Run tests with `chromatic test --app-code` (no `--storybook-addon` required).

- Changed some URL parameters for the test command:

  - `--port` renamed `--storybook-port`
  - `--url` renamed `--storybook-url`
  - `--app-path` removed (it's always `/iframe.html`, as per Storybook).
  - `--exec` added to run arbitrary commands as an alternative to `--script-name`
  - `--no-interactive` added to disable interactive mode (and we do so automatically when on CI)

- We no longer require you to have npm installed if you are using yarn.

- Small bug fixes for missing git repositories, various failure modes.

- We now track your Storybook version and view layer so we know when to ship/change features.

# As `react-chromatic`

# 0.8.4 - 2018-06-07

- Fix an issue for stories that use `navigator.mimeTypes`

# 0.8.3 - 2018-04-26

- Fix a bug where sometimes the package did not detect the checked out branch.

# 0.8.2 - 2018-04-18

- Better support for rebasing branches - we now always treat the last build on this branch as a baseline, even if strictly it is not a git ancestor of the current commit. This helps deal with the situation where you rebase a branch off master, and still want to use the previously approved snapshots.

- Improved support for CI systems, especially _Netlify_ and _Travis PR builds_. Travis PR builds are a special case, read more about how to handle them in Chromatic here: https://www.chromatic.com/docs/ci#travis

# 0.8.1 - 2018-03-28

- Fix a small bug in the git algorithm for old Chromatic projects.

# 0.8.0 - 2018-03-28

- Reworked the git baseline detection algorithm to use a different technique that should be more reliable across many different modes of usage.

- Gather stories from Storybook 3.4 without requiring direct installation.

- Added `--auto-accept-changes` to avoid approvals on certain branches

- Added `--only` flag to run a single story

# 0.7.11 - 2018-03-15

- Handle the case where the last few Chromatic builds were run against commits which are no longer in the repository (due to rebasing or squashing). This could cause the tool to crash or fail to find a baseline for a build.

- Add a `--url` argument to allow running tests against arbitrary running apps.

# 0.7.10 - 2018-02-22

- Small API change for querying build change counts.

# 0.7.9 - 2018-01-23

- Our test script now warns you if your Storybook logs any errors. This can sometimes help reveal subtle problems that are caused by the script evaluating your Storybook in JSDOM. If you have legitimate things logged to `console.error` this may cause noise---you should probably get rid of them.

# 0.7.8 - 2018-01-18

- We no longer write your app code to your `package.json` by default; instead we prefer you pass it via the `CHROMATIC_APP_CODE` environment variable. (You can still optionally use `--app-code=xyz` if you are comfortable with the security of your `package.json`).

- We now show the final part of your Story's kind as the component name in the Chromatic UI. So "Webapp/UserList" will appear in Chromatic as "UserList".

# 0.7.7 - 2017-12-21

- This version sends us a little more information about the environment the package runs in -- is it CI? which package version?

# 0.7.6 - 2017-12-19

- Fix an issue where we did not pass the context to stories in the right format.

# 0.7.5 - 2017-12-19

- We detect a running process on your app's port and don't try and start the app if so. Pass `--do-not-start` if you've already started the app.

# 0.7.3 - 2017-12-09

- We now upload your application bundle to our tunnel server directly from the package.
  This means that on slower uplinks, we no need to set arbitrary timeouts in our server process; instead we simply will not start your Chromatic build until we've verified the bundle has uploaded successfully.
