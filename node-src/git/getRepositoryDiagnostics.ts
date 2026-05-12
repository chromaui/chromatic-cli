import { readFile } from 'fs/promises';

import { CommitAvailabilityProbe, Deps, RepositoryDiagnostics } from '../types';
import { execGitCommand } from './execGit';

const DIAGNOSTIC_TIMEOUT = 2000;
const SHALLOW_BOUNDARY_SAMPLE_SIZE = 10;

const CHECKOUT_ENVIRONMENT_KEYS = [
  'GIT_DEPTH',
  'GIT_STRATEGY',
  'GIT_CHECKOUT',
  'GIT_CLEAN_FLAGS',
  'GIT_FETCH_EXTRA_FLAGS',
  'GIT_SUBMODULE_STRATEGY',
  'GIT_SUBMODULE_DEPTH',
  'BUILDKITE_GIT_CLONE_FLAGS',
  'BUILDKITE_GIT_FETCH_FLAGS',
  'BUILDKITE_GIT_CLEAN_FLAGS',
  'BUILDKITE_GIT_SUBMODULES',
];

type RepositoryDiagnosticsDeps = Pick<Deps, 'log'>;

type AvailabilityInput = Omit<CommitAvailabilityProbe, 'exists' | 'error'>;

const parseBoolean = (value?: string) => {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return undefined;
};

const parseCount = (value?: string) => {
  const count = Number.parseInt(value?.trim() || '', 10);
  return Number.isFinite(count) ? count : undefined;
};

const trim = (value?: string) => {
  const trimmed = value?.trim();
  return trimmed || undefined;
};

const sanitizeError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  return message.split('\n')[0];
};

const quoteGitArgument = (value: string) => JSON.stringify(value);

const addProbeError = (
  diagnostics: RepositoryDiagnostics,
  probeName: string,
  error: unknown,
  { optional = false } = {}
) => {
  if (optional) return;

  diagnostics.probeErrors = {
    ...diagnostics.probeErrors,
    [probeName]: sanitizeError(error),
  };
};

const runGitProbe = async (
  deps: RepositoryDiagnosticsDeps,
  diagnostics: RepositoryDiagnostics,
  probeName: string,
  command: string,
  { optional = false } = {}
) => {
  try {
    return await execGitCommand(deps, command, { timeout: DIAGNOSTIC_TIMEOUT });
  } catch (error) {
    addProbeError(diagnostics, probeName, error, { optional });
    return undefined;
  }
};

const parseRemoteOrigin = (remoteOriginUrl?: string): RepositoryDiagnostics['remoteOrigin'] => {
  const value = trim(remoteOriginUrl);
  if (!value) return { present: false };

  if (!value.includes('://')) {
    const sshMatch = value.match(/^(?:[^@]+@)?([^:]+):/);
    if (sshMatch) return { present: true, protocol: 'ssh', host: sshMatch[1] };
  }

  try {
    const url = new URL(value);
    const protocol = url.protocol.replace(':', '');
    if (['ssh', 'https', 'http', 'file'].includes(protocol)) {
      return {
        present: true,
        protocol: protocol as 'ssh' | 'https' | 'http' | 'file',
        host: url.hostname || undefined,
      };
    }
    return { present: true, protocol: 'other', host: url.hostname || undefined };
  } catch {
    return { present: true, protocol: value.startsWith('/') ? 'file' : 'other' };
  }
};

const gatherCheckoutEnvironment = () =>
  Object.fromEntries(
    CHECKOUT_ENVIRONMENT_KEYS.flatMap((key) => {
      const value = process.env[key];
      return value ? [[key, value]] : [];
    })
  );

const getShallowBoundaries = async (
  deps: RepositoryDiagnosticsDeps,
  diagnostics: RepositoryDiagnostics
) => {
  const shallowPath = trim(
    await runGitProbe(deps, diagnostics, 'shallowPath', 'git rev-parse --git-path shallow')
  );
  if (!shallowPath) return;

  try {
    const shallowContents = await readFile(shallowPath, 'utf8');
    const commits = shallowContents.split(/\r\n|\r|\n/).filter(Boolean);
    diagnostics.shallowBoundaryCount = commits.length;
    diagnostics.shallowBoundaryCommits = commits.slice(0, SHALLOW_BOUNDARY_SAMPLE_SIZE);
  } catch (error) {
    if (error.code === 'ENOENT') {
      diagnostics.shallowBoundaryCount = 0;
      diagnostics.shallowBoundaryCommits = [];
      return;
    }
    addProbeError(diagnostics, 'shallowBoundaryCommits', error);
  }
};

/**
 * Gather non-fatal Git repository diagnostics for support/debugging.
 *
 * These probes describe the observed local Git state. They intentionally do not infer the
 * configured CI fetch depth and must not mutate the repository.
 *
 * @param deps Function dependencies.
 *
 * @returns Repository diagnostics with per-probe errors captured instead of thrown.
 */
