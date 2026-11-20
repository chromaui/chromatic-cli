import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import * as clack from '@clack/prompts';

import { SubcommandFailure } from '../subcommandFailure';
import type { Project } from './detect';
import { answered, color, FileWriter, gitignoreAdditions, relativeOrDot } from './shared';

/** State shared by init's steps. */
export interface Session {
  gitRoot: string;
  interactive: boolean;
  writer: FileWriter;
  flags: Record<string, any>;
  /** The CI secret for this project's token, set once the project is picked. */
  secretName: string;
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
 * Gets the project token, checks it with Chromatic, and offers to save a typed one in .env.
 *
 * @param session The init run.
 * @param project The project being set up.
 */
// eslint-disable-next-line complexity, max-statements -- prototype; split into smaller steps if this ships
export async function tokenStep(session: Session, project: Project) {
  const { flags, interactive, writer } = session;
  const fromEnvironment = process.env.CHROMATIC_PROJECT_TOKEN?.trim() || undefined;
  // True when the token came from a flag or the environment, so there's nothing new to save.
  let given = false;
  let token: string | undefined;
  if (flags.projectToken) {
    clack.log.info('Using the project token from --project-token.');
    token = flags.projectToken;
    given = true;
  } else if (interactive) {
    clack.log.info(
      `Find your project token on your project's Manage page: ${color.cta('https://www.chromatic.com/start')}`
    );
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
    token = typed || fromEnvironment;
    given = !typed;
    if (given) clack.log.info(`Using CHROMATIC_PROJECT_TOKEN (ends in …${ending}).`);
  } else if (fromEnvironment) {
    clack.log.info(`Using CHROMATIC_PROJECT_TOKEN (ends in …${fromEnvironment.slice(-4)}).`);
    token = fromEnvironment;
    given = true;
  } else {
    clack.log.warn('No project token. Set CHROMATIC_PROJECT_TOKEN before running Chromatic.');
    return;
  }
  if (!token) return;

  const spinner = clack.spinner();
  spinner.start('Checking the token with Chromatic');
  const result = await verifyToken(token);
  if (result === 'invalid') {
    spinner.error("Chromatic doesn't know this token. Check it on your project's Manage page.");
    throw new SubcommandFailure('Invalid project token', { exitCode: 1 });
  }
  spinner.stop(
    result === 'valid' ? 'Token works' : "Couldn't reach Chromatic to check the token; continuing"
  );

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
