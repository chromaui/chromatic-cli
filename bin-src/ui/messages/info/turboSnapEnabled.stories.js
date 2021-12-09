import turboSnapEnabled from './turboSnapEnabled';

export default {
  title: 'CLI/Messages/Info',
  args: {
    build: { actualCaptureCount: 12, inheritedCaptureCount: 42 },
  },
};

export const TurboSnapEnabled = (args) => turboSnapEnabled(args);

export const TurboSnapEnabledInteractive = (args) =>
  turboSnapEnabled({ ...args, interactive: true });
