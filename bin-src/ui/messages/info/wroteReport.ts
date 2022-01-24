import chalk from 'chalk';

import { info } from '../../components/icons';

export default (filePath: string, label: string) =>
  chalk`${info} Wrote ${label} report to {bold ${filePath}}`;
