import task from '../components/task';
import * as auth from '../tasks/auth.stories';
import * as gitInfo from '../tasks/gitInfo.stories';
import * as snapshot from '../tasks/snapshot.stories';
import * as start from '../tasks/start.stories';
import * as storybookInfo from '../tasks/storybookInfo.stories';
import * as tunnel from '../tasks/tunnel.stories';
import * as verify from '../tasks/verify.stories';

export default {
  title: 'CLI/Workflows/TunnelBuild',
  decorators: [
    storyFn =>
      storyFn()
        .map(step => task(step()))
        .join('\n'),
  ],
};

export const Initial = () => [
  auth.Initial,
  gitInfo.Initial,
  storybookInfo.Initial,
  start.Initial,
  tunnel.Initial,
  verify.Initial,
  snapshot.Initial,
];

export const Authenticating = () => [
  auth.Authenticating,
  gitInfo.Initial,
  storybookInfo.Initial,
  start.Initial,
  tunnel.Initial,
  verify.Initial,
  snapshot.Initial,
];

export const RetrievingGitInfo = () => [
  auth.Authenticated,
  gitInfo.Pending,
  storybookInfo.Initial,
  start.Initial,
  tunnel.Initial,
  verify.Initial,
  snapshot.Initial,
];

export const RetrievingStorybookInfo = () => [
  auth.Authenticated,
  gitInfo.Success,
  storybookInfo.Pending,
  start.Initial,
  tunnel.Initial,
  verify.Initial,
  snapshot.Initial,
];

export const Starting = () => [
  auth.Authenticated,
  gitInfo.Success,
  storybookInfo.Success,
  start.Starting,
  tunnel.Initial,
  verify.Initial,
  snapshot.Initial,
];

export const OpeningTunnel = () => [
  auth.Authenticated,
  gitInfo.Success,
  storybookInfo.Success,
  start.Started,
  tunnel.Pending,
  verify.Initial,
  snapshot.Initial,
];

export const Verifying = () => [
  auth.Authenticated,
  gitInfo.Success,
  storybookInfo.Success,
  start.Started,
  tunnel.Success,
  verify.Pending,
  snapshot.Initial,
];

export const Snapshotting = () => [
  auth.Authenticated,
  gitInfo.Success,
  storybookInfo.Success,
  start.Started,
  tunnel.Success,
  verify.Published,
  snapshot.Pending,
];

export const Passed = () => [
  auth.Authenticated,
  gitInfo.Success,
  storybookInfo.Success,
  start.Started,
  tunnel.Success,
  verify.Published,
  snapshot.BuildPassed,
];
