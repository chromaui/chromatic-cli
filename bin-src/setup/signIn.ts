import * as clack from '@clack/prompts';

import {
  canSignInWithBrowser,
  type OAuthSession,
  openBrowser,
  queryChromatic,
  signIn,
} from '../../node-src/lib/oauth/flow';
import { loadSession, saveSession, type StoreKind } from '../../node-src/lib/oauth/store';
import { SubcommandFailure } from '../subcommandFailure';
import type { Framework } from './detect';
import { answered, color } from './shared';

const STORE_NAMES: Record<StoreKind, string> = {
  keychain: 'the macOS keychain',
  'secret-service': 'your system keyring',
  file: 'a file only you can read',
};

const ViewerQuery = `query CLIViewer { viewer { name username } }`;

const ProjectsQuery = `
  query CLIProjects {
    viewer {
      accounts {
        id
        name
        newProjectUrl
        projects { id name type webUrl }
      }
    }
  }
`;

const ProjectTokenQuery = `
  query CLIProjectToken($id: ID!) {
    project(id: $id) { id name projectToken }
  }
`;

interface Account {
  id: string;
  name: string;
  newProjectUrl: string | null;
  projects: ({ id: string; name: string; type: string | null; webUrl: string | null } | null)[];
}

const PROJECT_KIND: Record<Framework, string> = {
  storybook: 'STORYBOOK',
  playwright: 'PLAYWRIGHT',
  cypress: 'CYPRESS',
  vitest: 'VITEST',
};

const sameProject = (a?: string, b?: string) =>
  !!a && !!b && a.replace(/^Project:/, '') === b.replace(/^Project:/, '');

async function greet(session: OAuthSession) {
  try {
    const { viewer } = await queryChromatic<{ viewer: { name: string; username: string } }>(
      session,
      ViewerQuery
    );
    return viewer.username || viewer.name;
  } catch {
    return undefined;
  }
}

/**
 * Signs in through the browser and stores the session outside the repository.
 *
 * @param options Sign-in options.
 * @param options.save Whether to store the session; false in a dry run.
 *
 * @returns The new session.
 */
export async function browserSignIn({ save = true }: { save?: boolean } = {}) {
  const spinner = clack.spinner();
  const progress = { waiting: false };
  let session: OAuthSession;
  try {
    session = await signIn({
      onUrl: (url) => {
        openBrowser(url);
        clack.log.info(`Open this page to sign in, if your browser didn't:\n${color.cta(url)}`);
        if (!canSignInWithBrowser()) {
          // The redirect goes to this machine, so a browser elsewhere needs the port forwarded.
          const port = new URL(new URL(url).searchParams.get('redirect_uri') ?? '').port;
          clack.log.warn(
            `This looks like a remote session. To sign in from your own computer's browser, first forward the port: ${color.cta(`ssh -L ${port}:127.0.0.1:${port} <this host>`)}`
          );
        }
        spinner.start('Waiting for you to approve access in the browser');
        progress.waiting = true;
      },
    });
  } catch (error) {
    const reason = `Sign-in failed: ${error instanceof Error ? error.message : String(error)}`;
    // A spinner that never started prints nothing, which would hide the reason.
    if (progress.waiting) spinner.error(reason);
    else clack.log.error(reason);
    throw new SubcommandFailure('Sign-in failed', { exitCode: 1 });
  }
  const who = await greet(session);
  spinner.stop(`Signed in${who ? ` as ${color.bold(who)}` : ''}`);
  if (!save) {
    clack.log.info(color.muted('Dry run: the sign-in is not saved.'));
    return session;
  }
  const { kind, file } = await saveSession(session);
  if (file) {
    // Windows ignores the file mode, so only claim it elsewhere.
    const mode = process.platform === 'win32' ? '' : ` ${color.muted('(readable only by you)')}`;
    clack.log.warn(`Couldn't save to a system keyring, so the sign-in is in ${file}${mode}`);
  } else {
    clack.log.info(color.muted(`Saved in ${STORE_NAMES[kind]}, never in this repository.`));
  }
  return session;
}

