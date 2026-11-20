import { spawn } from 'node:child_process';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * Browser sign-in for the CLI: OAuth 2.0 authorization code with PKCE and a loopback redirect
 * (RFC 8252), which Chromatic's server accepts from every pre-registered client allowed the
 * authorization code grant.
 */

// The CLI has no OAuth client of its own on Chromatic yet; `chromaui:cli` returns "Unknown
// client_id". Until one is registered, borrow the Visual Tests addon's public client, which
// accepts loopback redirects. Its consent page names the addon.
const CLIENT_ID = 'chromaui:addon-visual-tests';

/** Only what `init` needs: who you are, your accounts, and your projects (with their tokens). */
const SCOPES = ['user:read', 'account:read', 'project:read'];

// The server keeps an authorization request for 5 minutes, so waiting longer is pointless.
const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 15_000;

export interface OAuthSession {
  version: 1;
  /** The index this session is for, e.g. `https://index.chromatic.com`. */
  indexUrl: string;
  clientId: string;
  accessToken: string;
  refreshToken: string;
  /** Epoch milliseconds. */
  expiresAt: number;
  scopes: string[];
  tokenEndpoint: string;
}

interface ServerMetadata {
  authorization_endpoint: string;
  token_endpoint: string;
}

export const getIndexUrl = () => process.env.CHROMATIC_INDEX_URL || 'https://index.chromatic.com';

const isLoopback = (hostname: string) =>
  hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '[::1]';

/**
 * Refuses endpoints a token or code must never travel to: anything but HTTPS, except a loopback
 * server for local development.
 *
 * @param value The endpoint URL.
 *
 * @returns The parsed URL.
 */
function secureUrl(value: string) {
  const url = new URL(value);
  if (url.protocol === 'https:' || (url.protocol === 'http:' && isLoopback(url.hostname))) {
    return url;
  }
  throw new Error(`Refusing to sign in through an insecure endpoint: ${url.origin}`);
}

async function discover(indexUrl: string): Promise<ServerMetadata> {
  const response = await fetch(
    new URL('/.well-known/oauth-authorization-server', secureUrl(indexUrl)),
    { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }
  );
  if (!response.ok)
    throw new Error(`Couldn't reach Chromatic's sign-in server (${response.status})`);
  const metadata = (await response.json()) as ServerMetadata;
  secureUrl(metadata.authorization_endpoint);
  secureUrl(metadata.token_endpoint);
  return metadata;
}

const base64Url = (buffer: Buffer) => buffer.toString('base64url');

function sameSecret(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

const PAGE = (title: string, body: string) =>
  `<!doctype html><meta charset="utf-8"><title>${title}</title>` +
  `<body style="font:16px system-ui;margin:20vh auto;max-width:32em;text-align:center">` +
  `<h1 style="font-size:20px">${title}</h1><p>${body}</p></body>`;

/**
 * Listens on 127.0.0.1 at a port the OS picks, for exactly one callback that carries the expected
 * `state`. Other paths, methods and mismatched states get an error page and are otherwise ignored,
 * so a stray or forged request can't end the sign-in.
 *
 * @param expectedState The `state` sent in the authorization request.
 * @param signal Aborts the wait.
 *
 * @returns The redirect URI to send, and a promise for the authorization code.
 */
async function listenForCallback(expectedState: string, signal: AbortSignal) {
  let settle: { resolve: (code: string) => void; reject: (error: Error) => void };
  const code = new Promise<string>((resolve, reject) => {
    settle = { resolve, reject };
  });

  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    const reply = (status: number, title: string, body: string) => {
      response.writeHead(status, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
        Connection: 'close',
      });
      response.end(PAGE(title, body));
    };
    if (request.method !== 'GET' || url.pathname !== '/callback') {
      reply(404, 'Not found', 'This page is only used to finish signing in to the Chromatic CLI.');
      return;
    }
    const state = url.searchParams.get('state') ?? '';
    if (!sameSecret(state, expectedState)) {
      reply(400, 'Sign-in link expired', 'Run the command again to get a new one.');
      return;
    }
    const error = url.searchParams.get('error');
    if (error) {
      // Never echo the server's text into the page: only the terminal shows it.
      reply(400, 'Sign-in cancelled', 'Go back to your terminal.');
      settle.reject(new Error(url.searchParams.get('error_description') || error));
      return;
    }
    const value = url.searchParams.get('code');
    if (!value) {
      reply(400, 'Sign-in failed', 'Go back to your terminal.');
      settle.reject(new Error('Chromatic sent no authorization code'));
      return;
    }
    reply(
      200,
      'Signed in to the Chromatic CLI',
      'You can close this tab and go back to your terminal.'
    );
    settle.resolve(value);
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const onAbort = () => settle.reject(new Error('Timed out waiting for you to sign in'));
  signal.addEventListener('abort', onAbort, { once: true });
  const close = () => {
    signal.removeEventListener('abort', onAbort);
    server.closeAllConnections();
    server.close();
  };
  code.then(close, close);

  const { port } = server.address() as AddressInfo;
  return { redirectUri: `http://127.0.0.1:${port}/callback`, code };
}

