/* eslint-disable no-param-reassign */
import reportBuilder from 'junit-report-builder';
import path from 'path';

import { createTask, transitionTo } from '../lib/tasks';
import { delay, matchesBranch } from '../lib/utils';
import buildHasChanges from '../ui/messages/errors/buildHasChanges';
import buildHasErrors from '../ui/messages/errors/buildHasErrors';
import speedUpCI from '../ui/messages/info/speedUpCI';
import wroteReport from '../ui/messages/info/wroteReport';
import {
  buildComplete,
  buildError,
  buildFailed,
  buildPassed,
  initial,
  pending,
} from '../ui/tasks/snapshot';

const TesterBuildQuery = `
  query TesterBuildQuery($buildNumber: Int!) {
    app {
      build(number: $buildNumber) {
        id
        status
        autoAcceptChanges
        inProgressCount: snapshotCount(statuses: [SNAPSHOT_IN_PROGRESS])
        snapshotCount
        changeCount
        errorCount: snapshotCount(statuses: [SNAPSHOT_CAPTURE_ERROR])
      }
    }
  }
`;

const ReportQuery = `
  query ReportQuery($buildNumber: Int!) {
    app {
      build(number: $buildNumber) {
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

export const generateReport = async (ctx, task) => {
  const { client, log, options } = ctx;
  const { number: buildNumber, reportToken } = ctx.build;

  const file = options.report === true ? 'chromatic-build-{buildNumber}.xml' : options.report;
  ctx.reportPath = path.resolve(file.replace(/{buildNumber}/g, buildNumber));

  task.output = `Generating XML report at ${ctx.reportPath}`;

  const { app } = await client.runQuery(
    ReportQuery,
    { buildNumber },
    { Authorization: `Bearer ${reportToken}` }
  );
  const { createdAt, completedAt, snapshots } = app.build;
  const buildTime = (completedAt || Date.now()) - createdAt;

  const suite = reportBuilder
    .testSuite()
    .name(`Chromatic build ${buildNumber}`)
    .time(Math.round(buildTime / 1000))
    .timestamp(new Date(createdAt).toISOString());

  snapshots.forEach(({ status, spec, parameters }) => {
    const suffix = parameters.viewportIsDefault ? '' : ` [${parameters.viewport}px]`;
    const testCase = suite
      .testCase()
      .className(spec.component.name)
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

export const takeSnapshots = async (ctx, task) => {
  const { client, git, log, options } = ctx;
  const { number: buildNumber, snapshots } = ctx.build;

  if (ctx.build.app.repository && ctx.uploadedBytes) {
    log.info('');
    log.info(speedUpCI(ctx.build.app.repository.provider));
  }

  const snapshotLabels =
    options.interactive &&
    snapshots.map(({ spec, parameters }) => {
      const suffix = parameters.viewportIsDefault ? '' : ` [${parameters.viewport}px]`;
      return `${spec.component.displayName} › ${spec.name}${suffix}`;
    });

  const waitForBuild = async () => {
    const { app } = await client.runQuery(TesterBuildQuery, { buildNumber });
    ctx.build = { ...ctx.build, ...app.build };

    if (app.build.status !== 'BUILD_IN_PROGRESS') {
      return ctx.build;
    }

    if (options.interactive) {
      const { inProgressCount, snapshotCount } = ctx.build;
      const cursor = snapshotCount - inProgressCount + 1;
      const label = snapshotLabels[cursor - 1] || '';
      task.output = pending({ ...ctx, cursor, label }).output;
    }

    await delay(ctx.env.CHROMATIC_POLL_INTERVAL);
    return waitForBuild();
  };

  const build = await waitForBuild();

  if (options.report) {
    await generateReport(ctx, task);
  }

  switch (build.status) {
    case 'BUILD_PASSED':
      ctx.exitCode = 0;
      transitionTo(buildPassed, true)(ctx, task);
      break;

    // They may have sneakily looked at the build while we were waiting
    case 'BUILD_ACCEPTED':
    case 'BUILD_PENDING':
    case 'BUILD_DENIED': {
      ctx.exitCode = 0;
      if (!build.autoAcceptChanges && !matchesBranch(options.exitZeroOnChanges, git.branch)) {
        ctx.exitCode = 1;
        ctx.log.error(buildHasChanges(ctx));
      }
      transitionTo(buildComplete, true)(ctx, task);
      break;
    }

    case 'BUILD_FAILED':
      ctx.exitCode = 2;
      ctx.log.error(buildHasErrors(ctx));
      transitionTo(buildFailed, true)(ctx, task);
      break;

    case 'BUILD_TIMED_OUT':
    case 'BUILD_ERROR':
      ctx.exitCode = 3;
      transitionTo(buildError, true)(ctx, task);
      break;

    default:
      throw new Error(`Unexpected build status: ${build.status}`);
  }
};

export default createTask({
  title: initial.title,
  skip: ctx => ctx.skipSnapshots,
  steps: [transitionTo(pending), takeSnapshots],
});
