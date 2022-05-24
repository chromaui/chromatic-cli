import { Response, RequestInit } from 'node-fetch';
import { Env } from './lib/getEnv';
import { Logger } from './lib/log';

export interface Flags {
  // Required options
  projectToken?: string[];

  // Storybook options
  buildScriptName?: string;
  outputDir?: string[];
  storybookBuildDir?: string[];

  // Chromatic options
  autoAcceptChanges?: string;
  branchName?: string;
  ci?: boolean;
  exitOnceUploaded?: string;
  exitZeroOnChanges?: string;
  externals?: string[];
  ignoreLastBuildOnBranch?: string;
  only?: string;
  onlyChanged?: string;
  patchBuild?: string;
  preserveMissing?: boolean;
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

  // Deprecated options (for JSDOM and tunneled builds)
  allowConsoleErrors?: boolean;
  appCode?: string[];
  doNotStart?: boolean;
  exec?: string;
  scriptName?: string;
  storybookPort?: string;
  storybookUrl?: string;
  storybookHttps?: boolean;
  storybookCert?: string;
  storybookKey?: string;
  storybookCa?: string;
}

export interface Options {
  projectToken: string;

  only: Flags['only'];
  onlyChanged: true | string;
  untraced: Flags['untraced'];
  externals: Flags['externals'];
  traceChanged: true | string;
  list: Flags['list'];
  fromCI: boolean;
  skip: true | string;
  dryRun: Flags['dryRun'];
  forceRebuild: true | string;
  verbose: boolean;
  interactive: boolean;
  junitReport: true | string;
  zip: Flags['zip'];

  autoAcceptChanges: true | string;
  exitZeroOnChanges: true | string;
  exitOnceUploaded: true | string;
  ignoreLastBuildOnBranch: Flags['ignoreLastBuildOnBranch'];
  preserveMissingSpecs: boolean;
  originalArgv: string[];

  buildScriptName: Flags['buildScriptName'];
  outputDir: string;
  allowConsoleErrors: Flags['allowConsoleErrors'];
  scriptName: string;
  exec: Flags['exec'];
  noStart: Flags['doNotStart'];
  https: {
    cert: Flags['storybookCert'];
    key: Flags['storybookKey'];
    ca: Flags['storybookCa'];
  };
  url?: string;
  port: Flags['storybookPort'];
  storybookBuildDir: string;
  storybookBaseDir: Flags['storybookBaseDir'];
  storybookConfigDir: Flags['storybookConfigDir'];
  storybookUrl: Flags['storybookUrl'];
  createTunnel: boolean;
  useTunnel?: boolean;

  ownerName: string;
  branchName: string;
  patchHeadRef: string;
  patchBaseRef: string;
}

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
  options: Options;
  title: string;
  skip?: boolean;
  skipSnapshots?: boolean;
  now?: number;
  startedAt?: number;
  exitCode: number;
  exitCodeKey: string;
  userError?: boolean;
  runtimeErrors?: Error[];
  runtimeWarnings?: Error[];
  environment?: string;
  reportPath?: string;
  stopApp?: () => void;
  closeTunnel?: () => void;
  isPublishOnly?: boolean;
  isOnboarding?: boolean;

  http: {
    fetch: (url: string, options?: RequestInit, opts?: any) => Promise<Response>;
  };
  client: {
    runQuery: <T>(
      query: string,
      variables?: any,
      options?: { retries?: number; headers?: Record<string, string> }
    ) => Promise<T>;
    setAuthorization: (token: string) => void;
  };

  git: {
    version: string;
    branch: string;
    commit: string;
    committedAt: number;
    slug?: string;
    parentCommits?: string[];
    changedFiles?: string[];
    replacementBuildIds?: [string, string][];
    matchesBranch?: (glob: true | string) => boolean;
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
  };
  spawnParams: {
    client: 'yarn' | 'npm';
    clientVersion: string;
    nodeVersion: string;
    platform: string;
    command: string;
    clientArgs: string[];
    scriptArgs: string[];
  };
  isolatorUrl: string;
  cachedUrl: string;
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
    inProgressCount?: number;
    autoAcceptChanges: boolean;
    app: {
      setupUrl: string;
      repository?: {
        provider: string;
      };
    };
    tests?: {
      spec: {
        name: string;
        component: { displayName: string };
      };
      parameters: {
        viewport: number;
        viewportIsDefault: boolean;
      };
    }[];
  };
  sourceDir: string;
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
    rootPath: string;
    baseDir: string;
    storybookDir: string;
    staticDirs: string[];
    globs: string[];
    modules: string[];
    tracedFiles: string[];
    tracedPaths: Set<string>;
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
  onlyStoryFiles?: Record<string, string[]>;
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
