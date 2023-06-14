import { run } from '../node-src';

export async function main(argv: string[]) {
  const { code } = await run({ argv });

  process.exit(code);
}
