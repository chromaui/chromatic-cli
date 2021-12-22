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

📝 View the [Changelog](https://github.com/chromaui/chromatic-cli/blob/main/CHANGELOG.md#readme)

## Contributing

Contributions of any kind are welcome! We're available to chat via the Intercom widget on the documentation site.

### Compatibility & versioning

Compatibility is guaranteed between this package and Chromatic like so:

- Production Chromatic ensures it’s compatible with what’s on npm
- What's on the main branch is equal to what's published on npm
- This package ensures it’s compatible with production Chromatic

To facilitate upgrading in the future, removing and adding features, this is the process:

- Any new features will have to be on Chromatic production before they could be used in this package
- We can add feature flags to be able to test new functionality
- Chromatic production can not remove any features this package depends on until after the usage has been removed from this package in addition to a grace period to allow users to upgrade

### Publishing a new version to npm

Before publishing, make sure you've done the following:

- `yarn build`
- Updated CHANGELOG.md
- Committed and pushed everything
- Decide on the proper semver bump (major/minor/patch)

#### Doing a `canary` or `next` release

We have two types of pre-releases: `canary` and `next`. `canary` releases are intended for development purposes and should not be used in production, as they may only work against a staging or dev environment. `next` releases should be valid, working releases that can potentially be used by early adopters of new features, for example to handle a support request.

> As a consumer, **you should not specify a tag** (e.g. `chromatic@next`) in your package dependencies, but rather a specific version number (e.g. `chromatic@5.6.2-next.0`). Otherwise you'll end up with a broken build when we remove or update the tag.

For the first `canary` (or `next`) release, bump the version like so (depending on the semver bump):

```sh
npm version <premajor|preminor|prepatch> --preid canary
```

For consecutive `canary` releases on the same version:

```sh
npm version prerelease --preid=canary
```

Then push and publish:

```sh
git push --follow-tags
npm publish --tag canary
```

Make sure to replace `canary` with `next` if appropriate.

#### Doing a `latest` release

A final release is automatically tagged `latest` by npm.

```sh
npm version <major|minor|patch>
git push --follow-tags
npm publish
```

And finally, remove the `canary` and/or `next` tag, if any:

```
npm dist-tag rm chromatic canary
```

This ensures we can safely do a new `canary` or `next` release later, without anyone getting an unexpected update.
