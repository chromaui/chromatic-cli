import meow from 'meow';
import dedent from 'ts-dedent';

import log from './lib/log';
import { verifyOptions } from './lib/verify-option';
import sendDebugToLoggly from './lib/sendDebugToLoggly';

import { runTest } from './tester/index';
import { runPatchBuild } from './tester/patchBuild';

export async function parseArgv(argv) {
  const cli = meow(
    `
    Usage
      $ chromatic

    Main options
      --project-token <token>, -t  The code for your app, get from chromatic.com (alternatively, set CHROMATIC_PROJECT_TOKEN)

    Storybook options
      --build-script-name [name], -b  The npm script that builds your Storybook [build-storybook]
      --storybook-build-dir, -d <dirname>  Provide a directory with your built Storybook; use if you've already built your Storybook

    Chromatic options
      --auto-accept-changes [branch]  Accept any (non-error) changes or new stories for this build [only for <branch> if specified]
      --exit-zero-on-changes [branch]  Use a 0 exit code if changes are detected (i.e. don't stop the build) [only for <branch> if specified]
      --exit-once-uploaded [branch]  Exit with 0 once the built version has been sent to chromatic [only for <branch> if specified]
      --ignore-last-build-on-branch [branch]  Do not use the last build on this branch as a baseline if it is no longer in history (i.e. branch was rebased) [only for <branch> if specified]
      --preserve-missing  Treat missing stories as unchanged (as opposed to deleted) when comparing to the baseline
      --no-interactive  Do not prompt for package.json changes
      --only <component:story>  Only run a single story or a glob-style subset of stories (for debugging purposes)
      --allow-console-errors  Continue, even when encountering runtime errors
      --patch-build <headbranch...basebranch>  Create a patch build to fix a missing PR comparison

    Debug options
      --skip  Skip chromatic tests (mark as passing)
      --list  List available stories (for debugging purposes)
      --ci  This build is running in continuous integration, non-interactively (alternatively, set CI=true)
      --debug  Output more debugging information
    `,
    {
      argv,
      booleanDefault: undefined,
      flags: {
        'app-code': { type: 'string', alias: 'a' },
        'project-token': { type: 'string', alias: 't' },

        // main config option in the future
        config: { type: 'string' },

        // to be deprecated in the future
        'build-script-name': { type: 'string', alias: 'b' },
        'script-name': { type: 'string', alias: 's' },
        exec: { type: 'string', alias: 'e' },
        'do-not-start': { type: 'boolean', alias: 'S' },
        'storybook-build-dir': { type: 'string', alias: 'd' },
        'storybook-port': { type: 'string', alias: 'p' },
        'storybook-url': { type: 'string', alias: 'u' },
        'storybook-https': { type: 'boolean' },
        'storybook-cert': { type: 'string' },
        'storybook-key': { type: 'string' },
        'storybook-ca': { type: 'string' },

        // chromatic options
        'auto-accept-changes': { type: 'string' },
        'exit-zero-on-changes': { type: 'string' },
        'exit-once-uploaded': { type: 'string' },
        'ignore-last-build-on-branch': { type: 'string' },
        'preserve-missing': { type: 'boolean' },
        'allow-console-errors': { type: 'boolean' },
        only: { type: 'string' },
        skip: { type: 'string' },
        'patch-build': { type: 'string' },

        // debug options
        list: { type: 'string' },
        interactive: { type: 'boolean', default: true },
        ci: { type: 'boolean' },
        debug: { type: 'boolean' },
      },
    }
  );

  return verifyOptions(cli.flags, argv);
}

export async function run(argv) {
  const options = await parseArgv(argv);

  sendDebugToLoggly(options);

  try {
    const { exitCode } = options.patchBuild ? await runPatchBuild(options) : await runTest(options);

    process.exitCode = exitCode;
  } catch (error) {
    log.error(
      dedent`
        ** Chromatic build failed. **
        Please note the session id: '${options.sessionId}'
        contact support@hichroma.com -or- open a support ticket at https://chromaticqa.com

      `
    );

    const errors = [].concat(error);

    if (errors.length) {
      // eslint-disable-next-line no-console
      console.log('');
      log.error('Problems encountered:');
      console.log('');
      errors.forEach((e, i, l) => {
        log.error(e.message ? e.message.toString() : e.toString());
        if (options.verbose) {
          console.log(e);
        }

        if (i === l.length - 1) {
          // empty line in between errors
          console.log(' ');
        }
      });
    }

    // Not sure what exit code to use but this can mean error.
    process.exitCode = process.exitCode || 255;
  } finally {
    process.exit(process.exitCode);
  }
}
