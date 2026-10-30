import path from 'path';

import { execGitCommandEntries, GitDeps } from './execGit';

// Stay well below the command-line limit on Windows. Wider builds use the whole repository.
const MAX_SCOPES = 128;
const MAX_ARG_BYTES = 8192;

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
    if (requested.size > MAX_SCOPES) return undefined;
  }
  return requested;
}

async function trackedParents(deps: GitDeps, requested: Set<string>) {
  const wanted = new Set(
    [...requested].filter((scope) => scope.includes('/')).map((scope) => scope.split('/', 1)[0])
  );
  const tracked = new Set<string>();
  if (wanted.size === 0) return tracked;

  // Only a witness is needed. Stopping early leaves any unconfirmed directory at its top-level
  // scope and bounds the output even when a workspace holds a very large flat directory.
  let entries = 0;
  for await (const child of execGitCommandEntries(deps, [
    'git',
    'ls-files',
    '--cached',
    '--full-name',
    '-z',
    '--',
    ':(top,glob)*/*',
  ])) {
    const top = child.split('/', 1)[0];
    if (wanted.has(top)) tracked.add(top);
    if (tracked.size === wanted.size || ++entries === 4096) break;
  }
  return tracked;
}

/**
 * Limits the untracked scan to the areas this manifest actually reads. A tracked child proves
 * Git enters its top-level directory on an unrestricted scan. Without that witness, query the
 * top-level entry itself: Git may report an untracked nested repository as one directory, or
 * skip a tracked file/symlink that the working tree has replaced with a directory.
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
  if (!requested || requested.size === 0) return requested;
  const tracked = await trackedParents(deps, requested);
  const scopes = new Set<string>();
  for (const scope of requested) {
    const top = scope.split('/', 1)[0];
    scopes.add(tracked.has(top) && !requested.has(top) ? scope : top);
  }
  const bytes = [...scopes].reduce((total, scope) => total + Buffer.byteLength(scope) + 1, 0);
  return bytes <= MAX_ARG_BYTES ? scopes : undefined;
}
