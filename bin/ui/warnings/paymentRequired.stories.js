import paymentRequired from './paymentRequired';

export default {
  title: 'CLI/Warnings',
};

export const PaymentRequired = () =>
  paymentRequired({
    billingUrl: 'https://www.chromatic.com/billing',
  });
