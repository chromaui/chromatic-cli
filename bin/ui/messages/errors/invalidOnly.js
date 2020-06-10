import chalk from 'chalk';
import dedent from 'ts-dedent';

import { error } from '../../components/icons';

export default () =>
  dedent(chalk`
    ${error} Invalid {bold --only}
    Value must be provided in the form {bold 'Path/To/MyComponent:MyStory'}.
    Globbing is supported on either side, for example: 'Pages/**:*'
  `);
