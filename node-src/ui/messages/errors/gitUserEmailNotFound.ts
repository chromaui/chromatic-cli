import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { error } from '../../components/icons';
import link from '../../components/link';

const localBuildsDocsLink =
  'https://www.chromatic.com/docs/visual-tests-addon/#what-are-local-builds-and-how-are-they-different-from-builds';

export default () =>
  `${dedent(chalk`
    ${error} {bold Failed to find the current git user's email}
    We were unable to find your git email so this local build
    will not belong to you and will not affect your future baselines.
    Read more: ${link(localBuildsDocsLink)}
    
    In order to associate your local changes with later CI builds, you
    need to configure git with the email address you'll commit with.
    You can do this with \`git config --global user.email YOUR_EMAIL\`.

    Once you've done so, please run this build again.
  `)}`;
