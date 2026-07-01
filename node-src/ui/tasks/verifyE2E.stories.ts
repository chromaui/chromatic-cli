import frames from './verifyE2E.frames?clack';

export default { title: 'CLI/Tasks/Verify/E2E' };

export const Pending = () => frames.Pending;
export const RunOnlyChangedFiles = () => frames.RunOnlyChangedFiles;
export const RunOnlyFiles = () => frames.RunOnlyFiles;
export const RunOnlyNames = () => frames.RunOnlyNames;
export const AwaitingUpgrades = () => frames.AwaitingUpgrades;
export const Started = () => frames.Started;
export const Published = () => frames.Published;
export const ContinueSetup = () => frames.ContinueSetup;
export const DryRun = () => frames.DryRun;
export const Failed = () => frames.Failed;
