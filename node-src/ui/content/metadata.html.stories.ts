import metadataHtml from './metadata.html';

export default {
  title: 'HTML/Metadata index',
};

const context = { announcedBuild: { number: 7801 } } as any;

const files = [
  {
    contentLength: 423,
    localPath: 'main.ts',
    targetPath: '.chromatic/main.ts',
  },
  {
    contentLength: 674,
    localPath: 'chromatic.log',
    targetPath: '.chromatic/chromatic.log',
  },
  {
    contentLength: 833,
    localPath: 'build-storybook.log',
    targetPath: '.chromatic/build-storybook.log',
  },
  {
    contentLength: 3645,
    localPath: 'chromatic-diagnostics.json',
    targetPath: '.chromatic/chromatic-diagnostics.json',
  },
  {
    contentLength: 5635,
    localPath: 'preview-stats.json',
    targetPath: '.chromatic/preview-stats.json',
  },
];

export const Default = () => metadataHtml(context, files);

export const BuildUrl = () =>
  metadataHtml(
    {
      ...context,
      build: {
        webUrl: 'https://www.chromatic.com/build?appId=5d67dc0374b2e300209c41e7&number=7801',
      },
    },
    files
  );
