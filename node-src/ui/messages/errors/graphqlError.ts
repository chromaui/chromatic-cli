import chalk from 'chalk';
import { dedent } from 'ts-dedent';
import { GraphQLError } from '../../../io/GraphQLClient';

import { error as icon } from '../../components/icons';
import link from '../../components/link';

const lcfirst = (str: string) => `${str.charAt(0).toLowerCase()}${str.slice(1)}`;

export default function graphqlError(
  { title }: { title: string },
  { message, extensions }: GraphQLError
) {
  const error = message
    ? chalk`\n{dim → ${extensions && extensions.code ? `${extensions.code}: ${message}` : message}}`
    : '';
  return dedent(chalk`
    ${icon} {bold Failed to ${lcfirst(title)}}

    Error communicating with the Chromatic API. Check if your Chromatic client is up-to-date.
    Service status updates are provided at ${link('https://status.chromatic.com')}
    ${error}
  `);
}
