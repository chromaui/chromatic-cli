import localtunnel from '@chromaui/localtunnel';
import EventEmitter from 'events';
import { Context } from '../types';

export type Tunnel = EventEmitter & {
  open: (cb: (err?: Error) => void) => void;
  close: () => void;
  url: string;
  cachedUrl?: string;
  tunnelCluster: EventEmitter;
};

export default async function openTunnel(
  ctx: Context,
  { host = 'localhost', port }: { host?: string; port: string }
) {
  const { env, log, options, ...rest } = ctx;

  if (!port) {
    throw new Error('Need to pass a port into `openTunnel`');
  }

  const tunnel: Tunnel = await localtunnel({
    // upstream
    host: env.CHROMATIC_TUNNEL_URL,
    port,

    // local
    local_host: host, // not a typo
    ...rest,

    // I have no idea, these seem to go unused in the unlaying lib
    https: !!options.https,
    cert: options.https && options.https.cert,
    key: options.https && options.https.key,
    ca: options.https && options.https.ca,
  });

  log.debug(tunnel);

  tunnel.on('url', (url: any) => log.debug(`Got tunnel url: %s`, url));
  tunnel.on('request', (request: any) => log.debug(`Got request: %O`, request));
  tunnel.tunnelCluster.on('error', (error: any) =>
    log.debug(`Got tunnel cluster error: %O`, error)
  );

  return tunnel;
}
