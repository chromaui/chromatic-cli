#!/usr/bin/env node

import 'dotenv/config';

import { SubcommandFailure } from './subcommandFailure';

const commands = {
  'generate-manifest': () =>
    import('./generateManifest').then(({ main }) => main(process.argv.slice(3))),
  init: () => import('./init').then(({ main: initMain }) => initMain(process.argv.slice(3))),
  main: () => import('./main').then(({ main }) => main(process.argv.slice(2))),
  'react-native-build': () =>
    import('./reactNativeBuild').then(({ main }) => main(process.argv.slice(3))),
  trace: () => import('./trace').then(({ main: traceMain }) => traceMain(process.argv.slice(3))),
  'turbosnap-manifest': () =>
    import('./turbosnapManifest').then(({ main }) => main(process.argv.slice(3))),
  'trim-stats-file': () =>
    import('./trimStatsFile').then(({ main: trimMain }) => trimMain(process.argv.slice(3))),
};

// The only place a subcommand's own failures are handled: subcommands throw, and lint bans
// `console.error`, `process.exit`, and `process.exitCode` in them. (meow still exits by itself for
// `--help` and unknown flags.) Print only the message: an error object can carry environment
// variables (`envPairs`), response headers, and other details that must not end up in CI logs.
// eslint-disable-next-line unicorn/prefer-top-level-await
(commands[process.argv[2]] || commands.main)().catch((err) => {
  console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = err instanceof SubcommandFailure ? err.exitCode : 1;
});
