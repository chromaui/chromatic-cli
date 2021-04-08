import fs from 'fs-extra';
import { getDependentStoryFiles } from '../bin/lib/getDependentStoryFiles';

const statsFile = process.argv[2] || './storybook-static/preview-stats.json';
const changedFiles = [];

const main = async () => {
  const stats = await fs.readJson(statsFile);
  const onlyStoryFiles = getDependentStoryFiles(changedFiles, stats);
  console.log(onlyStoryFiles);
};

main();
