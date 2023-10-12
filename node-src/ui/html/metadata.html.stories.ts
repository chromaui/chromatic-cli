import metadataHtml from './metadata.html';

export default {
  title: 'HTML/Metadata index',
  includeStories: /^[A-Z]/,
};

export const files = [
  {
    contentLength: 833,
    localPath: 'build-storybook.log',
    targetPath: '.chromatic/build-storybook.log',
  },
  {
    contentLength: 674,
    localPath: 'chromatic.log',
    targetPath: '.chromatic/chromatic.log',
  },
  {
    contentLength: 3645,
    localPath: 'chromatic-diagnostics.json',
    targetPath: '.chromatic/chromatic-diagnostics.json',
  },
  {
    contentLength: 423,
    localPath: 'main.ts',
    targetPath: '.chromatic/main.ts',
  },
  {
    contentLength: 5635,
    localPath: 'preview.tsx',
    targetPath: '.chromatic/preview.tsx',
  },
  {
    contentLength: 5635,
    localPath: 'preview-stats.json',
    targetPath: '.chromatic/preview-stats.json',
  },
];

const announced: any = { announcedBuild: { number: 7805 } };

const build: any = {
  ...announced,
  build: { webUrl: 'https://www.chromatic.com/build?appId=5d67dc0374b2e300209c41e7&number=7805' },
};

export const Default = () => metadataHtml(announced, files);

export const WithBuildLink = () => metadataHtml(build, files);
