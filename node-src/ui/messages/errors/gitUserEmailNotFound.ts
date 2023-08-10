import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { error } from '../../components/icons';

export default () =>
  `${dedent(chalk`
    ${error} {bold Failed to find the current git user's email}
    Git email required for Visual Tests addon builds.

    In order to associate your local changes with later CI builds, you need to configure
    git with the email address you'll commit with.
    You can do this with \`git config --global user.email YOUR_EMAIL\`
  `)}`;
