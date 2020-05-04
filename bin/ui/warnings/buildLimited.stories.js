import buildLimited from './buildLimited';

export default {
  title: 'CLI/Warnings',
};

export const BuildLimited = () =>
  buildLimited({
    billingUrl: 'https://www.chromatic.com/billing',
  });
