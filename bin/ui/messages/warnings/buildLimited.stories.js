import buildLimited from './buildLimited';

export default {
  title: 'CLI/Messages/Warnings',
};

export const BuildLimited = () =>
  buildLimited({
    billingUrl: 'https://www.chromatic.com/billing',
  });
