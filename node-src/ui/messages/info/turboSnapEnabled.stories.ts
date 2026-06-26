import turboSnapEnabled from './turboSnapEnabled';

export default {
  title: 'CLI/Messages/Info',
  args: {
    build: { actualCaptureCount: 12, inheritedCaptureCount: 42 },
    options: {},
  },
};

export const TurboSnapEnabled = (args: any) => turboSnapEnabled(args);

export const TurboSnapEnabledInteractive = (args: any) =>
  turboSnapEnabled({ ...args, options: { interactive: true } });

export const TurboSnapEnabledSkipped = (args: any) =>
  turboSnapEnabled({
    ...args,
    skip: true,
    ancestorBuild: {
      status: 'PASSED',
      webUrl: 'https://www.chromatic.com/build?appId=abc&number=95',
      snapshotCount: 54,
    },
  });
