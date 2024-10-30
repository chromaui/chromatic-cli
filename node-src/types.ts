import { InitialContext } from '.';
import GraphQLClient from './io/graphqlClient';
import HTTPClient from './io/httpClient';
import type { Configuration } from './lib/getConfiguration';
import { Environment } from './lib/getEnvironment';
import { Logger } from './lib/log';

type FilePath = string;

export interface Flags {
  // Required options
  projectToken?: string[] | string;

  // Storybook options
  buildScriptName?: string;
  buildCommand?: string;
  outputDir?: string[];
  storybookBuildDir?: string[];

  // E2E options
  playwright?: boolean;
  cypress?: boolean;

  // Chromatic options
  autoAcceptChanges?: string;
  branchName?: string;
  ci?: boolean;
  configFile?: string;
  exitOnceUploaded?: string;
  exitZeroOnChanges?: string;
  externals?: string[];
  ignoreLastBuildOnBranch?: string;
  onlyChanged?: string;
  onlyStoryFiles?: string[];
  onlyStoryNames?: string[];
  patchBuild?: string;
  repositorySlug?: string;
  skip?: string;
  storybookBaseDir?: string;
  storybookConfigDir?: string;
  untraced?: string[];
  zip?: boolean;
  skipUpdateCheck?: boolean;

  // Debug options
  debug?: boolean;
  diagnosticsFile?: string;
  dryRun?: boolean;
  fileHashing?: boolean;
  forceRebuild?: string;
  interactive?: boolean;
  junitReport?: string;
  list?: boolean;
  logFile?: string;
  logLevel?: 'silent' | 'error' | 'warn' | 'info' | 'debug';
  logPrefix?: string;
  storybookLogFile?: string;
  traceChanged?: string;
  uploadMetadata?: boolean;

  // Deprecated options (for JSDOM and tunneled builds, among others)
  allowConsoleErrors?: boolean;
  appCode?: string[];
  diagnostics?: boolean;
  only?: string;
  preserveMissing?: boolean;
}

export interface Options extends Configuration {
  projectToken: string;
  userToken?: string;

  configFile?: Flags['configFile'];
  logFile?: Flags['logFile'];
  logLevel?: Flags['logLevel'];
  logPrefix?: Flags['logPrefix'];
  onlyChanged: boolean | string;
  onlyStoryFiles: Flags['onlyStoryFiles'];
  onlyStoryNames: Flags['onlyStoryNames'];
  untraced: Flags['untraced'];
  externals: Flags['externals'];
  traceChanged: boolean | string;
  list: Flags['list'];
  fromCI: boolean;
  inAction: boolean;
  skip: boolean | string;
  dryRun: Flags['dryRun'];
  forceRebuild: boolean | string;
  debug: boolean;
  diagnosticsFile?: Flags['diagnosticsFile'];
  fileHashing: Flags['fileHashing'];
  interactive: boolean;
  junitReport?: Flags['junitReport'];
  uploadMetadata?: Flags['uploadMetadata'];
  zip: Flags['zip'];

  autoAcceptChanges: boolean | string;
  exitZeroOnChanges: boolean | string;
  exitOnceUploaded: boolean | string;
  isLocalBuild: boolean;
  ignoreLastBuildOnBranch: Flags['ignoreLastBuildOnBranch'];
  preserveMissingSpecs: boolean;
  originalArgv: string[];

  buildScriptName: Flags['buildScriptName'];
  buildCommand: Flags['buildCommand'];
  playwright: Flags['playwright'];
  cypress: Flags['cypress'];
  outputDir: string;
  allowConsoleErrors: Flags['allowConsoleErrors'];
  url?: string;
  storybookBuildDir: string;
  storybookBaseDir: Flags['storybookBaseDir'];
  storybookConfigDir: Flags['storybookConfigDir'];
  storybookLogFile: Flags['storybookLogFile'];

  ownerName: string;
  repositorySlug: Flags['repositorySlug'];
  branchName: string;
  patchHeadRef: string;
  patchBaseRef: string;

  /** A callback that is called at the start of each task */
  experimental_onTaskStart?: (ctx: Context) => void;

  /** A callback that is called if a task fails */
  experimental_onTaskError?: (
    ctx: InitialContext,
    { formattedError, originalError }: { formattedError: string; originalError: Error | Error[] }
  ) => void;

  /** A callback that is called during tasks that have incremental progress */
  experimental_onTaskProgress?: (
    ctx: Context,
    status: { progress: number; total: number; unit: string }
  ) => void;

  /** A callback that is called at the completion of each task */
  experimental_onTaskComplete?: (ctx: Context) => void;

  /** An AbortSignal that terminates the build if aborted */
  experimental_abortSignal?: AbortSignal;

  /** Logger object */
  log?: Logger;

  /** Sessiond Id */
  sessionId?: string;

  /** Environment variables */
  env?: Environment;

  skipUpdateCheck: Flags['skipUpdateCheck'];
}

export type TaskName =
  | 'auth'
  | 'gitInfo'
  | 'storybookInfo'
  | 'initialize'
  | 'build'
  | 'upload'
  | 'verify'
  | 'snapshot'
  | 'report'
  | 'prepareWorkspace'
  | 'restoreWorkspace';

