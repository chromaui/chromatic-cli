import meow from 'meow';

import pkg from '../../package.json';
import { Flags } from '../types';

/**
 * Parse arguments passed to the CLI.
 *
 * @param argv An array of arguments passed from the user.
 *
 * @returns An object containing the parsed arguments.
 */
export default function parseArguments(argv: string[]) {
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
      --build-command <command>                 The command that builds your Storybook we should take snapshots against. Use this if your Storybook build command does not exist in "scripts" of your package.json (like using NX). Requires --output-dir.
      --output-dir, -o <dirname>                Relative path to target directory for building your Storybook, in case you want to preserve it. Otherwise a temporary directory is used if possible.
      --storybook-build-dir, -d <dirname>       If you have already built your Storybook, provide the path to the static build directory.

    Chromatic options
      --auto-accept-changes [branch]            If there are any changes to the build, automatically accept them. Only for [branch], if specified. Globs are supported via picomatch.
      --branch-name <branch>                    Override the branch name. Only meant to be used for unsupported CI integrations and fixing cross-fork PR comparisons. Also accepts <owner>:<branch> format.
      --ci                                      Mark this build as a CI build. Alternatively, set the 'CI' environment variable (present in most CI systems). This option implies --no-interactive.
      --config-file, -c <path>                  Path to a configuration file containing the options listed in JSON format. Uses "chromatic.config.json" by default.
      --exit-once-uploaded [branch]             Exit with 0 once the built version has been published to Chromatic. Only for [branch], if specified. Globs are supported via picomatch.
      --exit-zero-on-changes [branch]           If all snapshots render but there are visual changes, exit with code 0 rather than the usual exit code 1. Only for [branch], if specified. Globs are supported via picomatch.
      --externals <filepath>                    Disable TurboSnap when any of these files have changed since the baseline build. Globs are supported via picomatch. This flag can be specified multiple times. Requires --only-changed.
      --ignore-last-build-on-branch <branch>    Do not use the last build on this branch as a baseline if it is no longer in history (i.e. branch was rebased). Globs are supported via picomatch.
      --only-changed [branch]                   Enables TurboSnap: Only run stories affected by files changed since the baseline build. Only for [branch], if specified. Globs are supported via picomatch. All other snapshots will be inherited from the prior commit.
      --only-story-files <filepath>             Only run a single story or a subset of stories by their filename(s). Specify the full path to the story file relative to the root of your Storybook project. Globs are supported via picomatch. This flag can be specified multiple times.
      --only-story-names <storypath>            Only run a single story or a subset of stories. Story paths typically look like "Path/To/Story". Globs are supported via picomatch. This flag can be specified multiple times.
      --patch-build <headbranch...basebranch>   Create a patch build to fix a missing PR comparison.
      --repository-slug <slug>                  Override the repository slug. Only meant to be used for unsupported CI integrations and fixing cross-fork PR comparisons. Format: <ownerName>/<repoName>.
      --skip [branch]                           Skip Chromatic tests, but mark the commit as passing. Avoids blocking PRs due to required merge checks. Only for [branch], if specified. Globs are supported via picomatch.
      --storybook-base-dir <dirname>            Relative path from repository root to Storybook project root. Use with --only-changed and --storybook-build-dir when running Chromatic from a different directory than your Storybook.
      --storybook-config-dir <dirname>          Relative path from where you run Chromatic to your Storybook config directory ('.storybook'). Use with --only-changed and --storybook-build-dir when using a custom --config-dir (-c) flag for Storybook. [.storybook]
      --untraced <filepath>                     Disregard these files and their dependencies when tracing dependent stories for TurboSnap. Globs are supported via picomatch. This flag can be specified multiple times. Requires --only-changed.
      --zip                                     Publish your Storybook to Chromatic as a single zip file instead of individual content files.
      --skip-update-check                       Skip checking for available Chromatic package update.

    Debug options
      --debug                          Output verbose debugging information. This option implies --no-interactive, --diagnostics-file, --log-file.
      --diagnostics-file [filepath]    Write process context information to a JSON file. Disable via --no-diagnostics-file. [chromatic-diagnostics.json]
      --dry-run                        Run without actually publishing to Chromatic.
      --force-rebuild [branch]         Do not skip build when a rebuild is detected. Only for [branch], if specified. Globs are supported via picomatch.
      --junit-report [filepath]        Write build results to a JUnit XML file. {buildNumber} will be replaced with the actual build number. [chromatic-build-{buildNumber}.xml]
      --list                           List available stories. This requires running a full build.
      --log-file [filepath]            Write log output to a file. Disable via --no-log-file. [chromatic.log]
      --log-level <level>              One of "silent", "error", "warn", "info", "debug". Defaults to "info".
      --log-prefix <prefix>            Prefix for each log line. Defaults to current timestamp except in interactive mode. Set to "" to disable.
      --no-file-hashing                Disable file hashing. This will cause all files to be uploaded on every build.
      --no-interactive                 Don't ask interactive questions about your setup and don't overwrite output. Always true in non-TTY environments.
      --storybook-log-file [filepath]  Write Storybook build output to a file. Disable via --no-storybook-log-file. [storybook-build.log]
      --trace-changed [mode]           Print dependency trace for changed files to affected story files. Set to "expanded" to list individual modules. Requires --only-changed.
      --upload-metadata                Upload Chromatic metadata files as part of the published Storybook. Includes diagnostics and log files, among others. This option enables --diagnostics-file, --log-file and --storybook-log-file, unless explicitly disabled via the 'no-' prefix.

    Deprecated options
      --app-code <token>            Renamed to --project-token.
      --allow-console-errors        Continue running Chromatic even if there are errors logged to console in your Storybook.
      --diagnostics                 Renamed to --diagnostics-file.
      --only                        Superceded by --only-story-names.
      --preserve-missing            Treat missing stories as unchanged rather than deleted when comparing to the baseline.
    `,
    {
      argv,
      booleanDefault: undefined,
      description: false,

      // Prevent meow from parsing the project's package.json file because if the `version` field
      // isn't a proper semver string, the process silently exits.
      pkg: {},

      version: pkg.version,
      flags: {
        // Required options
        projectToken: { type: 'string', alias: 't', isMultiple: true },

        // Storybook options
        buildScriptName: { type: 'string', alias: 'b' },
        buildCommand: { type: 'string' },
        outputDir: { type: 'string', alias: 'o', isMultiple: true },
        storybookBuildDir: { type: 'string', alias: 'd', isMultiple: true },

        // Chromatic options
        autoAcceptChanges: { type: 'string' },
        branchName: { type: 'string' },
        ci: { type: 'boolean' },
        configFile: { type: 'string', alias: 'c' },
        exitOnceUploaded: { type: 'string' },
        exitZeroOnChanges: { type: 'string' },
        externals: { type: 'string', isMultiple: true },
        ignoreLastBuildOnBranch: { type: 'string' },
        onlyChanged: { type: 'string' },
        onlyStoryFiles: { type: 'string', isMultiple: true },
        onlyStoryNames: { type: 'string', isMultiple: true },
        patchBuild: { type: 'string' },
        repositorySlug: { type: 'string' },
        skip: { type: 'string' },
        storybookBaseDir: { type: 'string' },
        storybookConfigDir: { type: 'string' },
        untraced: { type: 'string', isMultiple: true },
        zip: { type: 'boolean' },

        // Debug options
        debug: { type: 'boolean' },
        diagnosticsFile: { type: 'string' },
        dryRun: { type: 'boolean' },
        fileHashing: { type: 'boolean', default: true },
        forceRebuild: { type: 'string' },
        interactive: { type: 'boolean', default: true },
        junitReport: { type: 'string' },
        list: { type: 'boolean' },
        logFile: { type: 'string' },
        logLevel: { type: 'string', choices: ['silent', 'error', 'warn', 'info', 'debug'] },
        logPrefix: { type: 'string' },
        storybookLogFile: { type: 'string' },
        traceChanged: { type: 'string' },
        uploadMetadata: { type: 'boolean' },

        // Deprecated options (for JSDOM and tunneled builds, among others)
        allowConsoleErrors: { type: 'boolean' },
        appCode: { type: 'string', alias: 'a', isMultiple: true }, // kept for backwards compatibility
        diagnostics: { type: 'boolean' },
        only: { type: 'string' },
        preserveMissing: { type: 'boolean' },
      },
    }
  );

  return { argv, input, flags: flags as Flags, help, pkg };
}
