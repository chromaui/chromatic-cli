# Storybook in a subdirectory

This exists purely to verify the behavior of --only-changed with --storybook-build-dir when pointed at a Storybook that was built in a subdirectory (such as this one).

In this scenario, paths in `preview-stats.json` will use `subdir` as their root directory (`./`), which means they'll be misaligned with the git root directory. For example, git may report `./subdir/One.js` as changed, but since this file is reported as `./One.js` in the webpack stats, it will not find any dependent stories for that file. Passing `--storybook-root-dir subdir` will resolve that.
