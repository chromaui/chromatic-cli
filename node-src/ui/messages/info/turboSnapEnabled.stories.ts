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
