import chalk from 'chalk';
import dedent from 'ts-dedent';

import { error } from '../../components/icons';

export default () =>
  dedent(chalk`
    ${error} Invalid {bold --only}
    Value must be provided in the form {bold 'Path/To/MyStory'}.
    Globbing is supported, for example: 'Pages/**'
  `);
