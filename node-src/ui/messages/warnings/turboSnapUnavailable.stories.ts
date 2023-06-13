import turboSnapUnavailable from './turboSnapUnavailable';

export default {
  title: 'CLI/Messages/Warnings',
};

export const TurboSnapUnavailable = () =>
  turboSnapUnavailable({
    build: {
      app: {
        manageUrl: 'https://www.chromatic.com/manage?appId=59c59bd0183bd100364e1d57',
      },
    },
  });
