import intro from './intro';

export default {
  title: 'CLI/Messages/Info',
};

const pkg = {
  name: 'chromatic',
  version: '4.0.3',
  description: 'Visual Testing for Storybook',
  homepage: 'https://www.chromatic.com',
  docs: 'https://www.chromatic.com/docs/cli',
  bugs: {
    url: 'https://github.com/chromaui/chromatic-cli',
    email: 'support@chromatic.com',
  },
};

export const Intro = () => intro({ pkg });
