import skippingEmptyFiles from './skippingEmptyFiles';

export default {
  title: 'CLI/Messages/Warnings',
};

export const SkippingEmptyFiles = () =>
  skippingEmptyFiles({
    emptyFiles: Array.from({ length: 3 }, (_, i) => ({
      contentLength: 0,
      localPath: `file${i}.js`,
      targetPath: `file${i}.js`,
    })),
  });
