import { describe, expect, it, vi } from 'vitest';

import * as git from '../git/git';
import { installDependencies as unmockedInstallDependencies } from '../lib/installDependencies';
import TestLogger from '../lib/testLogger';
import { runRestoreWorkspace } from './restoreWorkspace';

vi.mock('../git/git');
vi.mock('../lib/installDependencies');

const checkoutPrevious = vi.mocked(git.checkoutPrevious);
const discardChanges = vi.mocked(git.discardChanges);
const installDependencies = vi.mocked(unmockedInstallDependencies);

describe('runRestoreWorkspace', () => {
  it('discards changes, checks out the previous branch and reinstalls dependencies', async () => {
    const ctx = { log: new TestLogger() } as any;

    await runRestoreWorkspace(ctx);

    expect(discardChanges).toHaveBeenCalledTimes(2);
    expect(checkoutPrevious).toHaveBeenCalledWith(ctx);
    expect(installDependencies).toHaveBeenCalled();
  });

  it('checks out the previous branch before discarding lockfile changes', async () => {
    const order: string[] = [];
    checkoutPrevious.mockImplementation(async () => {
      order.push('checkoutPrevious');
      return '';
    });
    discardChanges.mockImplementation(async () => {
      order.push('discardChanges');
      return '';
    });
    const ctx = { log: new TestLogger() } as any;

    await runRestoreWorkspace(ctx);

    expect(order).toEqual(['discardChanges', 'checkoutPrevious', 'discardChanges']);
  });
});
