import reportBuilder, { TestSuite } from 'junit-report-builder';
import path from 'path';

import { createTask, transitionTo } from '../lib/tasks';
import { Context } from '../types';
import wroteReport from '../ui/messages/info/wroteReport';
import { initial, pending, success } from '../ui/tasks/report';

interface TestMode {
  name: string;
}

interface TestSpec {
  name: string;
  component: {
    name: string;
    displayName: string;
  };
}

interface TestParameters {
  viewport: number;
  viewportIsDefault: boolean;
}

interface VisualTest {
  status: string;
  result: string;
  spec: TestSpec;
  parameters: TestParameters;
  mode: TestMode;
}

const ReportQuery = `
  query ReportQuery($buildNumber: Int!) {
    app {
      build(number: $buildNumber) {
        number
        status(legacy: false)
        storybookUrl
        webUrl
        createdAt
        completedAt
        tests {
          status
          result
          spec {
            name
            component {
              name
              displayName
            }
          }
          parameters {
            viewport
            viewportIsDefault
          }
          mode {
            name
          }
        }
      }
    }
  }
`;
interface ReportQueryResult {
  app: {
    build: {
      number: number;
      status: string;
      storybookUrl: string;
      webUrl: string;
      createdAt: number;
      completedAt: number;
      tests: VisualTest[];
    };
  };
}

/**
 * Generate a JUnit report XML file for a particular run.
 *
 * @param ctx The {@link Context} for which we're generating a report.
 */
export const generateReport = async (ctx: Context) => {
  const { client, log } = ctx;
  const { junitReport } = ctx.options;
  const { number: buildNumber, reportToken } = ctx.build;

  const file =
    typeof junitReport === 'boolean' && junitReport
      ? 'chromatic-build-{buildNumber}.xml'
      : junitReport;

  if (!file) {
    log.debug('junit report not configured, skipping');
    return;
  }

  ctx.reportPath = path.resolve(file.replaceAll('{buildNumber}', String(buildNumber)));

  const {
    app: { build },
  } = await client.runQuery<ReportQueryResult>(
    ReportQuery,
    { buildNumber },
    { headers: { Authorization: `Bearer ${reportToken}` } }
  );
  const buildTime = (build.completedAt || Date.now()) - build.createdAt;

  const suite: TestSuite = reportBuilder
    .testSuite()
    .name(`Chromatic build ${build.number}`)
    .time(Math.round(buildTime / 1000))
    .timestamp(new Date(build.createdAt).toISOString())
    .property('buildNumber', build.number)
    .property('buildStatus', build.status)
    .property('buildUrl', build.webUrl)
    .property('storybookUrl', build.storybookUrl);

  for (const test of build.tests) {
    generateReportTestCase(suite, test);
  }

  reportBuilder.writeTo(ctx.reportPath);
  log.info(wroteReport(ctx.reportPath, 'JUnit XML'));
};

/**
 * Generate a single `<testcase>` within a JUnit report and test run with Chromatic.
 *
 * @param suite The {@link TestSuite} we're currently processing.
 * @param test The {@link VisualTest} we're currently processing, contained in `suite`.
 */
export const generateReportTestCase = (suite: TestSuite, test: VisualTest) => {
  const { status, result, spec, parameters, mode } = test;
  const testSuffixName = mode.name || `[${parameters.viewport}px]`;
  const suffix = parameters.viewportIsDefault ? '' : testSuffixName;
  const testCase: any = suite.testCase().className(spec.component.name.replaceAll(/[/|]/g, '.')); // transform story path to class path
  testCase.property('result', status).name(`${spec.name} ${suffix}`);

  switch (status) {
    case 'FAILED':
      testCase.error('Server error while taking snapshot, please try again', status);
      break;
    case 'BROKEN':
      testCase.error('Snapshot is broken due to an error in your Storybook', status);
      break;
    case 'DENIED':
      testCase.failure('Snapshot was denied by a user', status);
      break;
    case 'PENDING':
      testCase.failure('Snapshot contains visual changes and must be reviewed', status);
      break;
    default: {
      if (['SKIPPED', 'PRESERVED'].includes(result)) {
        testCase.skipped();
      }
    }
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
