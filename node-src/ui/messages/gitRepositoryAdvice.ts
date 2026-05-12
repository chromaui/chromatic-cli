import { RepositoryDiagnostics } from '../../types';

const hasLimitedGitDepth = (value?: string) => value && value !== '0';

const hasShallowBuildkiteFlags = (diagnostics?: RepositoryDiagnostics) => {
  const flags = [
    diagnostics?.ciCheckoutEnvironment?.BUILDKITE_GIT_CLONE_FLAGS,
    diagnostics?.ciCheckoutEnvironment?.BUILDKITE_GIT_FETCH_FLAGS,
  ]
    .filter(Boolean)
    .join(' ');

  return /\B--depth(?:=|\s+)\d+/.test(flags);
};

/**
 * Get targeted advice when diagnostics indicate limited Git history.
 *
 * @param diagnostics Observed local repository diagnostics.
 *
 * @returns An actionable advice line, if one applies.
 */
export function getShallowRepositoryAdvice(diagnostics?: RepositoryDiagnostics) {
  const gitDepth = diagnostics?.ciCheckoutEnvironment?.GIT_DEPTH;

  if (hasLimitedGitDepth(gitDepth)) {
    return `Repository diagnostics show GIT_DEPTH=${gitDepth}. Set GIT_DEPTH=0 before running Chromatic so Git history is available.`;
  }

  if (hasShallowBuildkiteFlags(diagnostics)) {
    return `Repository diagnostics show Buildkite Git checkout flags with a depth limit. Remove the shallow depth or fetch full history before running Chromatic.`;
  }

  if (diagnostics?.isShallowRepository) {
    return `Repository diagnostics indicate this is a shallow repository. Fetch full Git history before running Chromatic.`;
  }

  return '';
}
