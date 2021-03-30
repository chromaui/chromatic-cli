import fs from 'fs-extra';
import path from 'path';
import { getDependentStoryFiles } from '../bin/lib/getDependentStoryFiles';

const statsPath = path.join(__dirname, '../storybook-static/preview-stats.json');
const changedFiles = [];

const main = async () => {
  const stats = await fs.readJson(statsPath);
  const onlyStoryFiles = getDependentStoryFiles(changedFiles, stats);
  console.log(onlyStoryFiles);
};

main();
