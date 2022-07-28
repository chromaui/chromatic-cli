import chalk from 'chalk';
import { FetchError, Response } from 'node-fetch';
import { dedent } from 'ts-dedent';
import { lcfirst } from '../../../lib/utils';

import { error as icon } from '../../components/icons';
import link from '../../components/link';

export default function fetchError(
  { title }: { title: string },
  {
    error,
    response,
    statusCode,
  }: { error?: FetchError; response?: Response; statusCode?: Response['status'] } = {}
) {
  const err = error ? chalk`\n{dim → ${error.message || error.toString()}}` : '';
  const statusText = response && response.statusText ? ` ${response.statusText}` : '';
  const status = statusCode ? chalk`\n{dim → Status: ${statusCode}${statusText}}` : '';
  return dedent(chalk`
    ${icon} {bold Failed to ${lcfirst(title)}}

    Could not connect to the Chromatic API. Check your internet connection or try again later.
    Service status updates are provided at ${link('https://status.chromatic.com')}
    ${err}${status}
  `);
}
