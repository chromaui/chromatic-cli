import meow from 'meow';

export default function parseArgs(argv) {
  const { input, flags, help, pkg } = meow(
    `
    Usage
      $ chromatic --project-token <token>

    Required options
      --project-token <token>, -t  The unique code for your project. Alternatively, set CHROMATIC_PROJECT_TOKEN.

    Storybook options
      --build-script-name, -b [name]  The npm script that builds your Storybook we should take snapshots against. Use this if your Storybook build script is named differently. [build-storybook]
      --output-dir, -o <dirname>  Relative path to target directory for building your Storybook, in case you want to preserve it. Otherwise a temporary directory is used if possible.
      --storybook-build-dir, -d <dirname>  If you have already built your Storybook, provide the path to the static build directory.

    Chromatic options
      --allow-console-errors  Continue running Chromatic even if there are errors logged to console in your Storybook.
      --auto-accept-changes [branch]  If there are any changes to the build, automatically accept them. Only for [branch], if specified. Globs are supported via picomatch.
      --exit-once-uploaded [branch]  Exit with 0 once the built version has been published to Chromatic. Only for [branch], if specified. Globs are supported via picomatch.
      --exit-zero-on-changes [branch]  If all snapshots render but there are visual changes, exit with code 0 rather than the usual exit code 1. Only for [branch], if specified. Globs are supported via picomatch.
      --ignore-last-build-on-branch <branch>  Do not use the last build on this branch as a baseline if it is no longer in history (i.e. branch was rebased). Globs are supported via picomatch.
      --only <storypath>  Only run a single story or a subset of stories. Story paths typically look like "Path/To/Story". Globs are supported via picomatch. This option implies --preserve-missing. 
      --patch-build <headbranch...basebranch>  Create a patch build to fix a missing PR comparison.
      --preserve-missing  Treat missing stories as unchanged rather than deleted when comparing to the baseline.
      --skip [branch]  Skip Chromatic tests, but mark the commit as passing. Avoids blocking PRs due to required merge checks. Only for [branch], if specified. Globs are supported via picomatch.

    Debug options
      --ci  Mark this build as a CI build. Alternatively, set the CI environment variable (present in most CI systems). This option implies --no-interactive.
      --debug  Output verbose debugging information. This option implies --no-interactive.
      --junit-report [filepath]  Write build results to a JUnit XML file. {buildNumber} will be replaced with the actual build number. [chromatic-build-{buildNumber}.xml]
      --list  List available stories. This requires running a full build.
      --no-interactive  Don't ask interactive questions about your setup and don't overwrite output. Always true in non-TTY environments.
    `,
    {
      argv,
      booleanDefault: undefined,
      flags: {
        // Required options
        'project-token': { type: 'string', alias: 't' },
        'app-code': { type: 'string', alias: 'a' }, // for backwards compatibility

        // Storybook options
        'build-script-name': { type: 'string', alias: 'b' },
        'output-dir': { type: 'string', alias: 'o' },
        'storybook-build-dir': { type: 'string', alias: 'd' },

        // Chromatic options
        'allow-console-errors': { type: 'boolean' },
        'auto-accept-changes': { type: 'string' },
        'exit-once-uploaded': { type: 'string' },
        'exit-zero-on-changes': { type: 'string' },
        'ignore-last-build-on-branch': { type: 'string' },
        only: { type: 'string' },
        'patch-build': { type: 'string' },
        'preserve-missing': { type: 'boolean' },
        skip: { type: 'string' },

        // Debug options
        ci: { type: 'boolean' },
        debug: { type: 'boolean' },
        'junit-report': { type: 'string' },
        list: { type: 'boolean' },
        interactive: { type: 'boolean', default: true },

        // Deprecated options for tunneled builds
        'do-not-start': { type: 'boolean', alias: 'S' }, // assumes already started
        exec: { type: 'string', alias: 'e' }, // aka commandName; start via spawn
        'script-name': { type: 'string', alias: 's' }, // start via npm/yarn run
        'storybook-port': { type: 'string', alias: 'p' },
        'storybook-url': { type: 'string', alias: 'u' },
        'storybook-https': { type: 'boolean' },
        'storybook-cert': { type: 'string' },
        'storybook-key': { type: 'string' },
        'storybook-ca': { type: 'string' },
      },
    }
  );
  return { argv, input, flags, help, pkg };
}
