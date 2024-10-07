import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { error } from '../../components/icons';
import link from '../../components/link';

export default ({ command }: { command: string }) =>
  dedent(chalk`
    ${error} {bold Unable to execute command}: ${command}
    Chromatic only works from inside a Git repository.

    You can initialize a new Git repository with \`git init\`.

    You will also need a single commit in order to run a build. To do that:

    - Add a file (or multiple files) with \`git add <FILE_PATH(S)>\`
    - Commit the file(s) with \`git commit --message="<MESSAGE>"\`

    Once you've done so, please run this build again.

    For more information on Git, feel free to check out the Pro Git book: ${link('https://git-scm.com/book/en/v2')}
  `);
