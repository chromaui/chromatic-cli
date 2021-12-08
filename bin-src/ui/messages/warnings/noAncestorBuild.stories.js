import noAncestorBuild from './noAncestorBuild';

export default {
  title: 'CLI/Messages/Warnings',
  args: {
    build: { number: 123 },
  },
};

export const NoAncestorBuild = (args) => noAncestorBuild(args);

export const NoAncestorBuildTurboSnap = (args) => noAncestorBuild({ ...args, turboSnap: {} });
