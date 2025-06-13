import task from '../components/task';
import * as buildHasChanges from '../messages/errors/buildHasChanges.stories';
import * as buildPassedE2E from '../messages/info/buildPassedE2E.stories';
import * as intro from '../messages/info/intro.stories';
import * as storybookPublishedE2E from '../messages/info/storybookPublishedE2E.stories';
import * as auth from '../tasks/auth.stories';
import * as build from '../tasks/buildE2E.stories';
import * as gitInfo from '../tasks/gitInfo.stories';
import * as initialize from '../tasks/initialize.stories';
import * as snapshot from '../tasks/snapshotE2E.stories';
import * as storybookInfo from '../tasks/storybookInfoE2E.stories';
import * as upload from '../tasks/uploadE2E.stories';
import * as verify from '../tasks/verifyE2E.stories';

const ctx = { options: { playwright: true } } as any;
const steps = (...steps) => steps.map((step) => task(step(ctx))).join('\n');

export default {
  title: 'CLI/Workflows/UploadBuildE2E',
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
    storybookInfo.SuccessPlaywright,
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
    storybookInfo.SuccessPlaywright,
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
    storybookInfo.SuccessPlaywright,
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
    storybookInfo.SuccessPlaywright,
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
    storybookInfo.SuccessPlaywright,
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
    storybookInfo.SuccessPlaywright,
    initialize.Success,
    build.Built,
    upload.Success,
    verify.Published,
    snapshot.BuildPassed
  ),
  buildPassedE2E.default.render(buildPassedE2E.default.args),
];

export const ChangesFound = () => [
  intro.default.render(intro.default.args),
  steps(
    auth.Authenticated,
    gitInfo.Success,
    storybookInfo.SuccessPlaywright,
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
    storybookInfo.SuccessPlaywright,
    initialize.Success,
    build.Built,
    upload.Success,
    verify.Published,
    snapshot.BuildAutoAccepted
  ),
  buildPassedE2E.default.render(buildPassedE2E.default.args),
];

export const Published = () => [
  intro.default.render(intro.default.args),
  steps(
    auth.Authenticated,
    gitInfo.Success,
    storybookInfo.SuccessPlaywright,
    initialize.Success,
    build.Built,
    upload.Success,
    verify.Published,
    snapshot.SkippedPublishOnly
  ),
  storybookPublishedE2E.default.render(storybookPublishedE2E.StorybookPublished.args),
];
