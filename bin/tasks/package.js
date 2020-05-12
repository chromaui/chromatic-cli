import { createTask } from '../lib/tasks';

const checkPackageJson = async ctx => {
  // if (!checkPackageJson() && originalArgv && !fromCI && interactive) {
  //   const scriptCommand = `${`chromatic ${originalArgv.slice(2).join(' ')}`
  //     .replace(/--project-token[= ]\S+/)
  //     .replace(/--app-code[= ]\S+/)
  //     .trim()} --project-token=${projectToken}`;
  //   const confirmed = await confirm(
  //     `\nYou have not added the 'chromatic' script to your 'package.json'. Would you like me to do it for you?`
  //   );
  //   if (confirmed) {
  //     addScriptToPackageJson('chromatic', scriptCommand);
  //     log.info(
  //       dedent`
  //         Added script 'chromatic'. You can now run it here or in CI with 'npm run chromatic' (or 'yarn chromatic')
  //         NOTE: Your project token was added to the script via the \`--project-token\` flag.
  //         The project token cannot be used to read story data, it can only be used to create new builds.
  //         If you're running Chromatic via continuous integration, we recommend setting \`CHROMATIC_PROJECT_TOKEN\` environment variable in your CI environment. You can then remove the --project-token from your 'package.json'.
  //       `
  //     );
  //   } else {
  //     log.info(
  //       dedent`
  //         No problem. You can add it later with:
  //         {
  //           "scripts": {
  //             "chromatic": "${scriptCommand}"
  //           }
  //         }
  //       `
  //     );
  //   }
  // }
};

export default createTask({
  title: 'Check package.json',
  steps: [checkPackageJson],
});
