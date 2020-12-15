import missingGitHubInfo from './missingGitHubInfo';

export default {
  title: 'CLI/Messages/Errors',
};

export const MissingGitHubInfo = () => missingGitHubInfo({ GITHUB_WORKFLOW: 'pull_request' });
