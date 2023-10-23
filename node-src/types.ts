import { InitialContext } from '.';
import type { Configuration } from './lib/getConfiguration';
import { Env } from './lib/getEnv';
import { Logger } from './lib/log';
import HTTPClient from './io/HTTPClient';
import GraphQLClient from './io/GraphQLClient';

export interface Flags {
  // Required options
  projectToken?: string[] | string;

  // Storybook options
  buildScriptName?: string;
  outputDir?: string[];
  storybookBuildDir?: string[];

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

  // Debug options
  debug?: boolean;
  diagnostics?: boolean;
  dryRun?: boolean;
  forceRebuild?: string;
  junitReport?: string;
  list?: boolean;
  interactive?: boolean;
  traceChanged?: string;

  // Deprecated options (for JSDOM and tunneled builds, among others)
  allowConsoleErrors?: boolean;
  appCode?: string[];
  only?: string;
  preserveMissing?: boolean;
}

export interface Options {
  projectToken: string;

  configFile?: Flags['configFile'];
  onlyChanged: boolean | string;
  onlyStoryFiles: Flags['onlyStoryFiles'];
  onlyStoryNames: Flags['onlyStoryNames'];
  untraced: Flags['untraced'];
  externals: Flags['externals'];
  traceChanged: boolean | string;
  list: Flags['list'];
  fromCI: boolean;
  skip: boolean | string;
  dryRun: Flags['dryRun'];
  forceRebuild: boolean | string;
  debug: boolean;
  diagnostics: boolean;
  interactive: boolean;
  junitReport: boolean | string;
  zip: Flags['zip'];

  autoAcceptChanges: boolean | string;
  exitZeroOnChanges: boolean | string;
  exitOnceUploaded: boolean | string;
  isLocalBuild: boolean;
  ignoreLastBuildOnBranch: Flags['ignoreLastBuildOnBranch'];
  preserveMissingSpecs: boolean;
  originalArgv: string[];

  buildScriptName: Flags['buildScriptName'];
  outputDir: string;
  allowConsoleErrors: Flags['allowConsoleErrors'];
  url?: string;
  storybookBuildDir: string;
  storybookBaseDir: Flags['storybookBaseDir'];
  storybookConfigDir: Flags['storybookConfigDir'];

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
}

export { Configuration };

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
  env: Env;
  log: Logger;
  pkg: {
    name: string;
    version: string;
    description: string;
    bugs: { url: string; email: string };
    docs: string;
  };
  sessionId: string;
  packageJson: { [key: string]: any };
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
    version: string;
    /** The current user's email as pre git config */
    gitUserEmail: string;
    branch: string;
    commit: string;
    committerEmail?: string;
    committedAt: number;
    slug?: string;
    mergeCommit?: string;
    uncommittedHash?: string;
    parentCommits?: string[];
    baselineCommits?: string[];
    changedFiles?: string[];
    changedDependencyNames?: string[];
    replacementBuildIds?: [string, string][];
    matchesBranch?: (glob: boolean | string) => boolean;
    packageManifestChanges?: { changedFiles: string[]; commit: string }[];
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
  };
  isolatorUrl: string;
  cachedUrl: string;
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
    cachedUrl: string;
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
  sourceDir: string;
  buildCommand?: string;
  buildLogFile?: string;
  fileInfo?: {
    paths: string[];
    statsPath: string;
    lengths: {
      knownAs: string;
      pathname: string;
      contentLength: number;
    }[];
    total: number;
  };
  uploadedBytes?: number;
  turboSnap?: Partial<{
    unavailable?: boolean;
    rootPath: string;
    baseDir: string;
    storybookDir: string;
    staticDirs: string[];
    globs: string[];
    modules: string[];
    tracedFiles: string[];
    tracedPaths: Set<string>;
    changedDependencyNames: Set<string>;
    changedManifestFiles: Set<string>;
    affectedModuleIds: Set<string | number>;
    bailReason: {
      changedPackageFiles?: string[];
      changedStorybookFiles?: string[];
      changedStaticFiles?: string[];
      changedExternalFiles?: string[];
      invalidChangedFiles?: true;
      missingStatsFile?: true;
      noAncestorBuild?: true;
      rebuild?: true;
    };
  }>;
  mergeBase?: string;
  onlyStoryFiles?: string[];
  untracedFiles?: string[];
  rebuildForBuildId?: string;
}

export interface Task {
  status: string;
  title: string;
  output?: string;
}

export interface Reason {
  moduleName: string;
}
export interface Module {
  id: string | number;
  name: string;
  modules?: Pick<Module, 'name'>[];
  reasons?: Reason[];
}
export interface Stats {
  modules: Module[];
}
