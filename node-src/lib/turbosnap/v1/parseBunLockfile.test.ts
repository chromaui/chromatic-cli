import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

import { LockFileParseFailedError } from './errors';
import {
  parseBunLockfile,
  parseBunLockJson,
  resolvedIdentityFromBunEntry,
  stripJsonc,
} from './parseBunLockfile';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(__dirname, '../../../__mocks__/dependencyParsing');

describe('stripJsonc', () => {
  it('strips trailing commas and comments', () => {
    const input = `{
      // line comment
      "lockfileVersion": 1, /* block */
      "packages": {
        "lodash": ["lodash@4.17.21", "", {}, "sha512-abc"],
      },
    }`;
    expect(JSON.parse(stripJsonc(input))).toEqual({
      lockfileVersion: 1,
      packages: {
        lodash: ['lodash@4.17.21', '', {}, 'sha512-abc'],
      },
    });
  });

  it('does not strip commas or slashes inside strings', () => {
    const input = `{ "url": "https://example.com/a,b//c", }`;
    expect(JSON.parse(stripJsonc(input))).toEqual({
      url: 'https://example.com/a,b//c',
    });
  });
});

describe('resolvedIdentityFromBunEntry', () => {
  it('parses scoped and unscoped identities from element 0', () => {
    expect(resolvedIdentityFromBunEntry('lodash', ['lodash@4.17.21', '', {}, 'x'])).toEqual({
      name: 'lodash',
      version: '4.17.21',
    });
    expect(
      resolvedIdentityFromBunEntry('@babel/core', ['@babel/core@7.7.5', '', {}, 'x'])
    ).toEqual({
      name: '@babel/core',
      version: '7.7.5',
    });
  });
});

describe('parseBunLockJson', () => {
  it('parses lockfileVersion and packages', () => {
    expect(parseBunLockJson('{ "lockfileVersion": 1, "packages": {} }')).toEqual({
      lockfileVersion: 1,
      packages: {},
    });
  });
});

describe('parseBunLockfile', () => {
  it('builds a dep graph from the fixture bun.lock', () => {
    const graph = parseBunLockfile(
      path.join(fixtures, 'package.json'),
      path.join(fixtures, 'bun.lock')
    );
    const names = graph.getDepPkgs().map((pkg) => pkg.name);
    expect(names).toEqual(
      expect.arrayContaining(['react', 'react-dom', 'moment', '@babel/core', 'chromatic'])
    );
  });

  it('fails closed on unsupported lockfileVersion', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chromatic-bun-'));
    const lockPath = path.join(dir, 'bun.lock');
    fs.writeFileSync(lockPath, '{ "lockfileVersion": 99, "packages": {} }\n');
    expect(() => parseBunLockfile(path.join(fixtures, 'package.json'), lockPath)).toThrow(
      LockFileParseFailedError
    );
  });

  it('wraps parse failures in LockFileParseFailedError', () => {
    expect(() =>
      parseBunLockfile(path.join(fixtures, 'package.json'), path.join(fixtures, 'package.json'))
    ).toThrow(LockFileParseFailedError);
  });
});
