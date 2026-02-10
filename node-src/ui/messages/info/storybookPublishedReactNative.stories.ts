import storybookPublished from './storybookPublished';

export default {
  title: 'CLI/Messages/Info/ReactNative',
};

const ctx = { isReactNativeApp: true, options: {} } as any;

export const StorybookPublished = () =>
  storybookPublished({
    ...ctx,
    build: {},
    storybookUrl: 'https://5d67dc0374b2e300209c41e7-pfkaemtlit.chromatic.com/',
  } as any);

export const StorybookPrepared = () =>
  storybookPublished({
    ...ctx,
    build: {
      actualCaptureCount: undefined,
      actualTestCount: undefined,
      testCount: undefined,
      changeCount: undefined,
      errorCount: undefined,
      componentCount: 5,
      specCount: 8,
      storybookUrl: 'https://5d67dc0374b2e300209c41e7-pfkaemtlit.chromatic.com/',
    },
    storybookUrl: 'https://5d67dc0374b2e300209c41e7-pfkaemtlit.chromatic.com/',
  } as any);

export const StorybookPreparedWithIncompleteBuild = () =>
  storybookPublished({
    ...ctx,
    build: {
      actualCaptureCount: undefined,
      actualTestCount: undefined,
      testCount: undefined,
      changeCount: undefined,
      errorCount: undefined,
      componentCount: undefined,
      specCount: undefined,
      storybookUrl: 'https://5d67dc0374b2e300209c41e7-pfkaemtlit.chromatic.com/',
    },
    storybookUrl: 'https://5d67dc0374b2e300209c41e7-pfkaemtlit.chromatic.com/',
  } as any);
