import { run } from '../node-src';

/**
 * The main entrypoint for the CLI.
 *
 * @param argv A list of arguments passed.
 */
export async function main(argv: string[]) {
  const { code } = await run({ argv });

  process.exit(code);
}
