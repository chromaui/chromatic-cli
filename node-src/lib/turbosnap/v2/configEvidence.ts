import { createHash } from 'crypto';
import pLimit from 'p-limit';
import path from 'path';
import { z } from 'zod';

import { Stats } from '../../../types';
import getEnvironment from '../../getEnvironment';
import { relativeTo } from '../../getStorybookProjectRoot';
import { ManifestInput } from './manifestInput';
import { isPathWithinRoot } from './repositoryBoundary';

const relativePath = z
  .string()
  .min(1)
  .refine(
    (value) =>
      !path.posix.isAbsolute(value) &&
      !path.win32.parse(value).root &&
      !value.includes('\\') &&
      !value.includes('\0')
  );
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const evidenceSchema = z.object({
  version: z.literal(1),
  builder: z.object({
    name: z.enum(['@storybook/builder-vite', '@storybook/builder-webpack5']),
    version: z.string().min(1),
  }),
  status: z.literal('complete'),
  reason: z.string(),
  projectRoot: relativePath,
  configDir: relativePath,
  modulesHash: digest,
  configFiles: z.record(relativePath, z.object({ hash: digest, realPath: relativePath })),
  outputFiles: z.record(relativePath, digest),
  globalOutputHash: digest,
  storyOutputHashes: z.record(relativePath, digest),
});

type Evidence = z.infer<typeof evidenceSchema>;

export type ConfigEvidenceReason =
  | 'output-evidence-unavailable'
  | 'invalid-output-evidence'
  | 'stale-output-evidence'
  | 'incomplete-output-evidence'
  | 'outside-root-output-evidence';

export type ConfigEvidence =
  | { status: 'unavailable'; reason: ConfigEvidenceReason }
  | { status: 'verified'; globalOutputHash: string; storyOutputHashes: Record<string, string> };

/**
 * Binds optional output evidence to the actual upload and current config inventory. These hashes
 * can veto a config-directory optimization; they never replace the existing source hashes.
 *
 * @param stats The unmodified preview stats.
 * @param input Independently resolved source and output roots, and filesystem operations.
 *
 * @returns Verified output hashes, or a reason to retain the directory bailout.
 */
export async function readConfigEvidence(
  stats: Stats,
  input: ManifestInput
): Promise<ConfigEvidence> {
  if (stats.turbosnapOutput === undefined || !input.outputDir) {
    return unavailable('output-evidence-unavailable');
  }
  if (z.object({ status: z.literal('incomplete') }).safeParse(stats.turbosnapOutput).success) {
    return unavailable('incomplete-output-evidence');
  }
  const parsed = evidenceSchema.safeParse(stats.turbosnapOutput);
  if (!parsed.success) return unavailable('invalid-output-evidence');
  try {
    return await verifyEvidence(parsed.data, stats, { ...input, outputDir: input.outputDir });
  } catch (error) {
    if (error instanceof OutsideEvidenceRoot) return unavailable('outside-root-output-evidence');
    input.log.debug('Unable to verify TurboSnap v2 output evidence', error);
    return unavailable('stale-output-evidence');
  }
}

type OutputInput = ManifestInput & { outputDir: string };

async function verifyEvidence(
  evidence: Evidence,
  stats: Stats,
  input: OutputInput
): Promise<ConfigEvidence> {
  const outputDirectory = input.outputDir;
  const absolute = (file: string) =>
    resolveWithinRoot(input.statsRoot ?? input.projectRoot, file, input.gitRoot);
  const outputPath = (file: string) => resolveWithinRoot(outputDirectory, file, outputDirectory);
  if (
    !uniquePaths(Object.keys(evidence.configFiles), absolute) ||
    !uniquePaths(Object.keys(evidence.outputFiles), outputPath) ||
    !uniquePaths(Object.keys(evidence.storyOutputHashes), absolute)
  ) {
    return unavailable('invalid-output-evidence');
  }
  if (!hasBoundPaths(evidence, input, absolute, outputPath)) {
    return unavailable('outside-root-output-evidence');
  }
  if (!matchesBuild(evidence, stats, input, absolute)) {
    return unavailable('stale-output-evidence');
  }
  if (
    !hasInventory(evidence, input, absolute, outputPath) ||
    !(await matchesBindings(evidence, input, absolute, outputPath))
  ) {
    return unavailable('stale-output-evidence');
  }

  return {
    status: 'verified',
    globalOutputHash: createHash('sha256')
      .update(
        JSON.stringify([
          evidence.version,
          evidence.builder.name,
          evidence.builder.version,
          evidence.globalOutputHash,
        ])
      )
      .digest('hex'),
    storyOutputHashes: Object.fromEntries(
      Object.entries(evidence.storyOutputHashes).map(([file, hash]) => {
        const relative = relativeTo(input.projectRoot, absolute(file));
        return [relative.startsWith('../') ? relative : `./${relative}`, hash];
      })
    ),
  };
}