export interface Context {
  env: Environment;
  log: Logger;
  pkg: {
    name: string;
    version: string;
    description: string;
    bugs: { url: string; email: string };
    docs: string;
  };
  sessionId: string;
  packageJson: Record<string, any>;
  packagePath: string;
  help: any;
  argv: string[];
  flags: Flags;
  extraOptions?: Partial<Options>;
  configuration: Configuration;
  options: Options;
  task: TaskName;
  title: string;
  skip?: boolean;
  skipSnapshots?: boolean;
  now?: number;
  startedAt?: number;
  activity?: { end: () => void };
  exitCode: number;
  exitCodeKey: string;
  userError?: boolean;
  runtimeErrors?: Error[];
  runtimeWarnings?: Error[];
  runtimeMetadata?: {
    nodePlatform: NodeJS.Platform;
    nodeVersion: string;
    packageManager?: 'npm' | 'pnpm' | 'yarn' | 'bun';
    packageManagerVersion?: string;
  };
  environment?: Record<string, string>;
  reportPath?: string;
  isPublishOnly?: boolean;
  isOnboarding: boolean;
  turboSnapAvailability?: string;

  http: HTTPClient;
  client: GraphQLClient;

  git: {
    version?: string;
    /** The current user's email as pre git config */
    gitUserEmail?: string;
    branch: string;
    commit: string;
    committerEmail?: string;
    committedAt: number;
    slug?: string;
    fromCI: boolean;
    ciService?: string;
    mergeCommit?: string;
    uncommittedHash?: string;
    parentCommits?: string[];
    baselineCommits?: string[];
    changedFiles?: string[];
    changedDependencyNames?: string[];
    replacementBuildIds?: [string, string][];
    matchesBranch?: (glob: boolean | string) => boolean;
    packageMetadataChanges?: { changedFiles: string[]; commit: string }[];
  };
  storybook: {
    version: string;
    configDir: string;
    staticDir: string[];
    viewLayer: string;
    addons: {
      name: string;
      packageName?: string;
      packageVersion?: string;
    }[];
    builder: {
      name: string;
      packageName?: string;
      packageVersion?: string;
    };
    mainConfigFilePath?: string;
  };
  storybookUrl?: string;
  announcedBuild: {
    id: string;
    number: number;
    status: string;
    autoAcceptChanges: boolean;
    reportToken: string;
    app: {
      id: string;
      turboSnapAvailability: string;
    };
  };
  build: {
    id: string;
    number: number;
    status: string;
    webUrl: string;
    storybookUrl: string;
    reportToken?: string;
    inheritedCaptureCount: number;
    actualCaptureCount: number;
    actualTestCount: number;
    specCount: number;
    componentCount: number;
    testCount: number;
    changeCount: number;
    errorCount: number;
    interactionTestFailuresCount: number;
    inProgressCount?: number;
    autoAcceptChanges: boolean;
    turboSnapEnabled?: boolean;
    wasLimited?: boolean;
    startedAt?: number;
    completedAt?: number;
    app: {
      manageUrl: string;
      setupUrl: string;
      account?: {
        exceededThreshold: boolean;
        paymentRequired: boolean;
        billingUrl: string;
      };
      repository?: {
        provider: string;
      };
    };
    features?: {
      uiTests: boolean;
      uiReview: boolean;
    };
    tests?: {
      spec: {
        name: string;
        component: { name: string; displayName: string };
      };
      parameters: {
        viewport: number;
        viewportIsDefault: boolean;
      };
      mode: {
        id: string;
        name: string;
      };
    }[];
  };
  rebuildForBuild: {
    id: string;
    status: string;
    webUrl: string;
    storybookUrl: string;
  };
  sourceDir: string;
  buildCommand?: string;
  buildLogFile?: string;
  fileInfo?: {
    paths: string[];
    hashes?: Record<FilePath, string>;
    statsPath: string;
    lengths: {
      knownAs: string;
      pathname: string;
      contentLength: number;
    }[];
    total: number;
  };
  sentinelUrls?: string[];
  uploadedBytes?: number;
  uploadedFiles?: number;
  turboSnap?: TurboSnap;
  mergeBase?: string;
  onlyStoryFiles?: string[];
  untracedFiles?: string[];
  rebuildForBuildId?: string;
}

export interface Task {
  status?: string;
  title: string;
  output?: string;
}

export interface Reason {
  moduleName: string;
}
export interface Module {
  id: string | number | null;
  name: string;
  modules?: Pick<Module, 'name'>[];
  reasons?: Reason[];
}
export interface Stats {
  modules: Module[];
}

export interface FileDesc {
  contentHash?: string;
  contentLength: number;
  localPath: string;
  targetPath: string;
}

export interface TargetInfo {
  contentType: string;
  fileKey: string;
  filePath: string;
  formAction: string;
  formFields: Record<string, string>;
}

export interface TurboSnap {
  unavailable?: boolean;
  rootPath?: string;
  baseDir?: string;
  storybookDir?: string;
  staticDirs?: string[];
  globs?: string[];
  modules?: string[];
  tracedFiles?: string[];
  tracedPaths?: Set<string>;
  changedDependencyNames?: Set<string>;
  changedManifestFiles?: Set<string>;
  affectedModuleIds?: Set<string | number>;
  bailReason?: {
    changedPackageFiles?: string[];
    changedStorybookFiles?: string[];
    changedStaticFiles?: string[];
    changedExternalFiles?: string[];
    invalidChangedFiles?: true;
    packageAndLockFilesOutOfSync?: true;
    missingStatsFile?: true;
    noAncestorBuild?: true;
    rebuild?: true;
  };
}

export { type Configuration } from './lib/getConfiguration';
