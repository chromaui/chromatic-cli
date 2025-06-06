import retry from 'async-retry';
import dns from 'dns';
import { HttpsProxyAgentOptions } from 'https-proxy-agent';
import fetch, { RequestInit, Response } from 'node-fetch';

import { Context } from '../types';
import getDNSResolveAgent from './getDNSResolveAgent';
import getProxyAgent from './getProxyAgent';

/**
 * A custom HTTP client error.
 */
export class HTTPClientError extends Error {
  response: Response;

  constructor(fetchResponse: Response, message?: string, ...parameters: any[]) {
    super(...parameters);

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, HTTPClientError);
    }

    this.response = fetchResponse;
    this.message =
      message ||
      `HTTPClient failed to fetch ${fetchResponse.url}, got ${fetchResponse.status}/${fetchResponse.statusText}`;
  }
}

export interface HTTPClientOptions {
  headers?: Record<string, string>;
  retries?: number;
}

export interface HTTPClientFetchOptions {
  noLogErrorBody?: boolean;
  proxy?: HttpsProxyAgentOptions<any>;
  retries?: number;
}

/**
 * A basic wrapper class for fetch with the ability to retry fetches
 */
export default class HTTPClient {
  env: Context['env'];

  log: Context['log'];

  headers: Record<string, string>;

  retries: number;

  constructor(
    { env, log }: Pick<Context, 'env' | 'log'>,
    { headers = {}, retries = 0 }: HTTPClientOptions = {}
  ) {
    if (!log) throw new Error(`Missing required option in HTTPClient: log`);
    this.env = env;
    this.log = log;
    this.headers = headers;
    this.retries = retries;
  }

  async fetch(url: string, options: RequestInit = {}, options_: HTTPClientFetchOptions = {}) {
    let agent =
      options.agent || getProxyAgent({ env: this.env, log: this.log }, url, options_.proxy);

    if (this.env.CHROMATIC_DNS_SERVERS && this.env.CHROMATIC_DNS_SERVERS.length > 0) {
      this.log.debug(`Using custom DNS servers: ${this.env.CHROMATIC_DNS_SERVERS?.join(', ')}`);
      dns.setServers(this.env.CHROMATIC_DNS_SERVERS ?? []);
      agent = getDNSResolveAgent();
    }

    // The user can override retries and set it to 0
    const retries = options_.retries === undefined ? this.retries : options_.retries;
    const onRetry = (err, n) => {
      this.log.debug({ url, err }, `Fetch failed; retrying ${n}/${retries}`);
      // node-fetch includes ENOTFOUND in the message, but undici (native fetch in ts-node) doesn't.
      if (err.message.includes('ENOTFOUND') || [err.code, err.cause?.code].includes('ENOTFOUND')) {
        if (!agent) {
          this.log.warn('Fetch failed due to DNS lookup; switching to custom DNS resolver');
          agent = getDNSResolveAgent();
        } else if (
          this.env.CHROMATIC_DNS_FAILOVER_SERVERS &&
          this.env.CHROMATIC_DNS_FAILOVER_SERVERS.length > 0
        ) {
          this.log.warn('Fetch failed due to DNS lookup; switching to failover DNS servers');
          dns.setServers(this.env.CHROMATIC_DNS_FAILOVER_SERVERS ?? []);
        }
      }
    };

    return retry(
      async () => {
        const headers = { ...this.headers, ...options.headers };
        const result = await fetch(url, { ...options, agent, headers });
        if (!result.ok) {
          const error = new HTTPClientError(result);
          // You can only call text() or json() once, so if we are going to handle it outside of here..
          if (!options_.noLogErrorBody) {
            const body = await result.text();
            this.log.debug(error.message);
            this.log.debug(body);
          }
          throw error;
        }
        return result;
      },
      { retries, onRetry }
    );
  }

  async fetchBuffer(url, options) {
    const result = await this.fetch(url, options);
    return result.buffer();
  }
}
