import buildFullyTurboSnapped from './buildFullyTurboSnapped';
import turboSnapEnabled from './turboSnapEnabled';

export default {
  title: 'CLI/Messages/Info/Build Skipped',
};

const ancestorBuild = {
  status: 'PENDING',
  webUrl: 'https://www.chromatic.com/build?appId=abc123&number=95',
  snapshotCount: 54,
};

// When a build is skipped, the CLI prints turboSnapEnabled() and buildFullyTurboSnapped()
// back-to-back (see tasks/upload.ts finishUpload), so we render them together here.
const buildSkipped = (ctx: any) => {
  const skipContext = { ...ctx, skip: true };
  return `${turboSnapEnabled(skipContext)}\n\n${buildFullyTurboSnapped(skipContext)}`;
};

export const BuildSkippedAncestorPending = () => buildSkipped({ ancestorBuild });

export const BuildSkippedAncestorPassed = () =>
  buildSkipped({ ancestorBuild: { ...ancestorBuild, status: 'PASSED' } });

export const BuildSkippedAncestorAccepted = () =>
  buildSkipped({ ancestorBuild: { ...ancestorBuild, status: 'ACCEPTED' } });

export const BuildSkippedAncestorDenied = () =>
  buildSkipped({ ancestorBuild: { ...ancestorBuild, status: 'DENIED' } });

export const BuildSkippedAncestorOther = () =>
  buildSkipped({ ancestorBuild: { ...ancestorBuild, status: 'BROKEN' } });
