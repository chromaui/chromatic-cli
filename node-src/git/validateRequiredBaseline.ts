import { execGitCommand, GitDeps } from './execGit';

const FETCH_HISTORY =
  'Fetch the required commit and the history of the tested commit, then retry. For a shallow clone, fetch full history (git fetch --unshallow).';

/**
 * Validate an explicit baseline dependency against the commit Chromatic will test.
 * This checks Git ancestry only; the server must still resolve a usable build.
 *
 * @param deps Git command dependencies.
 * @param requiredCommit Full object ID supplied by CI as the required baseline.
 * @param testedCommit Full object ID for the commit being tested.
 *
 * @returns The validated, normalized baseline commit ID.
 */
export async function validateRequiredBaseline(
  deps: GitDeps,
  requiredCommit: string,
  testedCommit: string
): Promise<string> {
  const formatOutput = await execGitCommand(deps, ['git', 'rev-parse', '--show-object-format'], {
    all: false,
  });
  const objectFormat = formatOutput.trim();
  const fullCommitPattern = { sha1: /^[\da-f]{40}$/i, sha256: /^[\da-f]{64}$/i }[objectFormat];
  if (!fullCommitPattern) {
    throw new Error(
      `Cannot validate --require-baseline: unsupported Git object format ${objectFormat}.`
    );
  }
  if (!fullCommitPattern.test(requiredCommit)) {
    throw new Error(`--require-baseline must be a full ${objectFormat} commit ID.`);
  }
  if (!fullCommitPattern.test(testedCommit)) {
    throw new Error(
      `Cannot validate --require-baseline: the tested commit is not a full ${objectFormat} commit ID.`
    );
  }

  const required = requiredCommit.toLowerCase();
  const tested = testedCommit.toLowerCase();
  if (required === tested) {
    throw new Error(
      '--require-baseline cannot refer to the current commit. A build cannot depend on itself.'
    );
  }

  await validateCommitObject(deps, required);
  await validateCommitObject(deps, tested);
  await validateAncestry(deps, required, tested);

  return required;
}

async function validateCommitObject(deps: GitDeps, commit: string): Promise<void> {
  let output: string;
  try {
    output = await execGitCommand(deps, ['git', 'cat-file', '-t', commit], { all: false });
  } catch (error) {
    throw new Error(
      `Cannot read commit ${commit} to validate --require-baseline. ${FETCH_HISTORY}`,
      { cause: error }
    );
  }
  const objectType = output.trim();
  if (objectType !== 'commit') {
    throw new Error(
      `Cannot validate --require-baseline: ${commit} is a ${objectType} object, not a commit.`
    );
  }
}

async function validateAncestry(deps: GitDeps, required: string, tested: string): Promise<void> {
  try {
    await execGitCommand(deps, ['git', 'merge-base', '--is-ancestor', required, tested], {
      all: false,
    });
  } catch (error) {
    if (error.exitCode !== 1) {
      throw new Error(`Git failed to validate --require-baseline ancestry. ${FETCH_HISTORY}`, {
        cause: error,
      });
    }
    const shallowOutput = await execGitCommand(
      deps,
      ['git', 'rev-parse', '--is-shallow-repository'],
      { all: false }
    );
    const shallow = shallowOutput.trim();
    if (shallow === 'true') {
      throw new Error(
        `Cannot establish --require-baseline ancestry in this shallow clone. ${FETCH_HISTORY}`,
        { cause: error }
      );
    }
    if (shallow !== 'false') {
      throw new Error(
        'Cannot determine whether the repository has enough history to validate --require-baseline.'
      );
    }
    throw new Error(
      `Required baseline commit ${required} is not an ancestor of tested commit ${tested}.`,
      { cause: error }
    );
  }
}
