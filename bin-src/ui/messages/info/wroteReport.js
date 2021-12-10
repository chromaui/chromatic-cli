import chalk from 'chalk';

import { info } from '../../components/icons';

export default (filePath, label) => chalk`${info} Wrote ${label} report to {bold ${filePath}}`;
