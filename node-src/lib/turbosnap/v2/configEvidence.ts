import { createHash } from 'crypto';
import pLimit from 'p-limit';
import path from 'path';
import { z } from 'zod';

import { Stats } from '../../../types';
import getEnvironment from '../../getEnvironment';
import { MAIN_CONFIG_PATTERN } from '../../getStorybookMetadata';
import { ManifestInput } from './manifestInput';
import { SkipRule } from './skippedFiles';

const relativePath = z
  .string()
  .min(1)
  .refine(
    (value) =>
      !path.posix.isAbsolute(value) && !path.win32.isAbsolute(value) && !value.includes('\0')
  );
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const evidenceSchema = z.object({
  version: z.literal(1),
  builder: z.object({
    name: z.literal('@storybook/builder-vite'),
    version: z.string().min(1),
    viteVersion: z.string().min(1),
  }),
  status: z.literal('complete'),
  reason: z.string(),
  projectRoot: relativePath,
  configDir: relativePath,
  modulesHash: digest,
  environmentHash: digest,
  configFiles: z.array(relativePath),
  absentFiles: z.array(relativePath),
  roots: z.array(relativePath).min(1),
  files: z.record(
    relativePath,
    z.object({ hash: digest, dependencies: z.array(relativePath), realPath: relativePath })
  ),
});

type Evidence = z.infer<typeof evidenceSchema>;
type AbsolutePathResolver = (file: string) => string;

export type ConfigEvidenceReason =
  | 'build-dependencies-unavailable'
  | 'invalid-build-dependencies'
  | 'stale-build-dependencies'
  | 'incomplete-build-dependencies'
  | 'excluded-build-dependency';

export type ConfigEvidence =
  | { status: 'unavailable'; reason: ConfigEvidenceReason }
  | {
      status: 'verified';
      buildFiles: string[];
      environmentHash: string;
      capability: string;
    };

/**
 * Verifies the builder's evidence against the current graph, config inventory and source bytes.
 * Fingerprints bind the evidence to its build; they must never become capture-selection hashes.
 *
 * @param stats The unmodified preview stats, including optional builder evidence.
 * @param input Filesystem roots and reads for this build.
 * @param skipRule Existing exclusion rules.
 *
 * @returns Trusted build edges, or a reason to preserve the directory sweep unchanged.
 */
export async function readConfigEvidence(
  stats: Stats,
  input: ManifestInput,
  skipRule: SkipRule
): Promise<ConfigEvidence> {
  if (stats.turbosnapConfig === undefined) return unavailable('build-dependencies-unavailable');
  if (z.object({ status: z.literal('incomplete') }).safeParse(stats.turbosnapConfig).success) {
    return unavailable('incomplete-build-dependencies');
  }
  const parsed = evidenceSchema.safeParse(stats.turbosnapConfig);
  if (!parsed.success) return unavailable('invalid-build-dependencies');
  const evidence = parsed.data;
  const statsRoot = input.statsRoot ?? input.projectRoot;
  const absolute = (file: string) => path.resolve(statsRoot, file);
  if (!hasValidGraph(evidence, absolute)) return unavailable('invalid-build-dependencies');

  try {
    if (!matchesMetadata(evidence, stats, input, absolute)) {
      return unavailable('stale-build-dependencies');
    }
    const buildFiles = collectBuildFiles(evidence);
    // The resolved environment digest can include values loaded from these files. Falling back
    // avoids letting an opaque digest bypass an existing exclusion boundary.
    if ([...buildFiles].some((file) => skipRule(absolute(file)))) {
      return unavailable('excluded-build-dependency');
    }
    if (!(await matchesSourceBindings(evidence, input, skipRule, absolute))) {
      return unavailable('stale-build-dependencies');
    }
    return {
      status: 'verified',
      buildFiles: [...buildFiles].map((file) => absolute(file)),
      environmentHash: evidence.environmentHash,
      capability: JSON.stringify([evidence.version, evidence.builder]),
    };
  } catch (error) {
    input.log.debug('Unable to verify TurboSnap v2 build dependency evidence', error);
    return unavailable('stale-build-dependencies');
  }
}