export async function getRepositoryDiagnostics(deps: RepositoryDiagnosticsDeps) {
  const diagnostics: RepositoryDiagnostics = { version: 1 };

  diagnostics.isShallowRepository = parseBoolean(
    await runGitProbe(
      deps,
      diagnostics,
      'isShallowRepository',
      'git rev-parse --is-shallow-repository'
    )
  );
  diagnostics.reachableCommitCountFromHead = parseCount(
    await runGitProbe(
      deps,
      diagnostics,
      'reachableCommitCountFromHead',
      'git rev-list --count HEAD'
    )
  );
  diagnostics.reachableCommitCountAllRefs = parseCount(
    await runGitProbe(
      deps,
      diagnostics,
      'reachableCommitCountAllRefs',
      'git rev-list --count --all'
    )
  );
  diagnostics.isBareRepository = parseBoolean(
    await runGitProbe(deps, diagnostics, 'isBareRepository', 'git rev-parse --is-bare-repository')
  );

  const branch = trim(
    await runGitProbe(deps, diagnostics, 'currentBranch', 'git rev-parse --abbrev-ref HEAD')
  );
  diagnostics.isDetachedHead = branch === 'HEAD';
  if (branch && branch !== 'HEAD') diagnostics.currentBranch = branch;

  diagnostics.upstreamBranch = trim(
    await runGitProbe(
      deps,
      diagnostics,
      'upstreamBranch',
      'git rev-parse --abbrev-ref --symbolic-full-name "@{upstream}"',
      { optional: true }
    )
  );

  diagnostics.remoteOrigin = parseRemoteOrigin(
    await runGitProbe(deps, diagnostics, 'remoteOrigin', 'git config --get remote.origin.url', {
      optional: true,
    })
  );

  const promisorRemote = trim(
    await runGitProbe(
      deps,
      diagnostics,
      'partialClone.promisorRemote',
      'git config --get extensions.partialclone',
      { optional: true }
    )
  );
  const remoteOriginPromisor = parseBoolean(
    await runGitProbe(
      deps,
      diagnostics,
      'partialClone.remoteOriginPromisor',
      'git config --get remote.origin.promisor',
      { optional: true }
    )
  );
  const remoteOriginPartialCloneFilter = trim(
    await runGitProbe(
      deps,
      diagnostics,
      'partialClone.remoteOriginPartialCloneFilter',
      'git config --get remote.origin.partialclonefilter',
      { optional: true }
    )
  );
  if (promisorRemote || remoteOriginPromisor !== undefined || remoteOriginPartialCloneFilter) {
    diagnostics.partialClone = {
      promisorRemote,
      remoteOriginPromisor,
      remoteOriginPartialCloneFilter,
    };
  }

  const ciCheckoutEnvironment = gatherCheckoutEnvironment();
  if (Object.keys(ciCheckoutEnvironment).length > 0) {
    diagnostics.ciCheckoutEnvironment = ciCheckoutEnvironment;
  }

  await getShallowBoundaries(deps, diagnostics);

  return diagnostics;
}

const checkCommitAvailability = async (
  deps: RepositoryDiagnosticsDeps,
  probe: AvailabilityInput
): Promise<CommitAvailabilityProbe> => {
  let commit = probe.commit;
  if (!commit && probe.reference) {
    try {
      commit = trim(
        await execGitCommand(deps, `git rev-parse ${quoteGitArgument(probe.reference)}`, {
          timeout: DIAGNOSTIC_TIMEOUT,
        })
      );
    } catch (error) {
      return { ...probe, exists: false, error: sanitizeError(error) };
    }
  }

  if (!commit) return { ...probe, exists: false, error: 'Missing commit or reference' };

  try {
    await execGitCommand(deps, `git cat-file -e ${quoteGitArgument(`${commit}^{commit}`)}`, {
      timeout: DIAGNOSTIC_TIMEOUT,
    });
    return { ...probe, commit, exists: true };
  } catch (error) {
    return { ...probe, commit, exists: false, error: sanitizeError(error) };
  }
};

/**
 * Add role-labeled commit availability probes for degraded Git paths.
 *
 * @param deps Function dependencies.
 * @param diagnostics Existing repository diagnostics.
 * @param input Degraded reason and relevant commits/references to probe.
 * @param input.reason Why the availability probes were gathered.
 * @param input.commits Relevant commits/references to check.
 *
 * @returns A new diagnostics object with commit availability appended.
 */
export async function enrichRepositoryDiagnostics(
  deps: RepositoryDiagnosticsDeps,
  diagnostics: RepositoryDiagnostics,
  input: {
    reason: NonNullable<RepositoryDiagnostics['commitAvailability']>[number]['reason'];
    commits: AvailabilityInput[];
  }
) {
  const commits = await Promise.all(
    input.commits.map((probe) => checkCommitAvailability(deps, probe))
  );

  return {
    ...diagnostics,
    commitAvailability: [
      ...(diagnostics.commitAvailability || []),
      { reason: input.reason, commits },
    ],
  };
}

/**
 * Format a compact debug summary for the log file.
 *
 * @param diagnostics Repository diagnostics to summarize.
 *
 * @returns A one-line debug summary.
 */
export function formatRepositoryDiagnostics(diagnostics: RepositoryDiagnostics) {
  const partialCloneFilter = diagnostics.partialClone?.remoteOriginPartialCloneFilter;
  return [
    `shallow=${diagnostics.isShallowRepository ?? 'unknown'}`,
    `reachableFromHead=${diagnostics.reachableCommitCountFromHead ?? 'unknown'}`,
    `allRefs=${diagnostics.reachableCommitCountAllRefs ?? 'unknown'}`,
    `partialCloneFilter=${partialCloneFilter ?? 'none'}`,
    `bare=${diagnostics.isBareRepository ?? 'unknown'}`,
    `detached=${diagnostics.isDetachedHead ?? 'unknown'}`,
  ].join(', ');
}
