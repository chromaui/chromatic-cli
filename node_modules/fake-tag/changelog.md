# fake-tag changelog

## 2.0.0

### Major

- Updated Node.js support from v8.10+ to v10+. This is mostly to do with dev dependencies and shouldn’t be a breaking change for the published package.
- Updated dev dependencies, some of which only support Node.js v10+.
- Use [`coverage-node`](https://npm.im/coverage-node) for test code coverage.

### Minor

- Setup [GitHub Sponsors funding](https://github.com/sponsors/jaydenseric):
  - Added `.github/funding.yml` to display a sponsor button in GitHub.
  - Added a `package.json` `funding` field to enable npm CLI funding features.

### Patch

- Removed the now redundant [`eslint-plugin-import-order-alphabetical`](https://npm.im/eslint-plugin-import-order-alphabetical) dev dependency.
- Use strict mode for scripts.
- In CI, additionally test macOS as well as Node.js v10 and v13.

## 1.0.1

### Patch

- Updated dev dependencies.
- Removed [`husky`](https://npm.im/husky) and [`lint-staged`](https://npm.im/lint-staged).
- Replaced old ESLint config with [`eslint-config-env`](https://npm.im/eslint-config-env).
- Use [`test-director`](https://npm.im/test-director) instead of [`ava`](https://npm.im/ava) for tests.
- Updated the package description.
- Simplified the package `repository` field.
- Added a package `main` field.
- Added a package `engines` field declaring support for Node.js >= v8.10, as that is what ESLint supports. This only limits the dev environment; the published code is very simple and should be able to run almost anywhere.
- Added a package `browserslist` field, for linting.
- Moved dev tool config from `package.json` to separate files to reduce the published package size.
- Updated package scripts.
- Ensure Prettier also lints `.yml` files.
- Replaced Travis with GitHub Actions for CI.
- Removed `package-lock.json` from the `.gitignore` file, as it has been disabled anyway.
- Removed some readme badges, and used [badgen.net](https://badgen.net) instead of [shields.io](https://shields.io) for the npm version badge.
- Updated the readme with more details, links, and a typo fix.
- Corrected the first version number in the changelog from `0.1.0` to `1.0.0`.

## 1.0.0

- Initial release.
