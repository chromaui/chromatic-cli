// The `?clack` Vite plugin (.storybook/clackCapture.ts) renders a `*.frames.ts` module in Node and
// emits a default-export object mapping each frame name to its captured ANSI string.
declare module '*?clack' {
  const frames: Record<string, string>;
  export default frames;
}

declare module 'yarn-or-npm' {
  import { SpawnOptions } from 'child_process';
  import crossSpawn from 'cross-spawn';

  export function spawn(args: string[], options?: SpawnOptions): ReturnType<typeof crossSpawn>;

  export const hasYarn: () => boolean;
}