function matchesBuild(
  evidence: Evidence,
  stats: Stats,
  input: OutputInput,
  absolute: (file: string) => string
): boolean {
  return (
    absolute(evidence.projectRoot) === input.projectRoot &&
    absolute(evidence.configDir) === input.configDir &&
    evidence.modulesHash ===
      createHash('sha256').update(JSON.stringify(stats.modules)).digest('hex')
  );
}

function hasInventory(
  evidence: Evidence,
  input: OutputInput,
  absolute: (file: string) => string,
  outputPath: (file: string) => string
): boolean {
  const outputDirectory = input.outputDir;
  const configFiles = input.projectFiles.listBoundFiles(input.configDir, input.gitRoot);
  const statsPath = input.statsPath ?? path.join(outputDirectory, 'preview-stats.json');
  // validateFiles reserves this namespace and excludes it from the preview upload.
  const isUploadFile = (file: string) =>
    file !== statsPath && !isPathWithinRoot(path.join(outputDirectory, '.chromatic'), file);
  const outputFiles = input.projectFiles
    .listBoundFiles(outputDirectory, outputDirectory)
    .filter((file) => isUploadFile(file));
  return (
    matchesInventory(
      configFiles,
      Object.keys(evidence.configFiles).map((file) => absolute(file))
    ) &&
    matchesInventory(
      outputFiles,
      Object.keys(evidence.outputFiles).map((file) => outputPath(file))
    ) &&
    outputFiles.length > 0
  );
}

async function matchesBindings(
  evidence: Evidence,
  input: OutputInput,
  absolute: (file: string) => string,
  outputPath: (file: string) => string
): Promise<boolean> {
  const outputDirectory = input.outputDir;
  const limit = pLimit(getEnvironment().CHROMATIC_HASH_CONCURRENCY);
  const bindings = [
    ...Object.entries(evidence.configFiles).map(([file, binding]) => ({
      file: absolute(file),
      root: input.gitRoot,
      hash: binding.hash,
      realPath: absolute(binding.realPath),
    })),
    ...Object.entries(evidence.outputFiles).map(([file, hash]) => ({
      file: outputPath(file),
      root: outputDirectory,
      hash,
      realPath: input.projectFiles.realPath(outputPath(file)),
    })),
  ];
  const matches = await Promise.all(
    bindings.map((binding) =>
      limit(async () => {
        if (input.projectFiles.realPath(binding.file) !== binding.realPath) return false;
        const hashes = await input.projectFiles.sourceHashes(binding.file, binding.root);
        return hashes.sha256 === binding.hash;
      })
    )
  );
  return matches.every(Boolean);
}

function hasBoundPaths(
  evidence: Evidence,
  input: OutputInput,
  absolute: (file: string) => string,
  outputPath: (file: string) => string
): boolean {
  const outputDirectory = input.outputDir;
  const realSourceRoot = input.projectFiles.realPath(input.gitRoot);
  const realOutputRoot = input.projectFiles.realPath(outputDirectory);
  return (
    isPathWithinRoot(input.gitRoot, input.configDir) &&
    Object.entries(evidence.configFiles).every(
      ([file, binding]) =>
        isPathWithinRoot(input.configDir, absolute(file)) &&
        isPathWithinRoot(input.gitRoot, absolute(binding.realPath)) &&
        isPathWithinRoot(realSourceRoot, input.projectFiles.realPath(absolute(file)))
    ) &&
    Object.keys(evidence.storyOutputHashes).every((file) =>
      isPathWithinRoot(input.gitRoot, absolute(file))
    ) &&
    Object.keys(evidence.outputFiles).every(
      (file) =>
        isPathWithinRoot(outputDirectory, outputPath(file)) &&
        isPathWithinRoot(realOutputRoot, input.projectFiles.realPath(outputPath(file)))
    )
  );
}

function uniquePaths(files: string[], absolute: (file: string) => string): boolean {
  return new Set(files.map((file) => absolute(file))).size === files.length;
}

function matchesInventory(actual: string[], declared: string[]): boolean {
  const inventory = new Set(declared);
  return actual.length === inventory.size && actual.every((file) => inventory.has(file));
}

function unavailable(reason: ConfigEvidenceReason): ConfigEvidence {
  return { status: 'unavailable', reason };
}

class OutsideEvidenceRoot extends Error {}

function resolveWithinRoot(base: string, file: string, root: string): string {
  const resolved = path.resolve(base, file);
  if (!isPathWithinRoot(root, resolved)) throw new OutsideEvidenceRoot();
  return resolved;
}
