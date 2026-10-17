/**
 * The project: where it is, what the user configured, and every read of its disk and git index
 * behind one interface, with a real adapter and an in-memory one.
 */
export type { ManifestInput } from './manifestInput';
export type { ProjectFiles } from './projectFiles';
export { realProjectFiles } from './projectFiles';
export type { InMemoryDisk } from './projectFiles.fake';
export { inMemoryProjectFiles } from './projectFiles.fake';
