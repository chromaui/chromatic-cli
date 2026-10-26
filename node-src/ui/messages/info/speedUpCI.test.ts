import { describe, expect, it } from 'vitest';

import speedUpCI from './speedUpCI';

describe('speedUpCI', () => {
  it('renders known provider names', () => {
    expect(speedUpCI('github', false)).toContain('GitHub');
    expect(speedUpCI('gitlab', false)).toContain('GitLab');
    expect(speedUpCI('bitbucket', false)).toContain('Bitbucket');
    expect(speedUpCI('azure', false)).toContain('Azure DevOps');
  });

  it('suggests the workflow input in the GitHub Action and the CLI flag elsewhere', () => {
    const action = speedUpCI('github', true);
    expect(action).toContain('exitOnceUploaded: true');
    expect(action).not.toContain('--exit-once-uploaded');

    const cli = speedUpCI('github', false);
    expect(cli).toContain('--exit-once-uploaded');
    expect(cli).not.toContain('exitOnceUploaded');
  });
});
