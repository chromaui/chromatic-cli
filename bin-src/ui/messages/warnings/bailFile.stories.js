import bailFile from './bailFile';

export default {
  title: 'CLI/Messages/Warnings',
};

export const BailPackageFile = () =>
  bailFile({
    turboSnap: { bailReason: { changedPackageFile: 'services/webapp/package.json' } },
  });

export const BailStaticFile = () =>
  bailFile({
    turboSnap: { bailReason: { changedStaticFile: 'static/assets/fonts/percolate.woff' } },
  });

export const BailStorybookFile = () =>
  bailFile({
    turboSnap: { bailReason: { changedStorybookFile: '.storybook/preview-head.html' } },
  });
