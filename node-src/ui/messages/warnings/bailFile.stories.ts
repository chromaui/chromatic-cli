import bailFile from './bailFile';

export default {
  title: 'CLI/Messages/Warnings',
};

export const BailPackageFile = () =>
  bailFile({
    turboSnap: { bailReason: { changedPackageFiles: ['services/webapp/package.json'] } },
  });

export const BailLockfile = () =>
  bailFile({
    turboSnap: { bailReason: { changedPackageFiles: ['services/webapp/yarn.lock'] } },
  });

export const BailStaticFile = () =>
  bailFile({
    turboSnap: { bailReason: { changedStaticFiles: ['static/assets/fonts/percolate.woff'] } },
  });

export const BailStorybookFile = () =>
  bailFile({
    turboSnap: { bailReason: { changedStorybookFiles: ['.storybook/preview-head.html'] } },
  });

export const BailTwoFiles = () =>
  bailFile({
    turboSnap: {
      bailReason: {
        changedStorybookFiles: ['.storybook/preview-head.html', '.storybook/manager-head.html'],
      },
    },
  });

export const BailStorybookFileImportedDependency = () =>
  bailFile({
    turboSnap: {
      bailReason: { changedStorybookFiles: ['.storybook/preview.js'] },
      bailPath: ['src/theme.js', 'src/tokens.js', '.storybook/preview.js'],
    },
  });

export const BailThreeFiles = () =>
  bailFile({
    turboSnap: {
      bailReason: {
        changedStorybookFiles: [
          '.storybook/preview-head.html',
          '.storybook/manager-head.html',
          '.storybook/global-styles.css',
        ],
      },
    },
  });
