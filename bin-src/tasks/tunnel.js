import { format, parse } from 'url';

import { createTask, transitionTo } from '../lib/tasks';
import openTunnel from '../lib/tunnel';
import { failed, initial, pending, success } from '../ui/tasks/tunnel';

export const createTunnel = async (ctx) => {
  const { env, log, options } = ctx;
  const { port, pathname, query, hash } = parse(ctx.isolatorUrl, true);

  let tunnel;
  try {
    tunnel = await openTunnel({ env, log, port, https: options.https });
    ctx.closeTunnel = () => tunnel.close();
  } catch (err) {
    if (ctx.stopApp) ctx.stopApp();
    throw err;
  }

  // ** Are we using a v1 or v2 tunnel? **
  // If the tunnel returns a cachedUrl, we are using a v2 tunnel and need to use
  // the slightly esoteric URL format for the isolatorUrl.
  // If not, they are the same:
  const cachedUrlObject = parse(tunnel.cachedUrl || tunnel.url);
  cachedUrlObject.pathname = pathname;
  cachedUrlObject.query = query;
  cachedUrlObject.hash = hash;
  const cachedUrl = cachedUrlObject.format();

  if (tunnel.cachedUrl) {
    const isolatorUrlObject = parse(tunnel.url, true);
    isolatorUrlObject.query = {
      ...isolatorUrlObject.query,
      // This will encode the pathname and query into a single query parameter
      path: format({ pathname, query }),
    };
    isolatorUrlObject.hash = hash;

    // For some reason we need to unset this to change the params
    isolatorUrlObject.search = null;

    // Tunnel v2
    ctx.cachedUrl = cachedUrl;
    ctx.isolatorUrl = isolatorUrlObject.format();
  } else {
    // Tunnel v1
    ctx.isolatorUrl = cachedUrl;
  }
};

export const testConnection = async (ctx) => {
  try {
    await ctx.http.fetch(ctx.isolatorUrl);
  } catch (err) {
    ctx.log.debug(err);
    throw new Error(failed(ctx).output);
  }
};

export default createTask({
  title: initial.title,
  skip: (ctx) => ctx.skip || !ctx.options.createTunnel,
  steps: [transitionTo(pending), createTunnel, testConnection, transitionTo(success, true)],
});
