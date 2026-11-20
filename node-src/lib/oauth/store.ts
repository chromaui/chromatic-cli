import { spawn } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { getIndexUrl, type OAuthSession, refreshSession, TerminalAuthError } from './flow';

/**
 * Where the CLI keeps OAuth sessions, one per Chromatic host, modeled on `gh auth`:
 *
 * - The OS credential store first: the macOS keychain through `security`, or the Secret Service
 *   (GNOME Keyring, KWallet) through `secret-tool` on Linux. The secret goes over stdin, never in
 *   argv where `ps` shows it. Calling the system tools avoids a native module in the package.
 * - Otherwise a JSON file with mode 0600, and the caller warns, as `gh` does when it has no
 *   keyring. Windows ignores the mode, so there the file relies on the profile folder's ACLs.
 *
 * Nothing is ever written inside the repository.
 */

const SERVICE = 'chromatic-cli';

export type StoreKind = 'keychain' | 'secret-service' | 'file';

const hostOf = (indexUrl: string) => new URL(indexUrl).host;

/**
 * Chromatic's per-user config folder, following XDG on Linux and macOS like `gh`.
 *
 * @returns The folder path.
 */
function configDirectory() {
  const base =
    process.platform === 'win32'
      ? process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
      : process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(base, 'chromatic');
}

const sessionsFile = () => path.join(configDirectory(), 'auth.json');

