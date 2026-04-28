import { createTask, transitionTo } from '../lib/tasks';
import { runReportPhase } from '../run/phases/report';
import { Context } from '../types';
import { initial, pending, success } from '../ui/tasks/report';

export { generateReportTestCase } from '../run/phases/report';

export const generateReport = async (ctx: Context) => {
  const result = await runReportPhase({
    options: ctx.options,
    build: ctx.build,
    log: ctx.log,
    ports: ctx.ports,
  });
  if (result.reportPath !== undefined) {
    ctx.reportPath = result.reportPath;
  }
};

/**
 * Sets up the Listr task for generating a JUnit report.
 *
 * @param _ The context set when executing the CLI.
 *
 * @returns A Listr task.
 */
export default function main(_: Context) {
  return createTask({
    name: 'report',
    title: initial.title,
    skip: (ctx: Context) => ctx.skip,
    steps: [transitionTo(pending), generateReport, transitionTo(success, true)],
  });
}
