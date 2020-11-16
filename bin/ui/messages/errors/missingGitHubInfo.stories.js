import missingGitHubInfo from './missingGitHubInfo';

export default {
  title: 'CLI/Messages/Errors',
};

export const MissingGitHubInfo = () => missingGitHubInfo({ TRAVIS_EVENT_TYPE: 'pull_request' });
