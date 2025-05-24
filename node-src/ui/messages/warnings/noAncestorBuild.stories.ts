import noAncestorBuild from './noAncestorBuild';

export default {
  title: 'CLI/Messages/Warnings',
  args: {
    announcedBuild: { number: 123 },
  },
};

export const NoAncestorBuild = {
  render: (args: any) => noAncestorBuild(args),
};

export const NoAncestorBuildTurboSnap = {
  render: (args: any) => noAncestorBuild({ ...args, turboSnap: {} }),
};
