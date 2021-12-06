import bailFile from './bailFile';

export default {
  title: 'CLI/Messages/Warnings',
};

export const BailStorybookFile = () =>
  bailFile({
    changedStorybookFile: '.storybook/preview-head.html',
  });

export const BailPackageFile = () =>
  bailFile({
    changedPackageFile: 'services/webapp/package.json',
  });

export const BailStaticFile = () =>
  bailFile({
    changedStaticFile: 'static/assets/fonts/percolate.woff',
  });
