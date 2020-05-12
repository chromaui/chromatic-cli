import debug from 'debug';
import loggly from 'node-loggly-bulk';
import { format } from 'util';
import stripAnsi from 'strip-ansi';

import { LOGGLY_CUSTOMER_TOKEN } from '../constants';

const isDebugging = !!process.env.DEBUG;

export default function sendDebugToLoggly({ sessionId }) {
  if (process.env.DISABLE_LOGGING) {
    return;
  }

  const client = loggly.createClient({
    token: LOGGLY_CUSTOMER_TOKEN,
    subdomain: 'hichroma',
    tags: ['chromatic-cli'],
    json: true,
  });

  debug.enable('chromatic-cli:*,localtunnel:*');

  debug.log = (...args) => {
    const msg = format(...args);
    client.log({ sessionId, msg: stripAnsi(msg) });

    // Is the user debugging already? If so they will get what we want to debug :shrug:
    if (isDebugging) {
      process.stderr.write(`${msg}\n`);
    }
  };
}