/**
 * Whether a browser opened here can finish sign-in: the redirect goes to 127.0.0.1 on this
 * machine, which a browser on the other end of an SSH session can't reach.
 *
 * @returns False over SSH, or on Linux without a display.
 */
export function canSignInWithBrowser() {
  const { SSH_CONNECTION, SSH_TTY, DISPLAY, WAYLAND_DISPLAY } = process.env;
  if (SSH_CONNECTION || SSH_TTY) return false;
  return process.platform !== 'linux' || !!(DISPLAY || WAYLAND_DISPLAY);
}

/**
 * Starts the user's browser on a URL without a shell. $BROWSER is split on whitespace, so it can
 * hold arguments but not quoted ones. Whether it opened can't be known, so callers print the URL.
 *
 * @param url An http(s) URL.
 */
export function openBrowser(url: string) {
  if (!/^https?:\/\//.test(url)) return;
  const platformCommands: Partial<Record<NodeJS.Platform, string[]>> = {
    darwin: ['open'],
    win32: ['rundll32', 'url.dll,FileProtocolHandler'],
  };
  const [command, ...args] = [
    ...(process.env.BROWSER?.trim()
      ? process.env.BROWSER.trim().split(/\s+/)
      : (platformCommands[process.platform] ?? ['xdg-open'])),
    url,
  ];
  try {
    const child = spawn(command, args, { stdio: 'ignore', detached: true });
    child.on('error', () => undefined);
    child.unref();
  } catch {
    // Nothing to do: the URL is printed for the user to open.
  }
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
}

/** The server answered `invalid_grant`: this grant was used, expired or revoked. */
export class TerminalAuthError extends Error {}

async function requestToken(endpoint: string, body: Record<string, string>) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const data = (await response.json().catch(() => ({}))) as TokenResponse;
  if (!response.ok || !data.access_token) {
    const message =
      data.error_description || data.error || `Token request failed (${response.status})`;
    // Chromatic answers 400 for every token error; only invalid_grant means the grant is spent.
    throw data.error === 'invalid_grant' ? new TerminalAuthError(message) : new Error(message);
  }
  return data as TokenResponse & { access_token: string };
}

/**
 * Signs in through the browser and returns a new session. Doesn't store it.
 *
 * @param options Sign-in options.
 * @param options.onUrl Called with the authorization URL once the loopback server is listening.
 *
 * @returns The new session.
 */
export async function signIn({ onUrl }: { onUrl: (url: string) => void }): Promise<OAuthSession> {
  const indexUrl = getIndexUrl();
  const clientId = CLIENT_ID;
  const metadata = await discover(indexUrl);

  const state = base64Url(randomBytes(32));
  const codeVerifier = base64Url(randomBytes(64));
  const codeChallenge = base64Url(createHash('sha256').update(codeVerifier).digest());

  const { redirectUri, code } = await listenForCallback(
    state,
    AbortSignal.timeout(LOGIN_TIMEOUT_MS)
  );
  const authorizeUrl = new URL(metadata.authorization_endpoint);
  authorizeUrl.search = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    scope: SCOPES.join(' '),
    state,
  }).toString();
  onUrl(authorizeUrl.toString());

  const data = await requestToken(metadata.token_endpoint, {
    client_id: clientId,
    grant_type: 'authorization_code',
    code: await code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  });
  if (!data.refresh_token) throw new Error('Chromatic sent no refresh token');
  return {
    version: 1,
    indexUrl,
    clientId,
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
    scopes: data.scope ? data.scope.split(' ') : SCOPES,
    tokenEndpoint: metadata.token_endpoint,
  };
}

/**
 * Trades the refresh token for a new access token. Chromatic rotates refresh tokens: the old one
 * is spent as soon as the server receives it, even if this request then fails.
 *
 * @param session The current session.
 *
 * @returns The refreshed session.
 */
export async function refreshSession(session: OAuthSession): Promise<OAuthSession> {
  const data = await requestToken(secureUrl(session.tokenEndpoint).toString(), {
    client_id: session.clientId,
    grant_type: 'refresh_token',
    refresh_token: session.refreshToken,
  });
  return {
    ...session,
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? session.refreshToken,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
    scopes: data.scope ? data.scope.split(' ') : session.scopes,
  };
}

/**
 * Runs a query against Chromatic's public GraphQL API as the signed-in user.
 *
 * @param session The session to use.
 * @param query The GraphQL document.
 * @param variables Its variables.
 *
 * @returns The response's data.
 */
export async function queryChromatic<T>(
  session: OAuthSession,
  query: string,
  variables: Record<string, unknown> = {}
): Promise<T> {
  const response = await fetch(new URL('/api', secureUrl(session.indexUrl)), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.accessToken}`,
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const { data, errors } = (await response.json().catch(() => ({}))) as {
    data?: T;
    errors?: { message: string }[];
  };
  if (errors?.length || !data) {
    throw new Error(errors?.[0]?.message ?? `Chromatic API request failed (${response.status})`);
  }
  return data;
}
