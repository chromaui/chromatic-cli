import { describe, expect, it } from 'vitest';

import { redact } from './redact';

describe('redact', () => {
  it('redacts sensitive keys at any depth', () => {
    const input = { a: { projectToken: 'x', b: [{ userToken: 'y' }] }, reportToken: 'z' };
    expect(redact(input)).toEqual({
      a: { projectToken: undefined, b: [{ userToken: undefined }] },
      reportToken: undefined,
    });
  });

  it('redacts keys matching the sensitive-name pattern case-insensitively', () => {
    const input = {
      CHROMATIC_PROJECT_TOKEN: 'a',
      myToken: 'b',
      authorization: 'c',
      Authorization: 'd',
      keepMe: 'e',
      nested: { sessionTOKEN: 'f' },
    };
    expect(redact(input)).toEqual({
      CHROMATIC_PROJECT_TOKEN: undefined,
      myToken: undefined,
      authorization: undefined,
      Authorization: undefined,
      keepMe: 'e',
      nested: { sessionTOKEN: undefined },
    });
  });

  it('leaves package.json data with token-like names untouched', () => {
    // Dependency and script names are data, not field names: their values must not be
    // collected as secrets and scrubbed out of unrelated strings.
    const input = {
      packageJson: {
        dependencies: { 'js-tokens': '^4.0.0', react: '^4.0.0' },
        devDependencies: { '@tokens-studio/sd-transforms': '1.0.0' },
        scripts: { 'build:tokens': 'node ./build-tokens.js', tokenizer: 'echo hi' },
        version: '8.0.0',
        commit: 'abc123',
        branch: 'feature-tokens',
      },
    };
    expect(redact(input)).toEqual(input);
  });

  it('leaves non-sensitive keys untouched', () => {
    const input = { keep: 'x', nested: { alsoKeep: ['y'] } };
    expect(redact(input)).toEqual(input);
  });

  it('scrubs values collected from sensitive-keyed subtrees everywhere, arrays included', () => {
    // Repeated flags keep every value in flags.projectToken while options.projectToken only
    // keeps the last — the collection walk must catch all of them inside originalArgv.
    const input = {
      flags: { projectToken: ['first-secret', 'second-secret'] },
      options: {
        projectToken: 'second-secret',
        originalArgv: ['-t', 'first-secret', '-t', 'second-secret'],
      },
    };
    expect(redact(input)).toEqual({
      flags: { projectToken: undefined },
      options: {
        projectToken: undefined,
        originalArgv: ['-t', '<redacted>', '-t', '<redacted>'],
      },
    });
  });

  it('scrubs secrets contributed by secret sources without serializing the source', () => {
    expect(
      redact(
        { options: { originalArgv: ['--project-token=env-secret-value'] } },
        { CHROMATIC_PROJECT_TOKEN: 'env-secret-value' }
      )
    ).toEqual({ options: { originalArgv: ['--project-token=<redacted>'] } });
  });

  it('skips empty strings under sensitive keys so the output is not mangled', () => {
    // An exported-but-empty env var or `-t ""` yields '' under a sensitive key;
    // collecting it would make replaceAll('') wedge the placeholder between every character.
    expect(
      redact(
        { projectToken: '', text: 'plain text', options: { originalArgv: ['-t'] } },
        { CHROMATIC_PROJECT_TOKEN: '' }
      )
    ).toEqual({
      projectToken: undefined,
      text: 'plain text',
      options: { originalArgv: ['-t'] },
    });
  });

  it('replaces longer secrets before shorter prefixes of them', () => {
    expect(redact({ projectToken: 'XYZ', reportToken: 'XYZextra', v: 'XYZextra-suffix' })).toEqual({
      projectToken: undefined,
      reportToken: undefined,
      v: '<redacted>-suffix',
    });
  });

  it('replaces each occurrence of a secret and preserves surrounding text', () => {
    const input = {
      projectToken: 'shhh',
      argv: ['-t', 'shhh', '-t=shhh', '--project-token=shhh', 'keep'],
    };
    expect(redact(input)).toEqual({
      projectToken: undefined,
      argv: ['-t', '<redacted>', '-t=<redacted>', '--project-token=<redacted>', 'keep'],
    });
  });

  it('scrubs a plain string using secrets from secret sources', () => {
    expect(
      redact('a shhh and shhh plus sekrit', { projectToken: 'shhh', reportToken: 'sekrit' })
    ).toBe('a <redacted> and <redacted> plus <redacted>');
  });

  it('redacts the credential of a bare Bearer value, keeping the scheme', () => {
    expect(redact({ h: 'Bearer abc.def.ghi', note: 'mentions bearer mid-string' })).toEqual({
      h: 'Bearer <redacted>',
      note: 'mentions bearer mid-string',
    });
  });

  it('redacts embedded Authorization header credentials in strings', () => {
    expect(
      redact({
        script: 'curl -H "Authorization: Bearer abc.def.ghi" https://example.com',
        basic: 'curl -H "Authorization: Basic dXNlcjpwYXNz" https://example.com',
        mention: 'mentions bearer mid-string',
      })
    ).toEqual({
      script: 'curl -H "Authorization: Bearer <redacted>" https://example.com',
      basic: 'curl -H "Authorization: Basic <redacted>" https://example.com',
      mention: 'mentions bearer mid-string',
    });
  });

  it('leaves ordinary strings starting with Basic untouched', () => {
    // "Basic" is an ordinary word; only a bare Bearer value at string start is redacted,
    // so Basic stays intact without the authorization: anchor.
    expect(redact({ story: 'Basic usage', message: 'Basic auth support' })).toEqual({
      story: 'Basic usage',
      message: 'Basic auth support',
    });
  });

  it('leaves non-string values and structures untouched', () => {
    const input = { n: 1, b: true, nil: null, nested: { s: 'ok', arr: [1, 'ok'] } };
    expect(redact(input)).toEqual(input);
  });
});
