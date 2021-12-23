export const exitCodes = {
  // Generic results
  OK: 0,
  UNKNOWN_ERROR: 255,

  // Chromatic build results
  BUILD_HAS_CHANGES: 1,
  BUILD_HAS_ERRORS: 2,
  BUILD_FAILED: 3,
  BUILD_NO_STORIES: 4,
  BUILD_WAS_LIMITED: 5,

  // Chromatic account issues
  ACCOUNT_QUOTA_REACHED: 11,
  ACCOUNT_PAYMENT_REQUIRED: 12,

  // Subprocess errors
  GIT_NOT_CLEAN: 101,
  GIT_OUT_OF_DATE: 102,
  GIT_NO_MERGE_BASE: 103,
  NPM_INSTALL_FAILED: 104,
  NPM_BUILD_STORYBOOK_FAILED: 105,

  // I/O errors
  FETCH_ERROR: 201,
  GRAPHQL_ERROR: 202,
  INVALID_OPTIONS: 254,
};

export const setExitCode = (ctx, exitCode, userError = false) => {
  const [exitKey] = Object.entries(exitCodes).find(([_, code]) => code === exitCode) || [];
  if (!exitKey) throw new Error(`Invalid exitCode: ${exitCode}`);
  ctx.exitCode = exitCode;
  ctx.exitKey = exitKey;
  ctx.userError = userError;
};
