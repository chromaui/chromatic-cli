import { Logger } from '../../lib/log';
import { Ports } from '../../lib/ports';
import type { Options } from '../../types';
import invalidProjectId from '../../ui/messages/errors/invalidProjectId';
import invalidProjectToken from '../../ui/messages/errors/invalidProjectToken';
import type { AuthState } from '../types';

export type AuthPhasePorts = Pick<Ports, 'chromatic'>;

export interface AuthPhaseInput {
  options: Pick<Options, 'projectId' | 'projectToken' | 'userToken'>;
  log: Logger;
  ports: AuthPhasePorts;
}

export type AuthPhaseOutput = AuthState;

/**
 * Pure orchestration of the `auth` phase. Resolves a token via the
 * `chromatic` port (using either projectId+userToken or the bare
 * projectToken), installs it on the port for downstream calls, and
 * returns the {@link AuthState} slice. Translates known auth failures
 * into invalid-project errors so the orchestrator can surface them
 * directly.
 *
 * @param input Phase inputs.
 *
 * @returns The resolved {@link AuthState}.
 */
// eslint-disable-next-line complexity
export async function runAuthPhase(input: AuthPhaseInput): Promise<AuthPhaseOutput> {
  try {
    const token = await resolveToken(input);
    input.ports.chromatic.setAuthorization(token);
    return { token };
  } catch (errors) {
    const list = Array.isArray(errors) ? errors : [errors];
    const message = (list[0] as { message?: string } | undefined)?.message;
    if (message?.match('Must login') || message?.match('No Access')) {
      throw new Error(invalidProjectId({ projectId: input.options.projectId || '' }));
    }
    if (message?.match('No app with code')) {
      throw new Error(invalidProjectToken({ projectToken: input.options.projectToken }));
    }
    throw errors;
  }
}

async function resolveToken(input: AuthPhaseInput): Promise<string> {
  const { projectId, projectToken, userToken } = input.options;
  if (projectId && userToken) {
    return input.ports.chromatic.createCliToken({ projectId, userToken });
  }
  if (projectToken) {
    return input.ports.chromatic.createAppToken({ projectToken });
  }
  // Should never happen — getOptions enforces this earlier in the run.
  throw new Error('No projectId or projectToken');
}
