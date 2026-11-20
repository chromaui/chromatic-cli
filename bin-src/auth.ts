import * as clack from '@clack/prompts';
import meow from 'meow';

import { meowImportMeta } from '../node-src/lib/meowImportMeta';
import { getIndexUrl, queryChromatic } from '../node-src/lib/oauth/flow';
import { deleteSession, loadSession } from '../node-src/lib/oauth/store';
import { browserSignIn } from './setup/signIn';
import { SubcommandFailure } from './subcommandFailure';

const HELP = `
    Usage
      $ chromatic auth login     Sign in to Chromatic in your browser
      $ chromatic auth status    Show who you're signed in as
      $ chromatic auth logout    Remove the sign-in from this machine

    The sign-in is stored in your system keyring (the macOS keychain, or the Secret Service on
    Linux), or in a file in your user config folder when there is none. It is never written to your
    repository. Set CHROMATIC_INDEX_URL to sign in to another Chromatic host.
`;

/**
 * The main entrypoint for `chromatic auth`.
 *
 * @param argv A list of arguments passed.
 */
export async function main(argv: string[]) {
  const { input, showHelp } = meow(HELP, { importMeta: meowImportMeta, argv });
  const host = new URL(getIndexUrl()).host;
  switch (input[0]) {
    case 'login': {
      if (!process.stdin.isTTY || process.env.CI) {
        throw new SubcommandFailure(
          'Sign-in needs a browser and a terminal. In CI, use CHROMATIC_PROJECT_TOKEN.',
          { exitCode: 1 }
        );
      }
      clack.intro(`Sign in to Chromatic (${host})`);
      await browserSignIn();
      clack.outro('Run `chromatic init` to link this repository to a project.');
      return;
    }
    case 'status': {
      const found = await loadSession();
      if (!found) {
        throw new SubcommandFailure(`Not signed in to ${host}. Run \`chromatic auth login\`.`, {
          exitCode: 1,
        });
      }
      const { viewer } = await queryChromatic<{ viewer: { username: string } }>(
        found.session,
        'query CLIViewer { viewer { username } }'
      );
      console.log(`Signed in to ${host} as ${viewer.username}`);
      console.log(`  Scopes: ${found.session.scopes.join(', ')}`);
      console.log(`  Stored in: ${found.kind}`);
      return;
    }
    case 'logout': {
      const removed = await deleteSession();
      console.log(removed ? `Signed out of ${host}.` : `Not signed in to ${host}.`);
      return;
    }
    default:
      showHelp(input.length > 0 ? 1 : 0);
  }
}
