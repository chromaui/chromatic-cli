import task from '../components/task';
import { BuildHasChanges } from '../messages/errors/buildHasChanges.stories';
import { BuildPassed, FirstBuildPassed } from '../messages/info/buildPassed.stories';
import { Intro } from '../messages/info/intro.stories';
import { StorybookPublished } from '../messages/info/storybookPublished.stories';
import * as auth from '../tasks/auth.stories';
import * as build from '../tasks/build.stories';
import * as gitInfo from '../tasks/gitInfo.stories';
import * as snapshot from '../tasks/snapshot.stories';
import * as storybookInfo from '../tasks/storybookInfo.stories';
import * as upload from '../tasks/upload.stories';
import * as verify from '../tasks/verify.stories';

const steps = (...arr) => arr.map((step) => task(step())).join('\n');

export default {
  title: 'CLI/Workflows/UploadBuild',
  decorators: [(storyFn) => storyFn().join('\n\n')],
};

export const Initial = () => [
  Intro(),
  steps(
    auth.Initial,
    gitInfo.Initial,
    storybookInfo.Initial,
    build.Initial,
    upload.Initial,
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
    build.Initial,
    upload.Initial,
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
    build.Initial,
    upload.Initial,
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
    build.Initial,
    upload.Initial,
    verify.Initial,
    snapshot.Initial
  ),
];

export const Building = () => [
  Intro(),
  steps(
    auth.Authenticated,
    gitInfo.Success,
    storybookInfo.Success,
    build.Building,
    upload.Initial,
    verify.Initial,
    snapshot.Initial
  ),
];

export const Uploading = () => [
  Intro(),
  steps(
    auth.Authenticated,
    gitInfo.Success,
    storybookInfo.Success,
    build.Built,
    upload.Uploading,
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
    build.Built,
    upload.Success,
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
    build.Built,
    upload.Success,
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
    build.Built,
    upload.Success,
    verify.Published,
    snapshot.BuildPassed
  ),
  BuildPassed(),
];

export const ChangesFound = () => [
  Intro(),
  steps(
    auth.Authenticated,
    gitInfo.Success,
    storybookInfo.Success,
    build.Built,
    upload.Success,
    verify.Published,
    snapshot.BuildComplete
  ),
  BuildHasChanges(),
];

export const FirstBuild = () => [
  Intro(),
  steps(
    auth.Authenticated,
    gitInfo.Success,
    storybookInfo.Success,
    build.Built,
    upload.Success,
    verify.Published,
    snapshot.BuildAutoAccepted
  ),
  FirstBuildPassed(),
];

export const Published = () => [
  Intro(),
  steps(
    auth.Authenticated,
    gitInfo.Success,
    storybookInfo.Success,
    build.Built,
    upload.Success,
    verify.Published,
    snapshot.SkippedPublishOnly
  ),
  StorybookPublished(),
];
