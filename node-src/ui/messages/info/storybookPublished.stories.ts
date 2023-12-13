import storybookPublished from './storybookPublished';

export default {
  title: 'CLI/Messages/Info',
};

export const StorybookPublished = () =>
  storybookPublished({
    build: {
      actualCaptureCount: undefined,
      actualTestCount: undefined,
      testCount: undefined,
      changeCount: undefined,
      errorCount: undefined,
      componentCount: 5,
      specCount: 8,
    },
  } as any);
