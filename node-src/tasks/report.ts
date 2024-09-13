import reportBuilder from 'junit-report-builder';
import path from 'path';

import { createTask, transitionTo } from '../lib/tasks';
import { Context } from '../types';
import wroteReport from '../ui/messages/info/wroteReport';
import { initial, pending, success } from '../ui/tasks/report';

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
      tests: {
        status: string;
        result: string;
        spec: {
          name: string;
          component: {
            name: string;
            displayName: string;
          };
        };
        parameters: {
          viewport: number;
          viewportIsDefault: boolean;
        };
        mode: {
          name: string;
        };
      }[];
    };
  };
}

// TODO: refactor this function
// eslint-disable-next-line complexity
export const generateReport = async (ctx: Context) => {
  const { client, log } = ctx;
  const { junitReport } = ctx.options;
  const { number: buildNumber, reportToken } = ctx.build;

  const file =
    typeof junitReport === 'boolean' && junitReport
      ? 'chromatic-build-{buildNumber}.xml'
      : junitReport;
  ctx.reportPath = path.resolve(file.replaceAll('{buildNumber}', String(buildNumber)));

  const {
    app: { build },
  } = await client.runQuery<ReportQueryResult>(
    ReportQuery,
    { buildNumber },
    { headers: { Authorization: `Bearer ${reportToken}` } }
  );
  const buildTime = (build.completedAt || Date.now()) - build.createdAt;

  const suite = reportBuilder
    .testSuite()
    .name(`Chromatic build ${build.number}`)
    .time(Math.round(buildTime / 1000))
    .timestamp(new Date(build.createdAt).toISOString())
    .property('buildNumber', build.number)
    .property('buildStatus', build.status)
    .property('buildUrl', build.webUrl)
    .property('storybookUrl', build.storybookUrl);

  for (const { status, result, spec, parameters, mode } of build.tests) {
    const testSuffixName = mode.name || `[${parameters.viewport}px]`;
    const suffix = parameters.viewportIsDefault ? '' : testSuffixName;
    const testCase = suite
      .testCase()
      .className(spec.component.name.replaceAll(/[|/]/g, '.')) // transform story path to class path
      .name(`${spec.name} ${suffix}`);

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
  }

  reportBuilder.writeTo(ctx.reportPath);
  log.info(wroteReport(ctx.reportPath, 'JUnit XML'));
};

export default createTask({
  name: 'report',
  title: initial.title,
  skip: (ctx: Context) => ctx.skip,
  steps: [transitionTo(pending), generateReport, transitionTo(success, true)],
});
