import path from 'node:path';

import type { Check } from './checks';
import { ARCHIVE_DIRECTORIES, findTestConfig, FRAMEWORK_NAMES, TEST_FRAMEWORKS } from './detect';
import type { DoctorInput } from './doctorInput';
import { relativeOrDot } from './shared';

/**
 * Where a Vitest, Playwright or Cypress project's tests run. Each writes its archives next to its
 * config, and `chromatic --<framework>` reads them from the folder it runs in, so a config in a
 * folder above, such as the repository root, only works when Chromatic runs there too, or when
 * CHROMATIC_ARCHIVE_LOCATION points at the archives. Vitest also names files from its own folder,
 * which storybookBaseDir must match for TurboSnap.
 *
 * @param input What loadDoctorInput read.
 *
 * @returns The check, or none for a Storybook project.
 */
// eslint-disable-next-line complexity -- one branch per place the archives can be
export function testConfigChecks(input: DoctorInput): Check[] {
  const framework = TEST_FRAMEWORKS.find((f) => input.options[f]);
  if (!framework) return [];
  const { cwd, gitRoot } = input;
  const name = FRAMEWORK_NAMES[framework];
  const config = findTestConfig(framework, cwd, gitRoot);
  if (!config) {
    return [
      {
        group: 'Loading',
        status: 'fail',
        title: `No ${name} config found here or above`,
        detail: `Chromatic uploads the archives ${name} captures, so the tests need a config with Chromatic's plugin in this folder or one above it.`,
      },
    ];
  }
  const runsFrom = path.dirname(config);
  if (runsFrom === cwd) {
    return [
      {
        group: 'Loading',
        status: 'pass',
        title: `Found ${name} config at ${path.basename(config)}`,
      },
    ];
  }
  const where =
    runsFrom === gitRoot ? 'the repository root' : relativeOrDot(gitRoot ?? cwd, runsFrom);
  const archives = path.join(runsFrom, ARCHIVE_DIRECTORIES[framework]);
  const location = input.archiveLocation;
  const found = location !== undefined && path.resolve(cwd, location) === archives;
  const { storybookBaseDir } = input.options;
  // Without storybookBaseDir, a build names files from the folder it runs in.
  const baseDirectory =
    storybookBaseDir === undefined ? cwd : path.resolve(gitRoot ?? cwd, storybookBaseDir);
  const baseDirectoryOk = framework !== 'vitest' || baseDirectory === runsFrom;
  const needed = [
    ...(found ? [] : [`CHROMATIC_ARCHIVE_LOCATION=${relativeOrDot(cwd, archives)}`]),
    ...(baseDirectoryOk
      ? []
      : [`"storybookBaseDir": "${relativeOrDot(gitRoot ?? cwd, runsFrom)}"`]),
  ];
  if (needed.length === 0) {
    return [
      {
        group: 'Loading',
        status: 'pass',
        title: `${name} runs from ${where}, and CHROMATIC_ARCHIVE_LOCATION points at its archives`,
      },
    ];
  }
  return [
    {
      group: 'Loading',
      status: 'fail',
      title: `${name} runs from ${where}, so its archives are there; run Chromatic from ${where}`,
      detail: `Its config is ${relativeOrDot(cwd, config)}, and a build from here looks for archives in ${ARCHIVE_DIRECTORIES[framework]}. To run Chromatic from here instead, set ${needed.join(' and ')}${location === undefined ? '; if CI already sets CHROMATIC_ARCHIVE_LOCATION, set it here too to check it' : ''}.`,
    },
  ];
}
