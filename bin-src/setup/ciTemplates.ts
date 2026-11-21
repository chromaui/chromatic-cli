import type { Framework, PackageManager } from './detect';
import { PACKAGE_MANAGER_COMMANDS } from './detect';

export interface CiTemplateInput {
  /** Package directory relative to the repository root, or '.'. */
  workingDir: string;
  packageManager: PackageManager;
  framework: Framework;
  /** The CI secret holding this project's token. Differs per project when a repo has several. */
  secretName: string;
}

/**
 * The name for a project's CI job and workflow file, from its secret: chromatic, or
 * chromatic-packages-ui for a monorepo project, so two projects' jobs don't share a key.
 *
 * @param secretName The CI secret holding the project's token.
 *
 * @returns The job name.
 */
export function ciJobName(secretName: string) {
  const suffix = secretName.replace(/^CHROMATIC_PROJECT_TOKEN_?/, '');
  return suffix ? `chromatic-${suffix.toLowerCase().replaceAll('_', '-')}` : 'chromatic';
}

// Yarn 2+ and pnpm come from Corepack in node images; it's off until enabled.
const needsCorepack = (packageManager: PackageManager) =>
  packageManager === 'yarn' || packageManager === 'pnpm';

const E2E_RUN: Partial<Record<Framework, string>> = {
  playwright: 'npx playwright test',
  cypress: 'npx cypress run',
  vitest: 'npx vitest run',
};

/**
 * The GitHub Actions workflow from the docs, filled in for this project: runs on push, clones the
 * full history, installs with the project's package manager, and runs Chromatic from the package.
 *
 * @param input The project's directory, package manager, framework and token secret.
 *
 * @returns The workflow file's text.
 */
export function githubWorkflow(input: CiTemplateInput) {
  const { workingDir, packageManager, framework, secretName } = input;
  const pm = PACKAGE_MANAGER_COMMANDS[packageManager];
  const lines = [
    // One workflow per project in a monorepo, so name each after its folder.
    workingDir === '.' ? 'name: Chromatic' : `name: Chromatic (${workingDir})`,
    '',
    '# Runs on every push. Chromatic compares each commit with its git ancestors,',
    "# so pull_request triggers (which test a merge commit) aren't recommended.",
    'on: push',
    '',
    'jobs:',
    '  chromatic:',
    '    name: Run Chromatic',
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - name: Checkout code',
    '        uses: actions/checkout@v7',
    '        with:',
    '          # Full history, so Chromatic and TurboSnap can find baselines',
    '          fetch-depth: 0',
    ...(packageManager === 'pnpm' ? ['      - uses: pnpm/action-setup@v4'] : []),
    '      - uses: actions/setup-node@v7',
    '        with:',
    '          node-version: 24',
    ...(packageManager === 'yarn' ? ['      - run: corepack enable'] : []),
    '      - name: Install dependencies',
    `        run: ${pm.ciInstall}`,
  ];
  const e2e = E2E_RUN[framework];
  if (e2e) {
    if (framework === 'playwright') {
      lines.push(
        '      - name: Install Playwright browsers',
        '        run: npx playwright install --with-deps chromium',
        ...(workingDir === '.' ? [] : [`        working-directory: ${workingDir}`])
      );
    }
    lines.push(
      `      - name: Run ${framework} tests`,
      `        run: ${e2e}`,
      ...(workingDir === '.' ? [] : [`        working-directory: ${workingDir}`])
    );
  }
  lines.push(
    '      - name: Run Chromatic',
    '        uses: chromaui/action@latest',
    '        with:',
    `          # Add this repository secret: gh secret set ${secretName}`,
    `          projectToken: \${{ secrets.${secretName} }}`,
    ...(workingDir === '.'
      ? []
      : [
          '          # Run from the package, so no Storybook path options are needed',
          `          workingDir: ${workingDir}`,
        ]),
    '          # Other options, such as onlyChanged, come from chromatic.config.json'
  );
  return `${lines.join('\n')}\n`;
}

function runLines({ workingDir, packageManager, framework, secretName }: CiTemplateInput) {
  // A subshell for each line: GitLab and Bitbucket run every line in one shell, so a bare cd
  // would carry over and the next one would fail.
  const inDirectory = (command: string) =>
    workingDir === '.' ? command : `(cd ${workingDir} && ${command})`;
  // The CLI reads CHROMATIC_PROJECT_TOKEN, so map a per-project secret onto it.
  const token =
    secretName === 'CHROMATIC_PROJECT_TOKEN' ? '' : `CHROMATIC_PROJECT_TOKEN=$${secretName} `;
  const e2e = E2E_RUN[framework];
  return [
    ...(needsCorepack(packageManager) ? ['corepack enable'] : []),
    PACKAGE_MANAGER_COMMANDS[packageManager].ciInstall,
    ...(framework === 'playwright'
      ? [inDirectory('npx playwright install --with-deps chromium')]
      : []),
    ...(e2e ? [inDirectory(e2e)] : []),
    inDirectory(`${token}npx chromatic`),
  ];
}

/**
 * A snippet to paste into providers that keep the whole pipeline in one shared file.
 *
 * @param providerId The CI provider, such as gitlab.
 * @param input The project's directory, package manager, framework and token secret.
 *
 * @returns The YAML to paste.
 */
export function ciSnippet(providerId: string, input: CiTemplateInput) {
  const run = runLines(input);
  switch (providerId) {
    case 'gitlab':
      return [
        '# .gitlab-ci.yml',
        `${ciJobName(input.secretName)}:`,
        '  image: node:24',
        '  variables:',
        '    GIT_DEPTH: 0  # full history for baselines',
        '  script:',
        ...run.map((line) => `    - ${line}`),
      ].join('\n');
    case 'circleci':
      return [
        '# .circleci/config.yml, under jobs: (add it to a workflow too)',
        `${ciJobName(input.secretName)}:`,
        '  docker:',
        '    - image: cimg/node:24.0',
        '  steps:',
        '    - checkout  # CircleCI clones full history by default',
        ...run.map((line) => `    - run: ${line}`),
      ].join('\n');
    case 'bitbucket':
      return [
        '# bitbucket-pipelines.yml',
        'clone:',
        '  depth: full',
        'pipelines:',
        '  default:',
        '    - step:',
        '        name: Chromatic',
        '        image: node:24',
        '        script:',
        ...run.map((line) => `          - ${line}`),
      ].join('\n');
    default:
      return [
        '# In your pipeline:',
        '# 1. Clone with full git history (no shallow clone).',
        `# 2. Set ${input.secretName} as a secret environment variable.`,
        '# 3. Run:',
        ...run,
      ].join('\n');
  }
}
