import { parseNr, getCliCommand, parseNa } from '@antfu/ni';

// 'npm' | 'pnpm' | 'yarn' | 'bun'
export const getPackageManagerName = async () => {
  return getCliCommand(parseNa, [], { programmatic: true }) as any;
};

// e.g. `npm run build-storybook`
export const getPackageManagerRunCommand = async (args: string[]) => {
  return getCliCommand(parseNr, args, { programmatic: true });
};
