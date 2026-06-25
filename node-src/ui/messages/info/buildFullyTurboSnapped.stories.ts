import buildFullyTurboSnapped from './buildFullyTurboSnapped';

export default {
  title: 'CLI/Messages/Info',
};

const ancestorBuild = {
  status: 'PENDING',
  webUrl: 'https://www.chromatic.com/build?appId=abc123&number=95',
  snapshotCount: 54,
};

export const BuildFullyTurboSnappedAncestorPending = () =>
  buildFullyTurboSnapped({ ancestorBuild } as any);

export const BuildFullyTurboSnappedAncestorPassed = () =>
  buildFullyTurboSnapped({ ancestorBuild: { ...ancestorBuild, status: 'PASSED' } } as any);

export const BuildFullyTurboSnappedAncestorAccepted = () =>
  buildFullyTurboSnapped({ ancestorBuild: { ...ancestorBuild, status: 'ACCEPTED' } } as any);

export const BuildFullyTurboSnappedAncestorDenied = () =>
  buildFullyTurboSnapped({ ancestorBuild: { ...ancestorBuild, status: 'DENIED' } } as any);

export const BuildFullyTurboSnappedAncestorOther = () =>
  buildFullyTurboSnapped({ ancestorBuild: { ...ancestorBuild, status: 'BROKEN' } } as any);