function run(command: string, args: string[], input?: string) {
  return new Promise<string | undefined>((resolve) => {
    let child: ReturnType<typeof spawn>;
    try {
      // A locked keyring can wait on an unlock prompt forever; give up and fall back instead.
      child = spawn(command, args, {
        stdio: ['pipe', 'pipe', 'ignore'],
        // Not `timeout`: its timer keeps the process alive when the command doesn't exist.
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      resolve(undefined);
      return;
    }
    let output = '';
    child.stdout?.on('data', (chunk) => (output += chunk));
    child.on('error', () => {
      // After a timeout, a process the command started can still hold the pipe open.
      child.stdout?.destroy();
      resolve(undefined);
    });
    child.on('close', (code) => resolve(code === 0 ? output : undefined));
    child.stdin?.end(input ?? '');
  });
}

interface Backend {
  kind: StoreKind;
  read(host: string): Promise<string | undefined>;
  write(host: string, secret: string): Promise<boolean>;
  remove(host: string): Promise<void>;
}

// The keychain entry holds base64, so the `security -i` command line never needs quoting.
// `security -i` truncates lines over about 4 KB; a session is about 1.5 KB.
const keychain: Backend = {
  kind: 'keychain',
  async read(host) {
    const output = await run('security', [
      'find-generic-password',
      '-s',
      SERVICE,
      '-a',
      host,
      '-w',
    ]);
    return output ? Buffer.from(output.trim(), 'base64').toString('utf8') : undefined;
  },
  async write(host, secret) {
    const encoded = Buffer.from(secret).toString('base64');
    // `security -i` reads commands from stdin, which keeps the secret out of the process list.
    const output = await run(
      'security',
      ['-i'],
      `add-generic-password -U -s ${SERVICE} -a "${host}" -l "Chromatic CLI (${host})" -w ${encoded}\n`
    );
    // A failed or timed-out store needs no read-back, which could time out too.
    if (output === undefined) return false;
    const stored = await this.read(host);
    return stored === secret;
  },
  async remove(host) {
    await run('security', ['delete-generic-password', '-s', SERVICE, '-a', host]);
  },
};

const secretService: Backend = {
  kind: 'secret-service',
  async read(host) {
    const output = await run('secret-tool', ['lookup', 'service', SERVICE, 'host', host]);
    return output?.trim() || undefined;
  },
  async write(host, secret) {
    const output = await run(
      'secret-tool',
      ['store', `--label=Chromatic CLI (${host})`, 'service', SERVICE, 'host', host],
      secret
    );
    // A failed or timed-out store needs no read-back, which could time out too.
    if (output === undefined) return false;
    const stored = await this.read(host);
    return stored === secret;
  },
  async remove(host) {
    await run('secret-tool', ['clear', 'service', SERVICE, 'host', host]);
  },
};

function readFileSessions(): Record<string, string> {
  try {
    return JSON.parse(readFileSync(sessionsFile(), 'utf8'));
  } catch {
    return {};
  }
}

function writeFileSessions(sessions: Record<string, string>) {
  const file = sessionsFile();
  if (Object.keys(sessions).length === 0) {
    rmSync(file, { force: true });
    return;
  }
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  writeFileSync(file, `${JSON.stringify(sessions, undefined, 2)}\n`, { mode: 0o600 });
  // `mode` applies only when the file is created; tighten one that already existed.
  chmodSync(file, 0o600);
}

const fileBackend: Backend = {
  kind: 'file',
  async read(host) {
    return readFileSessions()[host];
  },
  async write(host, secret) {
    writeFileSessions({ ...readFileSessions(), [host]: secret });
    return true;
  },
  async remove(host) {
    const { [host]: _removed, ...rest } = readFileSessions();
    if (existsSync(sessionsFile())) writeFileSessions(rest);
  },
};

// A missing command fails like a locked store: reads find nothing and writes fall back to the file.
const osBackend = (): Backend | undefined =>
  ({ darwin: keychain, linux: secretService })[process.platform as string];

function parse(secret: string | undefined): OAuthSession | undefined {
  try {
    const session = secret && JSON.parse(secret);
    return session?.version === 1 && session.refreshToken ? session : undefined;
  } catch {
    return undefined;
  }
}

async function find(host: string) {
  const backend = osBackend();
  const fromOs = backend && parse(await backend.read(host));
  if (backend && fromOs) return { session: fromOs, kind: backend.kind };
  const fromFile = parse(await fileBackend.read(host));
  return fromFile ? { session: fromFile, kind: 'file' as const } : undefined;
}

/**
 * Saves a session, in the OS credential store when one works.
 *
 * @param session The session to save.
 *
 * @returns Where it was saved, and the file path when that is a plain file.
 */
export async function saveSession(session: OAuthSession) {
  const host = hostOf(session.indexUrl);
  const secret = JSON.stringify(session);
  const backend = osBackend();
  if (backend && (await backend.write(host, secret))) {
    // Keep one copy, so a read never finds an older one first.
    await fileBackend.remove(host);
    return { kind: backend.kind, file: undefined };
  }
  await backend?.remove(host);
  await fileBackend.write(host, secret);
  return { kind: 'file' as const, file: sessionsFile() };
}

/**
 * Removes this host's session from every store.
 *
 * @param indexUrl The Chromatic host.
 *
 * @returns The session that was removed, if any.
 */
export async function deleteSession(indexUrl = getIndexUrl()) {
  const host = hostOf(indexUrl);
  const found = await find(host);
  await osBackend()?.remove(host);
  await fileBackend.remove(host);
  return found;
}

/**
 * The stored session for this Chromatic host, with an access token valid for at least five
 * minutes, long enough for init's prompts. Refreshes and saves it again when needed.
 *
 * @param indexUrl The Chromatic host.
 *
 * @returns The session and where it is stored, or undefined when signed out.
 */
export async function loadSession(indexUrl = getIndexUrl()) {
  const host = hostOf(indexUrl);
  const found = await find(host);
  if (!found) return undefined;
  if (found.session.expiresAt - Date.now() > 5 * 60_000) return found;
  try {
    const session = await refreshSession(found.session);
    const { kind } = await saveSession(session);
    return { session, kind };
  } catch (error) {
    if (!(error instanceof TerminalAuthError)) throw error;
    // The refresh token was already used, most likely by another chromatic process that is saving
    // the new one. Use that copy if it's there, and never delete it: a later run will find it.
    const latest = await find(host);
    return latest && latest.session.refreshToken !== found.session.refreshToken
      ? latest
      : undefined;
  }
}
