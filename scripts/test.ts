import process from 'process';
import { run } from '../dist/node';

async function go() {
  await run({
    projectToken: process.env.CHROMATIC_PROJECT_TOKEN,
  });
}

go().catch((err) => {
  console.log(err);
  process.exit(1);
});
