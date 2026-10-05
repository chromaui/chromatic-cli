import pluralize from 'pluralize';

import { Context } from '../../types';

// Adapted from `lib/git-provider-content/formatUITestsCommitStatus.ts` in the chromatic monorepo.
// That file produces the UI Tests commit status description, which the GitHub pull request comment
// embeds verbatim. As there, the build status picks both the wording and the count: a PENDING
// build reports its PENDING tests, ACCEPTED its ACCEPTED tests, DENIED its DENIED tests
// (see `commitStatusFromNextBuildStatus.ts`).
//
// Deliberate deviations:
// - The CLI always names the kind of change, so a build without accessibility tests reads
//   "N visual changes" where the monorepo reads "N changes".
// - The monorepo appends " with N discussions" from a comment thread count that the CLI cannot
//   query with a project token, so that suffix is omitted here.

interface FormatParameters {
  testCount: number;
  hasAccessibility: boolean;
}

export const formatChangeCount = ({ testCount, hasAccessibility }: FormatParameters) =>
  pluralize(
    hasAccessibility ? 'visual and accessibility changes' : 'visual changes',
    testCount,
    true
  );

export const formatPendingMessage = ({ testCount, hasAccessibility }: FormatParameters) =>
  `${formatChangeCount({ testCount, hasAccessibility })} must be accepted as ${pluralize('baseline', testCount)}`;

export const formatAcceptedMessage = ({ testCount, hasAccessibility }: FormatParameters) =>
  `${formatChangeCount({ testCount, hasAccessibility })} accepted as ${pluralize('baseline', testCount)}`;

export const formatDeniedMessage = ({ testCount, hasAccessibility }: FormatParameters) =>
  `${formatChangeCount({ testCount, hasAccessibility })} denied`;

type ChangeStatusBuild = Partial<
  Pick<Context['build'], 'status' | 'pendingCount' | 'acceptedCount' | 'deniedCount' | 'features'>
>;

// The wording is a feature flag toggle, not a sum of per-kind counts, matching the commit status.
const hasAccessibility = (build: ChangeStatusBuild) =>
  build.features?.accessibilityTests?.enabled ?? false;

const formatterByStatus = {
  PENDING: {
    format: formatPendingMessage,
    count: (build: ChangeStatusBuild) => build.pendingCount,
  },
  ACCEPTED: {
    format: formatAcceptedMessage,
    count: (build: ChangeStatusBuild) => build.acceptedCount,
  },
  DENIED: { format: formatDeniedMessage, count: (build: ChangeStatusBuild) => build.deniedCount },
};

// Describes the tests that match the build status. Returns nothing for any other status, or when
// no test has that status. The counts are by test status, so ignored tests are excluded.
export const changeStatus = (build: ChangeStatusBuild) => {
  const formatter = formatterByStatus[build.status as keyof typeof formatterByStatus];
  const testCount = formatter?.count(build) ?? 0;
  if (testCount < 1) {
    return;
  }
  return formatter.format({ testCount, hasAccessibility: hasAccessibility(build) });
};

// Auto-accepted tests end with ACCEPTED status. Returns nothing when none were accepted.
export const autoAcceptedChanges = (build: ChangeStatusBuild) => {
  const testCount = build.acceptedCount ?? 0;
  if (testCount < 1) {
    return;
  }
  return `Auto-accepted ${formatChangeCount({ testCount, hasAccessibility: hasAccessibility(build) })}`;
};
