import fs from 'fs-extra';
import { getDependentStoryFiles, statsToDependencies } from '../bin/lib/getDependentStoryFiles';

const [statsFile, ...changedFiles] = process.argv.slice(2);

const main = async () => {
  const stats = await fs.readJson(statsFile);
  const deps = statsToDependencies(stats);
  const onlyStoryFiles = getDependentStoryFiles(changedFiles, deps);
  console.log(onlyStoryFiles);
};

main();
