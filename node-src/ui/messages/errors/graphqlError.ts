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
 * @param error The GraphQL error received, with every error from the response in `errors`.
 *
 * @returns A message about the GraphQL errors.
 */
export default function graphqlError({ title }: { title: string }, error: GraphQLError) {
  const messages = (error.errors ?? [error])
    .filter(({ message }) => message)
    .map(({ message, extensions }) =>
      extensions && extensions.code ? `${extensions.code}: ${message}` : message
    );
  // The API repeats the same error for each item it fails on, such as each merged pull request.
  const details = [...new Set(messages)].map((message) => chalk`\n{dim → ${message}}`).join('');
  return dedent(chalk`
    ${icon} {bold Failed to ${lcfirst(title)}}

    Error communicating with the Chromatic API. Check if your Chromatic client is up-to-date.
    Service status updates are provided at ${link('https://status.chromatic.com')}
    ${details}
  `);
}
