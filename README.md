# Chromatic CLI

Publishes your Storybook to Chromatic and kicks off tests if they're enabled.

<img width="100%" src="https://user-images.githubusercontent.com/321738/82901859-d820ec80-9f5e-11ea-81e7-78d494c103ad.gif" alt="">

<a href="https://www.chromatic.com/builds?appId=5d67dc0374b2e300209c41e7">
  <img src="https://badgen.net/badge/tested%20with/chromatic/fc521f" alt="Tested with Chromatic">
</a>

## Documentation

👉 See the [Chromatic CLI docs](https://www.chromatic.com/docs/cli).

## Contributing

Contributions of any kind are welcome! We're available to chat via the Intercom widget on the documentation site.

### Compatibility & versioning

Compatibility is guaranteed between this package and Chromatic like so:

- Production Chromatic ensures it’s compatible with what’s on npm
- What's on the master branch is equal to what's published on npm
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

#### Doing a `dev` or `rc` release

We have two types of pre-releases: `dev` and `rc`. `dev` releases are intended for development purposes and should not be used in production, as they may only work against a staging or dev environment. `rc` releases should be valid, working releases that can potentially be used by early adopters of new features, for example to handle a support request.

For the first `dev` (or `rc`) release, bump the version like so (depending on the semver bump):

```sh
npm version <premajor|preminor|prepatch> --preid dev
```

For consecutive `dev` releases on the same version:

```sh
npm version prerelease --preid=dev
```

Then push and publish:

```sh
git push --follow-tags
npm publish --tag dev
```

Make sure to replace `dev` with `rc` if appropriate.

#### Doing a final release

```sh
npm version <major|minor|patch>
git push --follow-tags
npm publish
yarn publish-action
```

And finally, remove the `dev` and/or `rc` tag, if any:

```
npm dist-tag rm chromatic dev
```
