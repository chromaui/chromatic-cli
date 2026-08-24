import { describe, expect, it } from 'vitest';

import speedUpCI from './speedUpCI';

describe('speedUpCI', () => {
  it('renders known provider names', () => {
    expect(speedUpCI('github')).toContain('GitHub');
    expect(speedUpCI('gitlab')).toContain('GitLab');
    expect(speedUpCI('bitbucket')).toContain('Bitbucket');
    expect(speedUpCI('ado')).toContain('Azure DevOps');
  });
});
