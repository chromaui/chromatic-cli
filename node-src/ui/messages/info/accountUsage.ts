import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { AccountUsage } from '../../../types';
import { info } from '../../components/icons';

const count = (value: number) => Math.round(value).toLocaleString('en-US');
const date = (timestamp: number) => new Date(timestamp).toISOString().slice(0, 10);

export default ({
  billableSnapshots,
  limit,
  utilization,
  periodStart,
  periodEnd,
}: AccountUsage) => {
  const usage =
    limit && utilization !== undefined
      ? `${count(billableSnapshots)} / ${count(limit)} (${count(utilization * 100)}%)`
      : count(billableSnapshots);

  return dedent(chalk`
    ${info} {bold Snapshot usage}: ${usage}
    Billing period: ${date(periodStart)} → ${date(periodEnd)}
  `);
};
