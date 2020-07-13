import reportBuilder from 'junit-report-builder';
import path from 'path';

import { createTask, transitionTo } from '../lib/tasks';
import { baseStorybookUrl } from '../lib/utils';
import wroteReport from '../ui/messages/info/wroteReport';
import { initial, pending, success } from '../ui/tasks/report';

const ReportQuery = `
  query ReportQuery($buildNumber: Int!) {
    app {
      build(number: $buildNumber) {
        number
        status
        webUrl
        cachedUrl
        createdAt
        completedAt
        snapshots {
          status
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
        }
      }
    }
  }
`;

export const generateReport = async ctx => {
  const { client, log } = ctx;
  const { junitReport } = ctx.options;
  const { number: buildNumber, reportToken } = ctx.build;

  const file = junitReport === true ? 'chromatic-build-{buildNumber}.xml' : junitReport;
  ctx.reportPath = path.resolve(file.replace(/{buildNumber}/g, buildNumber));

  const result = await client.runQuery(
    ReportQuery,
    { buildNumber },
    { Authorization: `Bearer ${reportToken}` }
  );
  const { build } = result.app;
  const buildTime = (build.completedAt || Date.now()) - build.createdAt;

  const suite = reportBuilder
    .testSuite()
    .name(`Chromatic build ${build.number}`)
    .time(Math.round(buildTime / 1000))
    .timestamp(new Date(build.createdAt).toISOString())
    .property('buildNumber', build.number)
    .property('buildStatus', build.status)
    .property('buildUrl', build.webUrl)
    .property('storybookUrl', baseStorybookUrl(build.cachedUrl));

  build.snapshots.forEach(({ status, spec, parameters }) => {
    const suffix = parameters.viewportIsDefault ? '' : ` [${parameters.viewport}px]`;
    const testCase = suite
      .testCase()
      .className(spec.component.name.replace(/[|/]/g, '.')) // transform story path to class path
      .name(`${spec.name}${suffix}`);

    switch (status) {
      case 'SNAPSHOT_ERROR':
        testCase.error('Server error while taking snapshot, please try again', status);
        break;
      case 'SNAPSHOT_CAPTURE_ERROR':
        testCase.error('Snapshot is broken due to an error in your Storybook', status);
        break;
      case 'SNAPSHOT_DENIED':
        testCase.failure('Snapshot was denied by a user', status);
        break;
      case 'SNAPSHOT_PENDING':
        testCase.failure('Snapshot contains visual changes and must be reviewed', status);
        break;
      case 'SNAPSHOT_NO_CAPTURE':
        testCase.skipped();
        break;
      default:
    }
  });

  reportBuilder.writeTo(ctx.reportPath);
  log.info(wroteReport(ctx.reportPath));
};

export default createTask({
  title: initial.title,
  skip: ctx => ctx.skip,
  steps: [transitionTo(pending), generateReport, transitionTo(success, true)],
});
