import chalk from 'chalk';

import { info } from '../../components/icons';

export default filePath => chalk`${info} Wrote JUnit XML report to {bold ${filePath}}`;
