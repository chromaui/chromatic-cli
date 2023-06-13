import buildLimited from './buildLimited';

export default {
  title: 'CLI/Messages/Warnings',
};

export const BuildLimited = () =>
  buildLimited({
    billingUrl: 'https://www.chromatic.com/billing?accountId=5af25af03c9f2c4bdccc0fcb',
  });
