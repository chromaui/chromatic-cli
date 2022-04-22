import { Context } from '../types';
import { delay } from './utils';

const getBuildQuery = (prefix) => `
  query ${prefix}BuildQuery($number: Int!) {
    app {
      build(number: $number) {
        id
        number
        status
        specCount
        componentCount
        testCount
        changeCount
        errorCount: testCount(statuses: [BROKEN])
        actualTestCount: testCount(statuses: [IN_PROGRESS])
        actualCaptureCount
        inheritedCaptureCount
        webUrl
        cachedUrl
        reportToken
        browsers {
          browser
        }
        features {
          uiTests
          uiReview
        }
        autoAcceptChanges
        wasLimited
        app {
          account {
            exceededThreshold
            paymentRequired
            billingUrl
          }
          repository {
            provider
          }
          setupUrl
        }
        tests {
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

const getUpdateQuery = (prefix) => `
  query ${prefix}UpdateQuery($number: Int!) {
    app {
      build(number: $number) {
        id
        status(legacy: false)
        autoAcceptChanges
        inProgressCount: testCount(statuses: [IN_PROGRESS])
        testCount
        changeCount
        errorCount: testCount(statuses: [BROKEN])
      }
    }
  }
`;

export const waitForBuild = async (
  ctx: Context,
  prefix: string,
  callback: any,
  n = 0
): Promise<Context['build']> => {
  const query = n === 0 ? getBuildQuery(prefix) : getUpdateQuery(prefix);
  const { number, reportToken } = ctx.announcedBuild;
  const headers = { Authorization: `Bearer ${reportToken}` };
  const { app } = await ctx.client.runQuery(query, { number }, { headers });

  const build: Context['build'] = { ...ctx.build, ...app.build };
  if (callback(build)) return build;
  if (['BROKEN', 'FAILED', 'CANCELLED'].includes(build.status)) throw new Error('Build errored');

  await delay(ctx.env.CHROMATIC_POLL_INTERVAL);
  return waitForBuild(ctx, prefix, callback, n + 1);
};
