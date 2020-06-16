# Chromatic CLI

Publishes your Storybook to Chromatic and kicks off tests if they're enabled.

<img width="100%" src="https://user-images.githubusercontent.com/321738/82901859-d820ec80-9f5e-11ea-81e7-78d494c103ad.gif" alt="">

## Documentation

👉 See the [Chromatic CLI docs](https://www.chromatic.com/docs/cli).

## Migrating to the new CLI package

This package was previously named `storybook-chromatic`. If you still have `storybook-chromatic` installed, you should remove it and install `chromatic` instead:

**With npm:**

```
npm uninstall --save-dev storybook-chromatic
npm install --save-dev chromatic
```

**With yarn:**

```
yarn remove storybook-chromatic
yarn add --dev chromatic
```

## Publishing to npm

```sh
npm version <major|minor|patch|prerelease> [--preid <tag>]
git push --follow-tags
npm publish [--tag <tag>]
```

## Compatibility & versioning

Compatibility is guaranteed between this package and Chromatic like so:

- Production Chromatic ensures it’s compatible with what’s on npm
- What's on the master branch is equal to what's published on npm
- This package ensures it’s compatible with production Chromatic

To facilitate upgrading in the future, removing and adding features, this is the process:

- Any new features will have to be on Chromatic production before they could be used in this package
- We can add feature flags to be able to test new functionality
- Chromatic production can not remove any features this package depends on until after the usage has been removed from this package in addition to a grace period to allow users to upgrade
