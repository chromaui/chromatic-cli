import chalk from 'chalk';

import { info } from '../../components/icons';

export default filePath => chalk`${info} Wrote XML report to {bold ${filePath}}`;