function hasValidGraph(evidence: Evidence, absolute: AbsolutePathResolver): boolean {
  const names = Object.keys(evidence.files);
  const identities = new Set(names.map((file) => absolute(file)));
  const declared = (file: string) => Object.prototype.hasOwnProperty.call(evidence.files, file);
  return (
    identities.size === names.length &&
    new Set(evidence.configFiles.map((file) => absolute(file))).size ===
      evidence.configFiles.length &&
    evidence.roots.every((file) => declared(file)) &&
    evidence.configFiles.every((file) => declared(file)) &&
    evidence.absentFiles.every((file) => !identities.has(absolute(file))) &&
    Object.values(evidence.files).every((file) =>
      file.dependencies.every((dependency) => declared(dependency))
    )
  );
}

function matchesMetadata(
  evidence: Evidence,
  stats: Stats,
  input: ManifestInput,
  absolute: AbsolutePathResolver
): boolean {
  return (
    matchesBuild(evidence, stats, input, absolute) && matchesInventory(evidence, input, absolute)
  );
}

function matchesBuild(
  evidence: Evidence,
  stats: Stats,
  input: ManifestInput,
  absolute: AbsolutePathResolver
): boolean {
  return (
    absolute(evidence.projectRoot) === input.projectRoot &&
    absolute(evidence.configDir) === input.configDir &&
    evidence.modulesHash ===
      createHash('sha256').update(JSON.stringify(stats.modules)).digest('hex') &&
    input.projectFiles.packageVersion(input.configDir, evidence.builder.name) ===
      evidence.builder.version &&
    input.projectFiles.packageVersion(input.configDir, 'vite') === evidence.builder.viteVersion
  );
}

function matchesInventory(
  evidence: Evidence,
  input: ManifestInput,
  absolute: AbsolutePathResolver
): boolean {
  const inventory = new Set(evidence.configFiles.map((file) => absolute(file)));
  const files = input.projectFiles.listTree(input.configDir);
  const mainFiles = files.filter(
    (file) =>
      path.dirname(file) === input.configDir && MAIN_CONFIG_PATTERN.test(path.basename(file))
  );
  const roots = new Set(evidence.roots.map((file) => absolute(file)));
  return (
    files.length === inventory.size &&
    files.every((file) => inventory.has(file)) &&
    mainFiles.length > 0 &&
    mainFiles.every((file) => roots.has(file)) &&
    evidence.absentFiles.every(
      (file) =>
        !input.projectFiles.isFile(absolute(file)) &&
        !input.projectFiles.isDirectory(absolute(file))
    )
  );
}

function collectBuildFiles(evidence: Evidence): Set<string> {
  const files = new Set<string>();
  const pending = [...evidence.roots];
  while (pending.length > 0) {
    const file = pending.pop();
    if (file === undefined || files.has(file)) continue;
    files.add(file);
    pending.push(...evidence.files[file].dependencies);
  }
  return files;
}

async function matchesSourceBindings(
  evidence: Evidence,
  input: ManifestInput,
  skipRule: SkipRule,
  absolute: AbsolutePathResolver
): Promise<boolean> {
  const limit = pLimit(getEnvironment().CHROMATIC_HASH_CONCURRENCY);
  const matches = await Promise.all(
    Object.keys(evidence.files).map((file) =>
      limit(async () => {
        const filename = absolute(file);
        const binding = evidence.files[file];
        if (
          !input.projectFiles.isFile(filename) ||
          input.projectFiles.realPath(filename) !== absolute(binding.realPath)
        )
          return false;
        // Skipped story helpers do not invalidate the evidence when their bytes change.
        return (
          Boolean(skipRule(filename)) ||
          (await input.projectFiles.sha256(filename)) === binding.hash
        );
      })
    )
  );
  return matches.every(Boolean);
}

function unavailable(reason: ConfigEvidenceReason): ConfigEvidence {
  return { status: 'unavailable', reason };
}
