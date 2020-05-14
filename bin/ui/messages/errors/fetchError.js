import chalk from 'chalk';
import dedent from 'ts-dedent';

import { error } from '../../components/icons';
import link from '../../components/link';

const lcfirst = str => `${str.charAt(0).toLowerCase()}${str.substr(1)}`;

export default function fetchError({ title }) {
  return dedent(chalk`
    ${error} {bold Failed to ${lcfirst(title)}}
    Could not connect to the Chromatic API. Check your internet connection or try again later.
    In case of an outage, we provide status updates at ${link('https://twitter.com/chromaui')}
    Check ${link('http://status.chromatic.com')} for service uptime.
  `);
}
