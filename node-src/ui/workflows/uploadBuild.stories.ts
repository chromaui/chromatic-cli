import task from '../components/task';
import * as buildHasChanges from '../messages/errors/buildHasChanges.stories';
import * as buildPassed from '../messages/info/buildPassed.stories';
import * as intro from '../messages/info/intro.stories';
import * as storybookPublished from '../messages/info/storybookPublished.stories';
import * as auth from '../tasks/auth.stories';
import * as build from '../tasks/build.stories';
import * as gitInfo from '../tasks/gitInfo.stories';
import * as initialize from '../tasks/initialize.stories';
import * as snapshot from '../tasks/snapshot.stories';
import * as storybookInfo from '../tasks/storybookInfo.stories';
import * as upload from '../tasks/upload.stories';
import * as verify from '../tasks/verify.stories';

const steps = (...steps) => steps.map((step) => task(step())).join('\n');

export default {
  title: 'CLI/Workflows/UploadBuild',
  decorators: [(storyFunction) => storyFunction().join('\n\n')],
};

export const Initial = () => [
  intro.default.render(intro.default.args),
  steps(
    auth.Initial,
    gitInfo.Initial,
    storybookInfo.Initial,
    initialize.Initial,
    build.Initial,
    upload.Initial,
    verify.Initial,
    snapshot.Initial
  ),
];

export const Authenticating = () => [
  intro.default.render(intro.default.args),
  steps(
    auth.Authenticating,
    gitInfo.Initial,
    storybookInfo.Initial,
    initialize.Initial,
    build.Initial,
    upload.Initial,
    verify.Initial,
    snapshot.Initial
  ),
];

export const RetrievingGitInfo = () => [
  intro.default.render(intro.default.args),
  steps(
    auth.Authenticated,
    gitInfo.Pending,
    storybookInfo.Initial,
    initialize.Initial,
    build.Initial,
    upload.Initial,
    verify.Initial,
    snapshot.Initial
  ),
];

export const RetrievingStorybookInfo = () => [
  intro.default.render(intro.default.args),
  steps(
    auth.Authenticated,
    gitInfo.Success,
    storybookInfo.Pending,
    initialize.Initial,
    build.Initial,
    upload.Initial,
    verify.Initial,
    snapshot.Initial
  ),
];

export const Initializing = () => [
  intro.default.render(intro.default.args),
  steps(
    auth.Authenticated,
    gitInfo.Success,
    storybookInfo.Success,
    initialize.Pending,
    build.Initial,
    upload.Initial,
    verify.Initial,
    snapshot.Initial
  ),
];

export const Building = () => [
  intro.default.render(intro.default.args),
  steps(
    auth.Authenticated,
    gitInfo.Success,
    storybookInfo.Success,
    initialize.Success,
    build.Building,
    upload.Initial,
    verify.Initial,
    snapshot.Initial
  ),
];

export const Uploading = () => [
  intro.default.render(intro.default.args),
  steps(
    auth.Authenticated,
    gitInfo.Success,
    storybookInfo.Success,
    initialize.Success,
    build.Built,
    upload.Uploading,
    verify.Initial,
    snapshot.Initial
  ),
];

export const Verifying = () => [
  intro.default.render(intro.default.args),
  steps(
    auth.Authenticated,
    gitInfo.Success,
    storybookInfo.Success,
    initialize.Success,
    build.Built,
    upload.Success,
    verify.Pending,
    snapshot.Initial
  ),
];

export const Snapshotting = () => [
  intro.default.render(intro.default.args),
  steps(
    auth.Authenticated,
    gitInfo.Success,
    storybookInfo.Success,
    initialize.Success,
    build.Built,
    upload.Success,
    verify.Published,
    snapshot.Pending
  ),
];

export const Passed = () => [
  intro.default.render(intro.default.args),
  steps(
    auth.Authenticated,
    gitInfo.Success,
    storybookInfo.Success,
    initialize.Success,
    build.Built,
    upload.Success,
    verify.Published,
    snapshot.BuildPassed
  ),
  buildPassed.default.render(buildPassed.BuildPassed.args as any),
];

export const ChangesFound = () => [
  intro.default.render(intro.default.args),
  steps(
    auth.Authenticated,
    gitInfo.Success,
    storybookInfo.Success,
    initialize.Success,
    build.Built,
    upload.Success,
    verify.Published,
    snapshot.BuildComplete
  ),
  buildHasChanges.BuildHasChangesNotOnboarding(),
];

export const FirstBuild = () => [
  intro.default.render(intro.default.args),
  steps(
    auth.Authenticated,
    gitInfo.Success,
    storybookInfo.Success,
    initialize.Success,
    build.Built,
    upload.Success,
    verify.Published,
    snapshot.BuildAutoAccepted
  ),
  buildPassed.default.render(buildPassed.BuildPassed.args as any),
];

export const Published = () => [
  intro.default.render(intro.default.args),
  steps(
    auth.Authenticated,
    gitInfo.Success,
    storybookInfo.Success,
    initialize.Success,
    build.Built,
    upload.Success,
    verify.Published,
    snapshot.SkippedPublishOnly
  ),
  storybookPublished.default.render(storybookPublished.StorybookPublished.args as any),
];
