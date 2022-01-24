declare module 'yarn-or-npm' {
  import { SpawnOptions } from 'child_process';
  import crossSpawn from 'cross-spawn';

  export function spawn(args: string[], options: SpawnOptions): ReturnType<typeof crossSpawn>;

  export const hasYarn: boolean;
}
