import { describe, expect, it } from 'vitest';

import speedUpCI from './speedUpCI';

describe('speedUpCI', () => {
  it('renders known provider names', () => {
    expect(speedUpCI('github')).toContain('GitHub');
    expect(speedUpCI('gitlab')).toContain('GitLab');
    expect(speedUpCI('bitbucket')).toContain('Bitbucket');
    expect(speedUpCI('ado')).toContain('Azure DevOps');
  });

  it('falls back to the raw provider key for unknown providers', () => {
    const output = speedUpCI('unknown-provider');
    expect(output).toContain('unknown-provider');
    expect(output).not.toContain('undefined');
  });

  it('falls back to a generic label when provider is null', () => {
    const output = speedUpCI(null as any);
    expect(output).toContain('your Git provider');
    expect(output).not.toContain('undefined');
    expect(output).not.toContain('null');
  });

  it('uses generic option syntax, not GitHub Action syntax', () => {
    const output = speedUpCI('github');
    expect(output).toContain('`exitOnceUploaded`');
    expect(output).not.toContain('with: exitOnceUploaded');
  });
});
