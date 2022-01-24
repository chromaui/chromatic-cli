import turboSnapEnabled from './turboSnapEnabled';

export default {
  title: 'CLI/Messages/Info',
  args: {
    build: { actualCaptureCount: 12, inheritedCaptureCount: 42 },
  },
};

export const TurboSnapEnabled = (args: any) => turboSnapEnabled(args);

export const TurboSnapEnabledInteractive = (args: any) =>
  turboSnapEnabled({ ...args, interactive: true });
