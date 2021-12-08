import turboSnapEnabled from './turboSnapEnabled';

export default {
  title: 'CLI/Messages/Info',
};

export const TurboSnapEnabled = () =>
  turboSnapEnabled({ build: { actualCaptureCount: 12, inheritedCaptureCount: 42 } });
