import HttpsProxyAgent from 'https-proxy-agent';
import noProxy from 'no-proxy';
import { URL } from 'url';

const agents = {};

const getProxyAgent = ({ env, log }, url, options = {}) => {
  const proxy = env.HTTPS_PROXY || env.HTTP_PROXY;
  if (!proxy || noProxy(url)) return undefined;

  log.debug({ url, proxy, options }, 'Using proxy agent');
  const requestHost = new URL(url).host;
  if (!agents[requestHost]) {
    const { hostname, port, protocol, username, password } = new URL(proxy);
    const auth = username && password ? `${username}:${password}` : undefined;
    agents[requestHost] = new HttpsProxyAgent({ auth, hostname, port, protocol, ...options });
  }
  return agents[requestHost];
};

export default getProxyAgent;
