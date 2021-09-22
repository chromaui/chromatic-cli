import missingGitHubInfo from './missingGitHubInfo';

export default {
  title: 'CLI/Messages/Errors',
};

export const MissingGitHubInfo = () => missingGitHubInfo({ GITHUB_EVENT_NAME: 'pull_request' });
