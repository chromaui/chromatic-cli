import wroteReport from './wroteReport';

export default {
  title: 'CLI/Messages/Info',
};

export const WroteReport = () => wroteReport('./chromatic-test-report.xml');
