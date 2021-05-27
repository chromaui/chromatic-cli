import fs from 'fs-extra';
import { getDependentStoryFiles } from '../bin/lib/getDependentStoryFiles';

const [statsFile, ...changedFiles] = process.argv.slice(2);

const main = async () => {
  const stats = await fs.readJson(statsFile);
  const ctx = {
    log: console,
    storybook: {
      configDir: '.storybook',
      staticDir: ['static'],
    },
  };
  // eslint-disable-next-line no-console
  console.log(getDependentStoryFiles(ctx, stats, changedFiles));
};

main();
