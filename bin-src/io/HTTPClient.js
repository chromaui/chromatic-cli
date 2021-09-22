import retry from 'async-retry';
import fetch from 'node-fetch';

import getProxyAgent from './getProxyAgent';

export class HTTPClientError extends Error {
  constructor(fetchResponse, message, ...params) {
    super(...params);

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

// A basic wrapper class for fetch with the ability to retry fetches
export default class HTTPClient {
  constructor({ env, log, headers = {}, retries = 0 }) {
    if (!log) throw new Error(`Missing required option in HTTPClient: log`);
    this.env = env;
    this.log = log;
    this.headers = headers;
    this.retries = retries;
  }

  async fetch(url, options = {}, opts = {}) {
    const agent = options.agent || getProxyAgent({ env: this.env, log: this.log }, url, opts.proxy);
    // The user can override retries and set it to 0
    const retries = typeof opts.retries !== 'undefined' ? opts.retries : this.retries;
    const onRetry = (err, n) =>
      this.log.debug({ url, err }, `Fetch failed; retrying ${n}/${retries}`);

    return retry(
      async () => {
        const headers = { ...this.headers, ...options.headers };
        const res = await fetch(url, { ...options, agent, headers });
        if (!res.ok) {
          const error = new HTTPClientError(res);
          // You can only call text() or json() once, so if we are going to handle it outside of here..
          if (!opts.noLogErrorBody) {
            const body = await res.text();
            this.log.debug({ body }, error.message);
          }
          throw error;
        }
        return res;
      },
      { retries, onRetry }
    );
  }

  async fetchBuffer(url, options) {
    const res = await this.fetch(url, options);
    return res.buffer();
  }
}
