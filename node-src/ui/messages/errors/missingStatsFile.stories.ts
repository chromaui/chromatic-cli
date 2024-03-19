import missingStatsFile from './missingStatsFile';

export default {
  title: 'CLI/Messages/Errors',
};

export const MissingStatsFile = () => missingStatsFile({ legacy: false });

export const MissingStatsFileLegacy = () => missingStatsFile({ legacy: true });
