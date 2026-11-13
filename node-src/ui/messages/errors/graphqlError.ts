import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { GraphQLError } from '../../../io/graphqlClient';
import { error as icon } from '../../components/icons';
import link from '../../components/link';

const lcfirst = (str: string) => `${str.charAt(0).toLowerCase()}${str.slice(1)}`;

/**
 * Generate a failure message for a GraphQL error.
 *
 * @param context The context of the error message (which task were we running when the error occurred)
 * @param context.title Name of the task when the error occurred.
 * @param errors The GraphQL errors received. The API can return several for one request.
 *
 * @returns A message about the GraphQL errors.
 */
export default function graphqlError({ title }: { title: string }, errors: GraphQLError[]) {
  const messages = errors
    .filter(({ message }) => message)
    .map(({ message, extensions }) =>
      extensions && extensions.code ? `${extensions.code}: ${message}` : message
    );
  // The API repeats the same error for each item it fails on, such as each merged pull request.
  const error = [...new Set(messages)].map((message) => chalk`\n{dim → ${message}}`).join('');
  return dedent(chalk`
    ${icon} {bold Failed to ${lcfirst(title)}}

    Error communicating with the Chromatic API. Check if your Chromatic client is up-to-date.
    Service status updates are provided at ${link('https://status.chromatic.com')}
    ${error}
  `);
}
