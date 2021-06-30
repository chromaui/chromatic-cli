import mergeBaseNotFound from './mergeBaseNotFound';

export default {
  title: 'CLI/Messages/Errors',
};

export const MergeBaseNotFound = () =>
  mergeBaseNotFound({ patchBaseRef: 'main', patchHeadRef: 'feature' });
