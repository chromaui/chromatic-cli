import { describe, expect, it } from 'vitest';

import { Context } from '../types';
import getTasks, { runPatchBuild, runUploadBuild } from './index';

const makeContext = (options: Partial<Context['options']> = {}) => ({ options }) as Context;

describe('getTasks', () => {
  it('selects the patch build task list when patchHeadRef and patchBaseRef are both set', () => {
    const ctx = makeContext({ patchHeadRef: 'feature', patchBaseRef: 'main' });

    const tasks = getTasks(ctx);

    expect(tasks).toHaveLength(runPatchBuild.length);
    expect(tasks.map((task) => task.title)).toEqual(['Prepare workspace', 'Restore workspace']);
  });

  it('selects the upload build task list when neither patch ref option is set', () => {
    const ctx = makeContext({});

    const tasks = getTasks(ctx);

    expect(tasks).toHaveLength(runUploadBuild.length);
  });

  it('selects the upload build task list when only patchHeadRef is set', () => {
    const ctx = makeContext({ patchHeadRef: 'feature' });

    const tasks = getTasks(ctx);

    expect(tasks).toHaveLength(runUploadBuild.length);
  });

  it('selects the upload build task list when only patchBaseRef is set', () => {
    const ctx = makeContext({ patchBaseRef: 'main' });

    const tasks = getTasks(ctx);

    expect(tasks).toHaveLength(runUploadBuild.length);
  });

  it('appends the report task when junitReport is set', () => {
    const ctx = makeContext({ junitReport: 'chromatic-build-{buildNumber}.xml' });

    const tasks = getTasks(ctx);

    expect(tasks).toHaveLength(runUploadBuild.length + 1);
    expect(tasks.at(-1)?.title).toBe('Generate build report');
  });

  it('appends the report task to the patch build task list when junitReport is set', () => {
    const ctx = makeContext({
      patchHeadRef: 'feature',
      patchBaseRef: 'main',
      junitReport: 'chromatic-build-{buildNumber}.xml',
    });

    const tasks = getTasks(ctx);

    expect(tasks).toHaveLength(runPatchBuild.length + 1);
    expect(tasks.at(-1)?.title).toBe('Generate build report');
  });
});
