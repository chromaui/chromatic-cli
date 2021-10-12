import localtunnel from '@chromaui/localtunnel';

export default async function openTunnel({ env, log, port, https, host = 'localhost', ...rest }) {
  if (!port) {
    throw new Error('Need to pass a port into `openTunnel`');
  }

  const tunnel = await localtunnel({
    // upstream
    host: env.CHROMATIC_TUNNEL_URL,
    port,

    // local
    local_host: host, // not a typo
    ...rest,

    // I have no idea, these seem to go unused in the unlaying lib
    https: !!https,
    cert: https && https.cert,
    key: https && https.key,
    ca: https && https.ca,
  });

  log.debug(tunnel);

  tunnel.on('url', (url) => log.debug(`Got tunnel url: %s`, url));
  tunnel.on('request', (request) => log.debug(`Got request: %O`, request));
  tunnel.tunnelCluster.on('error', (error) => log.debug(`Got tunnel cluster error: %O`, error));

  return tunnel;
}