/**
 * The stored session, or a new one from the browser.
 *
 * @param save Whether to store a new session; false in a dry run.
 *
 * @returns A session.
 */
async function ensureSession(save: boolean) {
  const stored = await loadSession();
  if (stored) {
    const who = await greet(stored.session);
    clack.log.info(`Signed in to Chromatic${who ? ` as ${color.bold(who)}` : ''}`);
    return stored.session;
  }
  return browserSignIn({ save });
}

async function pickProject(
  session: OAuthSession,
  framework: Framework,
  currentProjectId: string | undefined
): Promise<string | undefined> {
  for (;;) {
    const spinner = clack.spinner();
    spinner.start('Loading your Chromatic projects');
    const { viewer } = await queryChromatic<{ viewer: { accounts: Account[] } }>(
      session,
      ProjectsQuery
    );
    const projects = viewer.accounts.flatMap((account) =>
      account.projects.flatMap((p) =>
        p && p.type === PROJECT_KIND[framework] ? [{ ...p, account }] : []
      )
    );
    spinner.stop(
      `Found ${projects.length} ${framework === 'storybook' ? 'Storybook' : framework} project${projects.length === 1 ? '' : 's'}`
    );

    const multipleAccounts = viewer.accounts.length > 1;
    const choice = answered(
      await clack.autocomplete<string>({
        message: 'Which Chromatic project should this test? Type to search.',
        maxItems: 10,
        initialValue: projects.find((p) => sameProject(p.id, currentProjectId))?.id,
        options: [
          ...projects.map((p) => ({
            value: p.id,
            label: multipleAccounts ? `${p.account.name} / ${p.name}` : p.name,
          })),
          { value: 'create', label: color.cta('Create a new project on chromatic.com') },
          { value: 'paste', label: 'Paste a project token instead' },
        ],
      })
    );
    if (choice === 'paste') return undefined;
    if (choice !== 'create') return choice;

    const account =
      viewer.accounts.length <= 1
        ? viewer.accounts.at(0)
        : answered(
            await clack.select({
              message: 'Create it in which account?',
              options: viewer.accounts.map((a) => ({ value: a, label: a.name })),
            })
          );
    const url = account?.newProjectUrl ?? 'https://www.chromatic.com/start';
    openBrowser(url);
    clack.log.info(`Create the project at ${color.cta(url)}`);
    answered(
      await clack.confirm({ message: 'Created it? Press Enter to reload the list.', active: 'Yes' })
    );
  }
}

/**
 * Links this package to a Chromatic project through browser sign-in instead of a pasted token:
 * picks a project of the right kind and reads its project token for local runs and CI.
 *
 * @param options Link options.
 * @param options.framework The detected framework, to show only matching projects.
 * @param options.currentProjectId The `projectId` already in chromatic.config.json, if any.
 * @param options.save Whether to store a new sign-in; false in a dry run.
 *
 * @returns The project's ID, name and token, or undefined to fall back to pasting a token.
 */
export async function linkProject({
  framework,
  currentProjectId,
  save,
}: {
  framework: Framework;
  currentProjectId?: string;
  save: boolean;
}) {
  try {
    const session = await ensureSession(save);
    const projectId = await pickProject(session, framework, currentProjectId);
    if (!projectId) return undefined;
    const { project } = await queryChromatic<{
      project: { id: string; name: string; projectToken: string } | null;
    }>(session, ProjectTokenQuery, { id: projectId });
    if (!project) throw new Error(`${projectId} doesn't exist, or you can't see it`);
    clack.log.success(`Linked to ${color.bold(project.name)} ${color.muted(`(${project.id})`)}`);
    return { projectId: project.id, name: project.name, projectToken: project.projectToken };
  } catch (error) {
    // Cancelling and a failed sign-in stop init; anything else falls back to pasting a token.
    if (error instanceof SubcommandFailure) throw error;
    const message = error instanceof Error ? error.message : String(error);
    clack.log.warn(`Couldn't link through sign-in (${message}). Paste a token instead.`);
    return undefined;
  }
}
