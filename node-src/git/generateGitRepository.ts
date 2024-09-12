/**
 * This file is for testing purposes only
 */

// global "date"
let date = Date.now() - 100 * 1000;
function nextDate() {
  date += 1000;
  return new Date(date).toString();
}

type Hash = string;
type Line = [Hash, false | Hash | Hash[]];
type CommitMap = Record<Hash, { hash: Hash; committedAt: number }>;

async function generateCommit(
  runGit: (command: string) => Promise<{ stdout: string; stderr: string }>,
  [name, parentNames]: Line,
  commitMap: CommitMap
) {
  const parentCommits = [parentNames]
    .flat()
    .filter((parentName) => parentName && commitMap[parentName])
    .map((parentName) => parentName && commitMap[parentName].hash);

  const randomBranchName = `temp-${Math.random().toString().slice(2)}`;
  const commitEnv = `GIT_COMMITTER_DATE='${nextDate()}'`;
  // No parent, check out nothing
  if (parentCommits.length === 0) {
    await runGit(`git checkout --orphan ${randomBranchName}`);
    await runGit(`${commitEnv} git commit -m ${name} --allow-empty`);
  } else {
    // Check out the first parent
    await runGit(`git checkout ${parentCommits[0]}`);

    // If more parents, create merge commit
    await (parentCommits.length > 1
      ? runGit(`${commitEnv} git merge -m ${name} ${parentCommits.slice(1).join(' ')}`)
      : runGit(`${commitEnv} git commit -m ${name} --allow-empty`));
  }
  const gitShowStr = await runGit(`git show --format=%H,%ct`);
  const [hash, committedAt] = gitShowStr.stdout.trim().split(',');

  return { hash, committedAt: Number.parseInt(committedAt, 10) };
}

// Take a repository description in the following format:
//  [[name, parentNames]], where:
//    - name is a string
//    - parentNames can be false (no parent), a single string or array of strings
//
// This function will take such a description and create a git repository with commits
// following the structure above. Note commit times are assumed to be increasing down the list.
//
// Returns a map: name => commitHash
export default async function generateGitRepository(runGit, description) {
  await runGit(`git init`);
  await runGit(`git config user.email test@test.com`);
  await runGit(`git config user.name Test McTestface`);
  const commitMap: CommitMap = {};
  async function runLines([line, ...lines]: Line[]) {
    commitMap[line[0]] = await generateCommit(runGit, line, commitMap);
    if (lines.length > 0) {
      await runLines(lines);
    }
  }

  if (description.length === 0) {
    throw new Error('No lines in description!');
  }
  await runLines(description);
  return commitMap;
}
