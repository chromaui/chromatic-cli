import { Module } from 'node:module';

/**
 * Utility to "mock" `require.resolve` in tests.
 *
 * This is quite hacky solution to work-around mocking `require.resolve` but
 * it works. Internally `require.resolve` calls `Module._resolveFilename` so we
 * can intercept it.
 *
 * @param from Input of `require.resolve(<from>)`
 * @param to Output of the mocked call, as in `const to = require.resolve(<from>)`
 *
 * @returns `function restore()` that restores mock back to original implementation
 */
export function patchModulePath(from: string, to: string) {
  // @ts-expect-error -- untyped
  const original = Module._resolveFilename;

  // @ts-expect-error -- untyped
  Module._resolveFilename = (request: string, parent: NodeModule) => {
    if (request === from) {
      return to;
    }

    return original(request, parent);
  };

  return function restore() {
    // @ts-expect-error -- untyped
    Module._resolveFilename = original;
  };
}
