import chalk from 'chalk';
import dedent from 'ts-dedent';

import { error as icon } from '../../components/icons';
import link from '../../components/link';

const lcfirst = str => `${str.charAt(0).toLowerCase()}${str.substr(1)}`;

export default function fetchError({ title }, { error, response, statusCode } = {}) {
  const err = error ? chalk`\n{dim → ${error.toString()}}` : '';
  const statusMessage = response && response.statusMessage ? ` ${response.statusMessage}` : '';
  const status = statusCode ? chalk`\n{dim → Status: ${statusCode}${statusMessage}}` : '';
  return dedent(chalk`
    ${icon} {bold Failed to ${lcfirst(title)}}

    Could not connect to the Chromatic API. Check your internet connection or try again later.
    In case of an outage, we provide status updates at ${link('https://twitter.com/chromaui')}
    Check ${link('http://status.chromatic.com')} for service uptime.
    ${err}${status}
  `);
}
