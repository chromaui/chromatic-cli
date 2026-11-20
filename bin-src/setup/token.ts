import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import * as clack from '@clack/prompts';

import { canSignInWithBrowser } from '../../node-src/lib/oauth/flow';
import { SubcommandFailure } from '../subcommandFailure';
import type { Project } from './detect';
import { answered, color, FileWriter, gitignoreAdditions, readJson, relativeOrDot } from './shared';
import { linkProject } from './signIn';

/** State shared by init's steps. */
export interface Session {
  gitRoot: string;
  interactive: boolean;
  writer: FileWriter;
  flags: Record<string, any>;
  /** The CI secret for this project's token, set once the project is picked. */
  secretName: string;
  /** The project picked after browser sign-in, written to chromatic.config.json. */
  projectId?: string;
  /** The token read through sign-in, which nobody has pasted, so init can set the CI secret. */
  linkedToken?: string;
}

async function verifyToken(token: string) {
  const index = process.env.CHROMATIC_INDEX_URL || 'https://index.chromatic.com';
  try {
    const response = await fetch(`${index}/graphql`, {
      // Never hold a CI job on a slow network: give up and continue unchecked.
      signal: AbortSignal.timeout(10_000),
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query:
          'mutation CreateAppTokenMutation($projectToken: String!) { appToken: createAppToken(code: $projectToken) }',
        variables: { projectToken: token },
      }),
    });
    const { data, errors } = await response.json();
    if (data?.appToken) return 'valid';
    return errors?.[0]?.message?.includes('No app with code') ? 'invalid' : 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Asks for the project token, offering Enter to use CHROMATIC_PROJECT_TOKEN when it's set.
 *
 * @param fromEnvironment The token in CHROMATIC_PROJECT_TOKEN, unless it was already rejected.
 *
 * @returns The token, and whether it came from the environment.
 */
async function askForToken(fromEnvironment: string | undefined) {
  // Still ask when the variable is set: in a repo with several Storybooks it may be another
  // project's token. Show only its last characters, so people can tell which one it is.
  const ending = fromEnvironment?.slice(-4);
  // Clack returns undefined, not an empty string, when Enter is pressed on an empty box.
  const answer: string | undefined = answered(
    await clack.password({
      message: fromEnvironment
        ? `Paste your project token, or press Enter to use CHROMATIC_PROJECT_TOKEN ${color.muted(`(ends in …${ending})`)}`
        : 'Paste your project token',
      validate: (value) =>
        value?.trim() || fromEnvironment
          ? undefined
          : 'Paste a token, or press Ctrl+C and pass --project-token later.',
    })
  );
  const typed = (answer || '').trim();
  if (typed) return { token: typed, fromEnvironment: false };
  clack.log.info(`Using CHROMATIC_PROJECT_TOKEN (ends in …${ending}).`);
  return { token: fromEnvironment as string, fromEnvironment: true };
}

/**
 * Checks a token with Chromatic, showing the result in a spinner.
 *
 * @param token The project token.
 *
 * @returns Whether Chromatic rejected it.
 */
async function rejected(token: string) {
  const spinner = clack.spinner();
  spinner.start('Checking the token with Chromatic');
  const result = await verifyToken(token);
  if (result === 'invalid') {
    spinner.error("Chromatic doesn't know this token. Check it on your project's Manage page.");
    return true;
  }
  spinner.stop(
    result === 'valid' ? 'Token works' : "Couldn't reach Chromatic to check the token; continuing"
  );
  return false;
}

async function chooseSignIn() {
  // Over SSH the browser runs on another machine and can't reach this one's 127.0.0.1 redirect.
  const local = canSignInWithBrowser();
  return answered(
    await clack.select({
      message: 'How should init find your Chromatic project?',
      initialValue: local,
      options: [
        {
          value: true,
          label: `Sign in with your browser ${color.muted(local ? '· pick a project, no token to copy' : "· needs a browser on this machine, which this session doesn't seem to have")}`,
        },
        { value: false, label: 'Paste a project token' },
      ],
    })
  );
}

