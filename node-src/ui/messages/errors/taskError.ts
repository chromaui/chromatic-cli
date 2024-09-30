import chalk from 'chalk';

import { error } from '../../components/icons';

/**
 * Generate a failure message for a task that errored.
 *
 * @param task The task object that received an error.
 * @param task.title The title of the errored task.
 * @param err The error message received from the task.
 *
 * @returns A message about a failed task.
 */
export default function taskError({ title }: { title: string }, err: Error) {
  return [chalk`${error} {bold Failed to ${lcfirst(title)}}`, err.message].join('\n');
}

function lcfirst(str: string) {
  return `${str.charAt(0).toLowerCase()}${str.slice(1)}`;
}
