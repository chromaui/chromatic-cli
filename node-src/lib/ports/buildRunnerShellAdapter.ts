import { BuildRunner } from './buildRunner';
import { ProcessRunner } from './processRunner';

/**
 * Construct the production {@link BuildRunner} that delegates the subprocess
 * invocation to a {@link ProcessRunner}. The adapter mirrors the legacy
 * `buildStorybook` invocation: stdout goes to the optional log stream,
 * `preferLocal` is forced off so the action's pinned Node binary is used, and
 * the abort signal + timeout are forwarded as-is.
 *
 * @param deps Adapter dependencies.
 * @param deps.proc The underlying ProcessRunner that executes the command.
 *
 * @returns A BuildRunner wired to the supplied ProcessRunner.
 */
export function createShellBuildRunner(deps: { proc: ProcessRunner }): BuildRunner {
  return {
    async build({ command, outputDir, env, logStream, signal, timeoutMs }) {
      await deps.proc.run(command, {
        stdio: [undefined, logStream, undefined],
        preferLocal: false,
        signal,
        timeout: timeoutMs,
        env,
      });
      return { outputDir };
    },
  };
}
