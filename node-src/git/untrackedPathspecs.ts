import pLimit from 'p-limit';
import path from 'path';

import { execGitCommandEntries, GitDeps } from './execGit';

// Stay well below the command-line limit on Windows. Wider builds use the whole repository.
const MAX_SCOPES = 128;
const MAX_ARG_BYTES = 8192;
const limitProbes = pLimit(10);

/**
 * Finds the top one or two components of a real path inside the repository, in Git's spelling.
 *
 * @param repositoryRoot The repository containing the index.
 * @param absolutePath The real file on disk.
 *
 * @returns The first and optional second components, or no components outside the repository.
 */
export function untrackedScope(repositoryRoot: string, absolutePath: string): string[] {
  const relative = path.relative(repositoryRoot, absolutePath);
  if (
    !relative ||
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    return [];
  }
  return relative.split(path.sep, 2);
}

function requestedScopes(
  repositoryRoot: string,
  realPaths: Iterable<string>
): Set<string> | undefined {
  const requested = new Set<string>();
  for (const filePath of realPaths) {
    if (!path.isAbsolute(filePath)) return undefined;
    const parts = untrackedScope(repositoryRoot, filePath);
    if (parts.length > 0) requested.add(parts.join('/'));
  }
  return requested;
}

const topOf = (scope: string) => scope.split('/', 1)[0];

function fitsCommandLine(scopes: Set<string>) {
  const bytes = [...scopes].reduce((total, scope) => total + Buffer.byteLength(scope) + 1, 0);
  return scopes.size <= MAX_SCOPES && bytes <= MAX_ARG_BYTES;
}

// Each probe stops at its first entry, so a large directory listed before another can't hide it.
async function hasTrackedChild(deps: GitDeps, top: string) {
  for await (const entry of execGitCommandEntries(deps, [
    'git',
    'ls-files',
    '--cached',
    '--full-name',
    '-z',
    '--',
    `:(top,literal)${top}/`,
  ])) {
    // Only Git's own spelling counts, so a case-only rename on disk keeps the top-level scope.
    return entry.startsWith(`${top}/`);
  }
  return false;
}

async function trackedParents(deps: GitDeps, requested: Set<string>) {
  const wanted = [
    ...new Set([...requested].filter((scope) => scope.includes('/')).map((scope) => topOf(scope))),
  ];
  const found = await Promise.all(
    wanted.map((top) => limitProbes(() => hasTrackedChild(deps, top)))
  );
  return new Set(wanted.filter((_, index) => found[index]));
}

/**
 * Limits the untracked scan to the areas this manifest actually reads. A tracked file anywhere
 * below a top-level directory proves Git enters it on an unrestricted scan. Without that witness,
 * query the top-level entry itself: Git may report an untracked nested repository as one directory,
 * or skip a tracked file/symlink that the working tree has replaced with a directory.
 *
 * @param deps Git command dependencies.
 * @param repositoryRoot The root used to interpret the paths.
 * @param realPaths Every candidate file in the graph, config and static sweeps.
 *
 * @returns Literal Git scopes, or undefined to request the repository-wide listing.
 */
export async function getUntrackedScopes(
  deps: GitDeps,
  repositoryRoot: string,
  realPaths: Iterable<string>
): Promise<Set<string> | undefined> {
  // Respect an explicitly configured pathspec mode, including its effect on the original :/ query.
  if (
    [
      'GIT_LITERAL_PATHSPECS',
      'GIT_GLOB_PATHSPECS',
      'GIT_NOGLOB_PATHSPECS',
      'GIT_ICASE_PATHSPECS',
    ].some((key) => process.env[key] !== undefined)
  ) {
    return undefined;
  }
  const requested = requestedScopes(repositoryRoot, realPaths);
  if (!requested) return undefined;
  const tops = new Set([...requested].map((scope) => topOf(scope)));
  if (!fitsCommandLine(tops)) return undefined;

  const tracked = await trackedParents(deps, requested);
  const scopes = new Set(
    [...requested].map((scope) => {
      const top = topOf(scope);
      return tracked.has(top) && !requested.has(top) ? scope : top;
    })
  );
  // Many files directly inside one directory each become a scope; the top-level directories
  // cover them in fewer arguments.
  return fitsCommandLine(scopes) ? scopes : tops;
}
