import { environment, options } from '../../renderer/storybook/fixtures';
import task from '../components/task';
import { BuildHasChangesNotOnboarding } from '../messages/errors/buildHasChanges.stories';
import { BuildPassed, FirstBuildPassed } from '../messages/info/buildPassed.stories';
import { Intro } from '../messages/info/intro.stories';
import { StorybookPublished } from '../messages/info/storybookPublished.stories';
import { authenticated, authenticating, initial } from '../tasks/auth';
import * as build from '../tasks/build.stories';
import {
  initial as gitInfoInitial,
  pending as gitInfoPending,
  success as gitInfoSuccess,
} from '../tasks/gitInfo';
import {
  initial as initializeInitial,
  pending as initializePending,
  success as initializeSuccess,
} from '../tasks/initialize';
import * as snapshot from '../tasks/snapshot.stories';
import {
  initial as storybookInfoInitial,
  pending as storybookInfoPending,
  success as storybookInfoSuccess,
} from '../tasks/storybookInfo';
import * as upload from '../tasks/upload.stories';
import * as verify from '../tasks/verify.stories';

const steps = (...steps) => steps.map((step) => task(step())).join('\n');

// Build the auth states from the raw task source: auth.stories now returns rendered ANSI strings
// (Clack capture), which the old task() path can't consume.
const auth = {
  Initial: () => initial,
  Authenticating: () => authenticating({ env: environment } as any),
  Authenticated: () => authenticated({ env: environment, options } as any),
};

// gitInfo.stories now returns rendered ANSI strings (Clack capture), which the old task() path
// can't consume, so rebuild the states the workflow needs from the raw task source.
const git = { commit: 'a32af7e265aa08e4a16d', branch: 'feat/new-ui', parentCommits: ['a', 'b'] };
const gitInfo = {
  Initial: () => gitInfoInitial,
  Pending: () => gitInfoPending(),
  Success: () => gitInfoSuccess({ git, options } as any),
};

// storybookInfo.stories now returns rendered ANSI strings (Clack capture), which the old task()
// path can't consume, so rebuild the states the workflow needs from the raw task source.
const storybookInfoContext = { options: {} } as any;
const storybookInfo = {
  Initial: () => storybookInfoInitial(storybookInfoContext),
  Pending: () => storybookInfoPending(storybookInfoContext),
  Success: () => storybookInfoSuccess(storybookInfoContext),
};

// initialize.stories now returns rendered ANSI strings (Clack capture), which the old task() path
// can't consume, so rebuild the states the workflow needs from the raw task source.
const announcedBuild = { number: 42 };
const initialize = {
  Initial: () => initializeInitial,
  Pending: () => initializePending(),
  Success: () => initializeSuccess({ announcedBuild } as any),
};

export default {
  title: 'CLI/Workflows/UploadBuild',
  decorators: [(storyFunction) => storyFunction().join('\n\n')],
};

export const Initial = () => [
  Intro(),
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
  Intro(),
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
  Intro(),
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
  Intro(),
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
  Intro(),
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
  Intro(),
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
  Intro(),
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
  Intro(),
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
  Intro(),
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
  Intro(),
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
  BuildPassed(),
];

export const ChangesFound = () => [
  Intro(),
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
  BuildHasChangesNotOnboarding(),
];

export const FirstBuild = () => [
  Intro(),
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
  FirstBuildPassed(),
];

export const Published = () => [
  Intro(),
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
  StorybookPublished(),
];
