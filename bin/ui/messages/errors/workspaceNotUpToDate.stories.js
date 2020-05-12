import dedent from 'ts-dedent';

import workspaceNotUpToDate from './workspaceNotUpToDate';

export default {
  title: 'CLI/Messages/Errors',
};

const statusMessage = dedent(`
  Your branch and 'origin/new-ui' have diverged,
  and have 1 and 1 different commits each, respectively.
    (use "git pull" to merge the remote branch into yours)
`);

export const WorkspaceNotUpToDate = () => workspaceNotUpToDate(statusMessage);
