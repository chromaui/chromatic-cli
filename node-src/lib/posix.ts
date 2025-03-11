import path from 'path';

// Replaces Windows-style backslash path separators with POSIX-style forward slashes, because the
// Webpack stats use forward slashes in the `name` and `moduleName` fields. Note `changedFiles`
// already contains forward slashes, because that's what git yields even on Windows.
export const posix = (localPath: string) =>
  localPath.split(path.sep).filter(Boolean).join(path.posix.sep);
