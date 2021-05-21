import buildFailed from './buildFailed';

export default {
  title: 'CLI/Messages/Errors',
};

const spawnParams = {
  client: 'npm',
  clientVersion: '7.11.2',
  platform: 'darwin',
  command: '/path/to/node',
  clientArgs: ['/path/to/npm-cli.js', 'run'],
  scriptArgs: [
    'build-storybook',
    '--',
    '--output-dir',
    '/var/folders/h3/ff9kk23958l99z2qbzfjdlxc0000gn/T/chromatic-10717MxArPfgMkIgp',
  ].filter(Boolean),
};

const buildLog = `
info @storybook/react v6.1.0-alpha.33
info
info => Cleaning outputDir /var/folders/h3/ff9kk23958l99z2qbzfjdlxc0000gn/T/chromatic-10717MxArPfgMkIgp
info => Using prebuilt manager
info => Building preview..
info => Loading preview config..
info => Loading presets
info => Loading 1 config file in "./.storybook"
info => Loading 7 other files in "./.storybook"
info => Adding stories defined in ".storybook/main.js"
info => Using default Webpack setup
info => Compiling preview..
<s> [webpack.Progress] 0% compiling
<s> [webpack.Progress] 100%

info => Preview built (15 s)
WARN asset size limit: The following asset(s) exceed the recommended size limit (244 KiB).
WARN This can impact web performance.
WARN Assets:
WARN   vendors~main.8387e2f6505d1198087b.bundle.js (3.88 MiB)
WARN entrypoint size limit: The following entrypoint(s) combined asset size exceeds the recommended limit (244 KiB). This can impact web performance.
WARN Entrypoints:
WARN   main (3.9 MiB)
WARN       runtime~main.8387e2f6505d1198087b.bundle.js
WARN       vendors~main.8387e2f6505d1198087b.bundle.js
WARN       main.8387e2f6505d1198087b.bundle.js
WARN
WARN webpack performance recommendations:
WARN You can limit the size of your bundles by using import() or require.ensure to lazy load some parts of your application.
WARN For more info visit https://webpack.js.org/guides/code-splitting/
info => Output directory: /var/folders/h3/ff9kk23958l99z2qbzfjdlxc0000gn/T/chromatic-10717MxArPfgMkIgp
`;

export const BuildFailed = () =>
  buildFailed(
    {
      options: { buildScriptName: 'build:storybook' },
      buildLogFile: '/path/to/project/build-storybook.log',
      spawnParams,
    },
    { message: 'Command failed with exit code 1' },
    buildLog
  );
