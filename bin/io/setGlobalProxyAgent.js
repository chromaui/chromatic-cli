import https from 'https';
import HttpsProxyAgent from 'https-proxy-agent';

const setGlobalProxyAgent = ({ log }) => {
  const httpsProxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  const httpProxy = process.env.HTTP_PROXY || process.env.http_proxy;
  const noProxy = process.env.NO_PROXY || process.env.no_proxy;

  if ((httpsProxy || httpProxy) && !noProxy) {
    https.globalAgent = new HttpsProxyAgent(httpsProxy || httpProxy);
    log.info(`Using proxy server: ${httpsProxy || httpProxy}`);
  }
};

export default setGlobalProxyAgent;
