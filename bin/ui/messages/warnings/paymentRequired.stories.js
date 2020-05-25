import paymentRequired from './paymentRequired';

export default {
  title: 'CLI/Messages/Warnings',
};

export const PaymentRequired = () =>
  paymentRequired({
    billingUrl: 'https://www.chromatic.com/billing',
  });
