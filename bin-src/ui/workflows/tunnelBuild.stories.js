import task from '../components/task';
import { BuildPassed } from '../messages/info/buildPassed.stories';
import { Intro } from '../messages/info/intro.stories';
import * as auth from '../tasks/auth.stories';
import * as gitInfo from '../tasks/gitInfo.stories';
import * as snapshot from '../tasks/snapshot.stories';
import * as start from '../tasks/start.stories';
import * as storybookInfo from '../tasks/storybookInfo.stories';
import * as tunnel from '../tasks/tunnel.stories';
import * as verify from '../tasks/verify.stories';

const steps = (...arr) => arr.map((step) => task(step())).join('\n');

export default {
  title: 'CLI/Workflows/TunnelBuild',
  decorators: [(storyFn) => storyFn().join('\n\n')],
};

export const Initial = () => [
  Intro(),
  steps(
    auth.Initial,
    gitInfo.Initial,
    storybookInfo.Initial,
    start.Initial,
    tunnel.Initial,
    verify.Initial,
    snapshot.Initial
  ),
];

export const Authenticating = () => [
  Intro(),
  steps(
    auth.Authenticating,
    gitInfo.Initial,
    storybookInfo.Initial,
    start.Initial,
    tunnel.Initial,
    verify.Initial,
    snapshot.Initial
  ),
];

export const RetrievingGitInfo = () => [
  Intro(),
  steps(
    auth.Authenticated,
    gitInfo.Pending,
    storybookInfo.Initial,
    start.Initial,
    tunnel.Initial,
    verify.Initial,
    snapshot.Initial
  ),
];

export const RetrievingStorybookInfo = () => [
  Intro(),
  steps(
    auth.Authenticated,
    gitInfo.Success,
    storybookInfo.Pending,
    start.Initial,
    tunnel.Initial,
    verify.Initial,
    snapshot.Initial
  ),
];

export const Starting = () => [
  Intro(),
  steps(
    auth.Authenticated,
    gitInfo.Success,
    storybookInfo.Success,
    start.Starting,
    tunnel.Initial,
    verify.Initial,
    snapshot.Initial
  ),
];

export const OpeningTunnel = () => [
  Intro(),
  steps(
    auth.Authenticated,
    gitInfo.Success,
    storybookInfo.Success,
    start.Started,
    tunnel.Pending,
    verify.Initial,
    snapshot.Initial
  ),
];

export const Verifying = () => [
  Intro(),
  steps(
    auth.Authenticated,
    gitInfo.Success,
    storybookInfo.Success,
    start.Started,
    tunnel.Success,
    verify.Pending,
    snapshot.Initial
  ),
];

export const Snapshotting = () => [
  Intro(),
  steps(
    auth.Authenticated,
    gitInfo.Success,
    storybookInfo.Success,
    start.Started,
    tunnel.Success,
    verify.Published,
    snapshot.Pending
  ),
];

export const Passed = () => [
  Intro(),
  steps(
    auth.Authenticated,
    gitInfo.Success,
    storybookInfo.Success,
    start.Started,
    tunnel.Success,
    verify.Published,
    snapshot.BuildPassed
  ),
  BuildPassed(),
];
