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
