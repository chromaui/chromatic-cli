import fs from 'fs-extra';
import { getDependentStoryFiles } from '../bin/lib/getDependentStoryFiles';

const [statsFile, ...changedFiles] = process.argv.slice(2);

const main = async () => {
  const stats = await fs.readJson(statsFile);
  const onlyStoryFiles = getDependentStoryFiles(changedFiles, stats);
  console.log(onlyStoryFiles);
};

main();
