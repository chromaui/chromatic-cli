import task from '../components/task';
import * as auth from '../tasks/auth.stories';
import * as build from '../tasks/build.stories';
import * as gitInfo from '../tasks/gitInfo.stories';
import * as snapshot from '../tasks/snapshot.stories';
import * as storybookInfo from '../tasks/storybookInfo.stories';
import * as upload from '../tasks/upload.stories';
import * as verify from '../tasks/verify.stories';

export default {
  title: 'CLI/Workflows/UploadBuild',
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
  build.Initial,
  upload.Initial,
  verify.Initial,
  snapshot.Initial,
];

export const Authenticating = () => [
  auth.Authenticating,
  gitInfo.Initial,
  storybookInfo.Initial,
  build.Initial,
  upload.Initial,
  verify.Initial,
  snapshot.Initial,
];

export const RetrievingGitInfo = () => [
  auth.Authenticated,
  gitInfo.Pending,
  storybookInfo.Initial,
  build.Initial,
  upload.Initial,
  verify.Initial,
  snapshot.Initial,
];

export const RetrievingStorybookInfo = () => [
  auth.Authenticated,
  gitInfo.Success,
  storybookInfo.Pending,
  build.Initial,
  upload.Initial,
  verify.Initial,
  snapshot.Initial,
];

export const Building = () => [
  auth.Authenticated,
  gitInfo.Success,
  storybookInfo.Success,
  build.Building,
  upload.Initial,
  verify.Initial,
  snapshot.Initial,
];

export const Uploading = () => [
  auth.Authenticated,
  gitInfo.Success,
  storybookInfo.Success,
  build.Built,
  upload.Uploading,
  verify.Initial,
  snapshot.Initial,
];

export const Verifying = () => [
  auth.Authenticated,
  gitInfo.Success,
  storybookInfo.Success,
  build.Built,
  upload.Success,
  verify.Pending,
  snapshot.Initial,
];

export const Snapshotting = () => [
  auth.Authenticated,
  gitInfo.Success,
  storybookInfo.Success,
  build.Built,
  upload.Success,
  verify.Published,
  snapshot.Pending,
];

export const Passed = () => [
  auth.Authenticated,
  gitInfo.Success,
  storybookInfo.Success,
  build.Built,
  upload.Success,
  verify.Published,
  snapshot.BuildPassed,
];
