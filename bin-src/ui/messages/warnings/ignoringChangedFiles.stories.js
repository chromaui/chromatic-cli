import ignoringChangedFiles from './ignoringChangedFiles';

export default {
  title: 'CLI/Messages/Warnings',
};

export const IgnoringChangedFiles = () =>
  ignoringChangedFiles({ changedCount: 42, ignoredCount: 3 });
