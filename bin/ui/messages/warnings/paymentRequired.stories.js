import paymentRequired from './paymentRequired';

export default {
  title: 'CLI/Messages/Warnings',
};

export const PaymentRequired = () =>
  paymentRequired({
    billingUrl: 'https://www.chromatic.com/billing?accountId=5af25af03c9f2c4bdccc0fcb',
  });
