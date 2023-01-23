import invalidOwnerName from './invalidOwnerName';

export default {
  title: 'CLI/Messages/Errors',
};

export const InvalidOwnerName = () => invalidOwnerName('branchOwner', 'repoOwner');
