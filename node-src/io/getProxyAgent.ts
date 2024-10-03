import { HttpsProxyAgent, HttpsProxyAgentOptions } from 'https-proxy-agent';
import noProxy from 'no-proxy';
import { URL } from 'url';

import { Context } from '../types';

const agents = {};

const getProxyAgent = (
  { env, log }: Pick<Context, 'env' | 'log'>,
  url: string,
  options?: HttpsProxyAgentOptions<any>
) => {
  const proxy = env.HTTPS_PROXY || env.HTTP_PROXY;
  if (!proxy || noProxy(url)) return undefined;

  log.debug({ url, proxy, options }, 'Using proxy agent');
  const requestHost = new URL(url).host;
  if (!agents[requestHost]) {
    agents[requestHost] = new HttpsProxyAgent(proxy, options);
  }
  return agents[requestHost];
};

export default getProxyAgent;
