import { readFileSync } from 'fs';

import { DepGraphBuilder } from '@snyk/dep-graph';

import { LockFileParseFailedError } from './errors';

/** Bun lockfile versions we know how to read. Unknown versions fail closed. */
const SUPPORTED_BUN_LOCKFILE_VERSIONS = new Set([0, 1, 2]);

type BunPackageEntry = unknown;

/**
 * Build a flat dependency graph from a Bun text lockfile (`bun.lock`).
 *
 * Snyk's `nodejs-lockfile-parser` does not support Bun and will not add a builder
 * (see snyk/nodejs-lockfile-parser#330). TurboSnap only needs package *names* for
 * `compareBaseline`, so a flat graph of resolved identities from `packages` is enough.
 *
 * @param absoluteManifestPath Absolute path to the `package.json` for the root node.
 * @param absoluteLockfilePath Absolute path to `bun.lock`.
 *
 * @returns A Snyk `DepGraph` of resolved packages.
 */
export function parseBunLockfile(absoluteManifestPath: string, absoluteLockfilePath: string) {
  try {
    const manifest = JSON.parse(readFileSync(absoluteManifestPath, 'utf8')) as {
      name?: string;
      version?: string;
    };
    const lockfile = parseBunLockJson(readFileSync(absoluteLockfilePath, 'utf8'));

    if (!SUPPORTED_BUN_LOCKFILE_VERSIONS.has(lockfile.lockfileVersion)) {
      throw new Error(
        `Unsupported bun.lock lockfileVersion ${String(lockfile.lockfileVersion)}; expected 0, 1, or 2`
      );
    }

    const rootPkg = {
      name: typeof manifest.name === 'string' && manifest.name ? manifest.name : 'root',
      version: typeof manifest.version === 'string' && manifest.version ? manifest.version : '0.0.0',
    };

    const builder = new DepGraphBuilder({ name: 'bun' }, rootPkg);
    const seen = new Set<string>();
    const packages = lockfile.packages ?? {};

    for (const [key, entry] of Object.entries(packages)) {
      const identity = resolvedIdentityFromBunEntry(key, entry);
      if (!identity) continue;

      const nodeId = `${identity.name}@${identity.version}`;
      if (seen.has(nodeId)) continue;
      seen.add(nodeId);

      builder.addPkgNode(identity, nodeId);
      builder.connectDep(builder.rootNodeId, nodeId);
    }

    return builder.build();
  } catch (error) {
    throw new LockFileParseFailedError(absoluteLockfilePath, { cause: error });
  }
}

/**
 * Parse Bun's JSONC lockfile text (trailing commas and line/block comments).
 */
export function parseBunLockJson(text: string): {
  lockfileVersion: number;
  packages?: Record<string, BunPackageEntry>;
} {
  const parsed = JSON.parse(stripJsonc(text)) as {
    lockfileVersion?: unknown;
    packages?: Record<string, BunPackageEntry>;
  };

  if (typeof parsed.lockfileVersion !== 'number') {
    throw new Error('bun.lock is missing a numeric lockfileVersion');
  }

  return {
    lockfileVersion: parsed.lockfileVersion,
    packages: parsed.packages,
  };
}

/**
 * Extract `{ name, version }` from a Bun `packages` map entry.
 * Element 0 is the resolved identity (`name@version`, or `name@protocol:…`).
 */
export function resolvedIdentityFromBunEntry(
  key: string,
  entry: BunPackageEntry
): { name: string; version: string } | undefined {
  if (!Array.isArray(entry) || entry.length === 0 || typeof entry[0] !== 'string') {
    return splitNameVersion(key);
  }
  return splitNameVersion(entry[0]);
}

function splitNameVersion(ident: string): { name: string; version: string } | undefined {
  if (!ident) return undefined;

  if (ident.startsWith('@')) {
    const at = ident.indexOf('@', 1);
    if (at <= 0) return undefined;
    const name = ident.slice(0, at);
    const version = ident.slice(at + 1);
    if (!name || !version) return undefined;
    return { name, version };
  }

  const at = ident.indexOf('@');
  if (at <= 0) return undefined;
  const name = ident.slice(0, at);
  const version = ident.slice(at + 1);
  if (!name || !version) return undefined;
  return { name, version };
}

/**
 * Strip JSONC comments and trailing commas without disturbing string contents.
 */
export function stripJsonc(text: string): string {
  let result = '';
  let i = 0;
  let inString = false;
  let escaped = false;

  while (i < text.length) {
    const ch = text[i];

    if (inString) {
      result += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      i += 1;
      continue;
    }

    if (ch === '"') {
      inString = true;
      result += ch;
      i += 1;
      continue;
    }

    if (ch === '/' && text[i + 1] === '/') {
      i += 2;
      while (i < text.length && text[i] !== '\n') i += 1;
      continue;
    }

    if (ch === '/' && text[i + 1] === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }

    if (ch === ',') {
      let j = i + 1;
      while (j < text.length && /[\s\r\n]/.test(text[j])) j += 1;
      if (text[j] === '}' || text[j] === ']') {
        i += 1;
        continue;
      }
    }

    result += ch;
    i += 1;
  }

  return result;
}