/**
 * Gets the project token, checks it with Chromatic, and offers to save a typed one in .env.
 * In a terminal, a token Chromatic rejects is asked for again; otherwise it stops the run.
 *
 * @param session The init run.
 * @param project The project being set up.
 */
// eslint-disable-next-line complexity, max-statements -- prototype; split into smaller steps if this ships
export async function tokenStep(session: Session, project: Project) {
  const { flags, interactive, writer } = session;
  let fromEnvironment = process.env.CHROMATIC_PROJECT_TOKEN?.trim() || undefined;
  // True when the token came from a flag or the environment, so there's nothing new to save.
  let given = false;
  let token: string;
  const currentProjectId = readJson(
    path.join(project.directory, 'chromatic.config.json')
  )?.projectId;
  // Offer browser sign-in only at a terminal and when no token was passed.
  const linked =
    interactive && !flags.projectToken && flags.browser && (await chooseSignIn())
      ? await linkProject({
          framework: project.framework,
          currentProjectId,
          save: !flags.dryRun,
        })
      : undefined;
  if (linked) {
    session.projectId = linked.projectId;
    session.linkedToken = linked.projectToken;
    token = linked.projectToken;
  } else if (flags.projectToken) {
    clack.log.info('Using the project token from --project-token.');
    token = flags.projectToken;
    given = true;
  } else if (interactive) {
    clack.log.info(
      `Find your project token on your project's Manage page: ${color.cta('https://www.chromatic.com/start')}`
    );
    for (;;) {
      const asked = await askForToken(fromEnvironment);
      if (!(await rejected(asked.token))) {
        token = asked.token;
        given = asked.fromEnvironment;
        break;
      }
      // Don't offer Enter for the variable again once Chromatic has rejected it.
      if (asked.fromEnvironment) fromEnvironment = undefined;
    }
  } else if (fromEnvironment) {
    clack.log.info(`Using CHROMATIC_PROJECT_TOKEN (ends in …${fromEnvironment.slice(-4)}).`);
    token = fromEnvironment;
    given = true;
  } else {
    clack.log.warn('No project token. Set CHROMATIC_PROJECT_TOKEN before running Chromatic.');
    return;
  }
  // Nobody can correct a token passed as a flag or read without a terminal, so stop. The
  // interactive prompt already checked its token, and sign-in read it from Chromatic.
  const checked = !!linked || (interactive && !flags.projectToken);
  if (!checked && (await rejected(token))) {
    throw new SubcommandFailure('Invalid project token', { exitCode: 1 });
  }

  // Only offer to save a token the user typed; one from the environment is already set somewhere.
  if (given) return;
  const save =
    !interactive ||
    answered(
      await clack.confirm({
        message: 'Save it in a gitignored .env for local runs?',
        initialValue: true,
      })
    );
  if (!save) return;
  const environmentFile = path.join(project.directory, '.env');
  const text = existsSync(environmentFile) ? readFileSync(environmentFile, 'utf8') : '';
  const line = `CHROMATIC_PROJECT_TOKEN=${token}`;
  writer.write(
    environmentFile,
    /^CHROMATIC_PROJECT_TOKEN=/m.test(text)
      ? text.replace(/^CHROMATIC_PROJECT_TOKEN=.*$/m, line)
      : `${text}${text && !text.endsWith('\n') ? '\n' : ''}${line}\n`
  );
  const ignored = relativeOrDot(session.gitRoot, environmentFile);
  const gitignore = gitignoreAdditions(session.gitRoot, [
    ignored === '.env' ? '.env' : `/${ignored}`,
  ]);
  if (gitignore.missing.length > 0) writer.write(gitignore.file, gitignore.content);
  clack.log.success(
    `${writer.say('Saved', 'save')} the token to ${writer.display(environmentFile)} ${color.muted('(gitignored, never committed)')}`
  );
}
