import chalk from 'chalk';

import { error } from '../../components/icons';

export default statusMessage =>
  chalk`${error} {bold Workspace not up-to-date with remote}\n${statusMessage}`;
