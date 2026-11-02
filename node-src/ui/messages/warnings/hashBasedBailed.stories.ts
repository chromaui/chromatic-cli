import hashBasedBailed from './hashBasedBailed';

export default {
  title: 'CLI/Messages/Warnings',
};

export const HashBasedBailedNoAncestors = () =>
  hashBasedBailed({ hashBasedTurboSnap: { bailed: true, bailReason: 'NO_ANCESTORS' } });

export const HashBasedBailedNoAncestorHashes = () =>
  hashBasedBailed({ hashBasedTurboSnap: { bailed: true, bailReason: 'NO_ANCESTOR_HASHES' } });

export const HashBasedBailedNoAncestorConfigurationMatch = () =>
  hashBasedBailed({
    hashBasedTurboSnap: { bailed: true, bailReason: 'NO_ANCESTOR_CONFIGURATION_MATCH' },
  });
