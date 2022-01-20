import meow from 'meow';

import pkg from '../../package.json';

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

export default function parseArgs(argv: string[]) {
  const { input, flags, help } = meow(
    `
    Chromatic CLI
      https://www.chromatic.com/docs/cli

    Usage
      $ chromatic --project-token <token>

    Required options
      --project-token, -t <token>               The unique code for your project. Alternatively, set CHROMATIC_PROJECT_TOKEN.

    Storybook options
      --build-script-name, -b [name]            The npm script that builds your Storybook we should take snapshots against. Use this if your Storybook build script is named differently. [build-storybook]
      --output-dir, -o <dirname>                Relative path to target directory for building your Storybook, in case you want to preserve it. Otherwise a temporary directory is used if possible.
      --storybook-build-dir, -d <dirname>       If you have already built your Storybook, provide the path to the static build directory.

    Chromatic options
      --auto-accept-changes [branch]            If there are any changes to the build, automatically accept them. Only for [branch], if specified. Globs are supported via picomatch.
      --branch-name <branch>                    Override the branch name. Only meant to be used for unsupported CI integrations and fixing cross-fork PR comparisons. Also accepts <owner>:<branch> format.
      --ci                                      Mark this build as a CI build. Alternatively, set the 'CI' environment variable (present in most CI systems). This option implies --no-interactive.
      --exit-once-uploaded [branch]             Exit with 0 once the built version has been published to Chromatic. Only for [branch], if specified. Globs are supported via picomatch.
      --exit-zero-on-changes [branch]           If all snapshots render but there are visual changes, exit with code 0 rather than the usual exit code 1. Only for [branch], if specified. Globs are supported via picomatch.
      --externals <filepath>                    Disable TurboSnap when any of these files have changed since the baseline build. Globs are supported via picomatch. This flag can be specified multiple times. Requires --only-changed.
      --ignore-last-build-on-branch <branch>    Do not use the last build on this branch as a baseline if it is no longer in history (i.e. branch was rebased). Globs are supported via picomatch.
      --only-changed [branch]                   Enables TurboSnap: Only run stories affected by files changed since the baseline build. Only for [branch], if specified. Globs are supported via picomatch. All other snapshots will be inherited from the prior commit.
      --patch-build <headbranch...basebranch>   Create a patch build to fix a missing PR comparison.
      --preserve-missing                        Treat missing stories as unchanged rather than deleted when comparing to the baseline.
      --skip [branch]                           Skip Chromatic tests, but mark the commit as passing. Avoids blocking PRs due to required merge checks. Only for [branch], if specified. Globs are supported via picomatch.
      --storybook-base-dir <dirname>            Relative path from repository root to Storybook project root. Use with --only-changed and --storybook-build-dir when your Storybook is located in a subdirectory of your repository.
      --storybook-config-dir <dirname>          Relative path from where you run Chromatic to your Storybook config directory ('.storybook'). Use with --only-changed and --storybook-build-dir when using a custom --config-dir (-c) flag for Storybook. [.storybook]
      --untraced <filepath>                     Disregard these files and their dependencies when tracing dependent stories for TurboSnap. Globs are supported via picomatch. This flag can be specified multiple times. Requires --only-changed.
      --zip                                     Publish your Storybook to Chromatic as a single zip file instead of individual content files.

    Debug options
      --debug                       Output verbose debugging information. This option implies --no-interactive.
      --diagnostics                 Write process context information to chromatic-diagnostics.json.
      --dry-run                     Run without actually publishing to Chromatic.
      --force-rebuild [branch]      Do not skip build when a rebuild is detected. Only for [branch], if specified. Globs are supported via picomatch.
      --junit-report [filepath]     Write build results to a JUnit XML file. {buildNumber} will be replaced with the actual build number. [chromatic-build-{buildNumber}.xml]
      --list                        List available stories. This requires running a full build.
      --no-interactive              Don't ask interactive questions about your setup and don't overwrite output. Always true in non-TTY environments.
      --only <storypath>            Only run a single story or a subset of stories. Story paths typically look like "Path/To/Story". Globs are supported via picomatch. This option implies --preserve-missing.
      --trace-changed [mode]        Print dependency trace for changed files to affected story files. Set to "expanded" to list individual modules. Requires --only-changed.

    Deprecated options
      --app-code <token>            Renamed to --project-token.
      --allow-console-errors        Continue running Chromatic even if there are errors logged to console in your Storybook.
      --script-name, -s [name]      The npm script that starts your Storybook. [storybook]
      --exec, -e <command>          Alternatively, a shell command that starts your Storybook.
      --do-not-start, -S            Don't attempt to start or build Storybook. Use this if your Storybook is already running, for example when part of a larger app.
      --storybook-port, -p <port>   What port is your Storybook running on. Auto detected from the npm script when using --script-name.
      --storybook-https             Enable if Storybook is running on HTTPS (locally). Auto detected from the npm script when using --script-name.
      --storybook-cert <path>       Use with --storybook-https. Auto detected from the npm script when using --script-name.
      --storybook-key <path>        Use with --storybook-https. Auto detected from the npm script when using --script-name.
      --storybook-ca <ca>           Use with --storybook-https. Auto detected from the npm script when using --script-name.
      --storybook-url, -u <url>     Run against an online Storybook at some URL. This implies --do-not-start.
    `,
    {
      argv,
      booleanDefault: undefined,
      description: false,
      flags: {
        // Required options
        projectToken: { type: 'string', alias: 't', isMultiple: true },

        // Storybook options
        buildScriptName: { type: 'string', alias: 'b' },
        outputDir: { type: 'string', alias: 'o', isMultiple: true },
        storybookBuildDir: { type: 'string', alias: 'd', isMultiple: true },

        // Chromatic options
        autoAcceptChanges: { type: 'string' },
        branchName: { type: 'string' },
        ci: { type: 'boolean' },
        exitOnceUploaded: { type: 'string' },
        exitZeroOnChanges: { type: 'string' },
        externals: { type: 'string', isMultiple: true },
        ignoreLastBuildOnBranch: { type: 'string' },
        only: { type: 'string' },
        onlyChanged: { type: 'string' },
        patchBuild: { type: 'string' },
        preserveMissing: { type: 'boolean' },
        skip: { type: 'string' },
        storybookBaseDir: { type: 'string' },
        storybookConfigDir: { type: 'string' },
        untraced: { type: 'string', isMultiple: true },
        zip: { type: 'boolean' },

        // Debug options
        debug: { type: 'boolean' },
        diagnostics: { type: 'boolean' },
        dryRun: { type: 'boolean' },
        forceRebuild: { type: 'string' },
        junitReport: { type: 'string' },
        list: { type: 'boolean' },
        interactive: { type: 'boolean', default: true },
        traceChanged: { type: 'string' },

        // Deprecated options (for JSDOM and tunneled builds)
        allowConsoleErrors: { type: 'boolean' },
        appCode: { type: 'string', alias: 'a', isMultiple: true }, // kept for backwards compatibility
        doNotStart: { type: 'boolean', alias: 'S' }, // assumes already started
        exec: { type: 'string', alias: 'e' }, // aka commandName; start via spawn
        scriptName: { type: 'string', alias: 's' }, // start via npm/yarn run
        storybookPort: { type: 'string', alias: 'p' },
        storybookUrl: { type: 'string', alias: 'u' },
        storybookHttps: { type: 'boolean' },
        storybookCert: { type: 'string' },
        storybookKey: { type: 'string' },
        storybookCa: { type: 'string' },
      },
    }
  );

  return { argv, input, flags, help, pkg };
}
