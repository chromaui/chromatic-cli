import missingTravisInfo from './missingTravisInfo';

export default {
  title: 'CLI/Messages/Errors',
};

export const MissingTravisInfo = () => missingTravisInfo({ TRAVIS_EVENT_TYPE: 'pull_request' });
