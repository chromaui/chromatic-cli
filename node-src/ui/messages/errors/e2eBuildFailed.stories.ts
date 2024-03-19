import e2eBuildFailed from './e2eBuildFailed';

export default {
  title: 'CLI/Messages/Errors',
};

export const E2EBuildFailed = () =>
  e2eBuildFailed({ flag: 'playwright', errorMessage: 'Error Message' });
