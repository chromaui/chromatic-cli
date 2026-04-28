import nodePath from 'node:path';

import reportBuilder, { TestSuite } from 'junit-report-builder';

import { Logger } from '../../lib/log';
import { Ports } from '../../lib/ports';
import type { Context, Options } from '../../types';
import wroteReport from '../../ui/messages/info/wroteReport';

interface VisualTest {
  status: string;
  result: string;
  spec: { name: string; component: { name: string; displayName: string } };
  parameters: { viewport: number; viewportIsDefault: boolean };
  mode: { name: string };
}

export type ReportPhasePorts = Pick<Ports, 'chromatic' | 'clock'>;

export interface ReportPhaseInput {
  options: Pick<Options, 'junitReport'>;
  build: Pick<Context['build'], 'number' | 'reportToken'>;
  log: Logger;
  ports: ReportPhasePorts;
}

export interface ReportPhaseOutput {
  /** Absolute path to the generated JUnit XML report, or undefined when no report was requested. */
  reportPath?: string;
}

/**
 * Pure orchestration of the `report` phase. Pulls paginated test data from
 * the chromatic port, materializes a JUnit XML report on disk, and returns
 * the resolved report path. A no-op when `--junit-report` is not set.
 *
 * @param input Phase inputs.
 *
 * @returns The {@link ReportPhaseOutput} carrying `reportPath` when a report was written.
 */
export async function runReportPhase(input: ReportPhaseInput): Promise<ReportPhaseOutput> {
  const { junitReport } = input.options;
  const { number: buildNumber } = input.build;

  const file =
    typeof junitReport === 'boolean' && junitReport
      ? 'chromatic-build-{buildNumber}.xml'
      : junitReport;
  if (!file) {
    input.log.debug('junit report not configured, skipping');
    return {};
  }

  const reportPath = nodePath.resolve(file.replaceAll('{buildNumber}', String(buildNumber)));
  const build = await fetchAllTests(input);
  const buildTime = (build.completedAt || input.ports.clock.now()) - build.createdAt;

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

  reportBuilder.writeTo(reportPath);
  input.log.info(wroteReport(reportPath, 'JUnit XML'));
  return { reportPath };
}

async function fetchAllTests(input: ReportPhaseInput) {
  const limit = 1000;
  let skip = 0;
  const allTests: VisualTest[] = [];

  while (true) {
    const build = await input.ports.chromatic.getReport(
      { buildNumber: input.build.number, skip, limit },
      { reportToken: input.build.reportToken }
    );
    allTests.push(...build.tests);
    if (build.tests.length < limit) {
      return { ...build, tests: allTests };
    }
    skip += limit;
  }
}

/**
 * Generate a single `<testcase>` within a JUnit report.
 *
 * @param suite The {@link TestSuite} we're currently processing.
 * @param test The {@link VisualTest} we're currently processing.
 */
export function generateReportTestCase(suite: TestSuite, test: VisualTest): void {
  const { status, result, spec, parameters, mode } = test;
  const testSuffixName = mode.name || `[${parameters.viewport}px]`;
  const suffix = parameters.viewportIsDefault ? '' : testSuffixName;
  // Transform story path to class path.
  const testCase: any = suite.testCase().className(spec.component.name.replaceAll(/[/|]/g, '.'));
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
}
