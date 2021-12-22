import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { error as icon } from '../../components/icons';
import link from '../../components/link';

const lcfirst = (str) => `${str.charAt(0).toLowerCase()}${str.substr(1)}`;

export default function graphqlError({ title }, { message, extensions = {} } = {}) {
  const error = message
    ? chalk`\n{dim → ${extensions.code ? `${extensions.code}: ${message}` : message}}`
    : '';
  return dedent(chalk`
    ${icon} {bold Failed to ${lcfirst(title)}}

    Error communicating with the Chromatic API. Check if your Chromatic client is up-to-date.
    In case of an outage, we provide status updates at ${link('https://twitter.com/chromaui')}
    Check ${link('http://status.chromatic.com')} for service uptime.
    ${error}
  `);
}
