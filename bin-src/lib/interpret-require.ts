// Heavily inspired by https://github.com/storybookjs/storybook/blob/415f78893528d7fb983f9e0d6301ebb71e989634/code/lib/core-common/src/utils/interpret-require.ts
import { getInterpretedFileWithExt } from './interpret-files';

// const registered = false;

export function interopRequireDefault(filePath: string) {
  // // eslint-disable-next-line no-underscore-dangle, global-require
  // const hasEsbuildBeenRegistered = !!require('module')._extensions['.ts'];

  // if (registered === false && !hasEsbuildBeenRegistered) {
  //   // eslint-disable-next-line global-require
  //   const { register } = require('esbuild-register/dist/node');
  //   registered = true;
  //   register({
  //     target: `node${process.version.slice(1)}`,
  //     format: 'cjs',
  //     hookIgnoreNodeModules: false,
  //     tsconfigRaw: `{
  //     "compilerOptions": {
  //       "strict": false,
  //       "skipLibCheck": true,
  //     },
  //   }`,
  //   });
  // }

  // eslint-disable-next-line import/no-dynamic-require,global-require
  const result = require(filePath);

  const isES6DefaultExported =
    typeof result === 'object' && result !== null && typeof result.default !== 'undefined';

  return isES6DefaultExported ? result.default : result;
}

function getCandidate(paths: string[]) {
  for (let i = 0; i < paths.length; i += 1) {
    const candidate = getInterpretedFileWithExt(paths[i]);

    if (candidate) {
      return candidate;
    }
  }

  return undefined;
}

export function serverRequire(filePath: string | string[]) {
  const candidatePath = serverResolve(filePath);

  if (!candidatePath) {
    return null;
  }

  return interopRequireDefault(candidatePath);
}

export function serverResolve(filePath: string | string[]): string | null {
  const paths = Array.isArray(filePath) ? filePath : [filePath];
  const existingCandidate = getCandidate(paths);

  if (!existingCandidate) {
    return null;
  }

  return existingCandidate.path;
}
