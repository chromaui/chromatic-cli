/**
 * Probe: score every candidate Storybook project root against each package's real stats file.
 *
 * Replicates the evidence base from statsAnchor.ts exactly (node_modules excluded, source
 * extensions only, config-directory entries excluded per the Order 70 fix), then reports both
 * the current `.some()` verdict and a count-based score for every candidate.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';

const REPO = '/Users/cody/Projects/turbosnap-monorepo';
const CONFIG_DIR = '.storybook';
const SOURCE_MODULE_EXTENSIONS = /\.(js|jsx|ts|tsx)$/;
const CONCATENATED_MODULE_SUFFIX = / \+ \d+ modules$/;

function stripConcatenatedModuleSuffix(p: string) {
  return p.replace(CONCATENATED_MODULE_SUFFIX, '');
}

function resolveStatsPath(statsPath: string, statsRoot: string) {
  const stripped = stripConcatenatedModuleSuffix(statsPath).replace(/^\.\//, '');
  return path.isAbsolute(stripped) ? stripped : path.resolve(statsRoot, stripped);
}

function isInside(directory: string, filePath: string) {
  const relative = path.relative(directory, filePath);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function isConfigDirectoryEntry(name: string, configDirectory: string) {
  const relativeName = stripConcatenatedModuleSuffix(name).replace(/^\.\//, '');
  return relativeName === configDirectory || relativeName.startsWith(`${configDirectory}/`);
}

// statsPaths() from statsAnchor.ts: every spelling of every module.
function statsPaths(stats: any): string[] {
  return stats.modules.flatMap((module: any) =>
    [
      module.name,
      module.nameForCondition,
      ...(module.modules ?? []).flatMap((inner: any) => [inner.name, inner.nameForCondition]),
      ...(module.reasons ?? []).map((reason: any) => reason.moduleName),
    ]
      .filter(Boolean)
      .map((name: string) => stripConcatenatedModuleSuffix(name))
      .filter((name: string) => !name.includes('virtual:'))
  );
}

function evidenceBase(stats: any): string[] {
  return statsPaths(stats).filter((name) => {
    if (name.includes('node_modules') || !SOURCE_MODULE_EXTENSIONS.test(name)) return false;
    return !isConfigDirectoryEntry(name, CONFIG_DIR);
  });
}

/** Every directory under the repo holding a Storybook config dir. */
function findCandidateRoots(root: string): string[] {
  const found: string[] = [];
  function walk(directory: string, depth: number) {
    if (depth > 4) return;
    let entries: string[];
    try {
      entries = readdirSync(directory);
    } catch {
      return;
    }
    if (entries.includes(CONFIG_DIR)) found.push(directory);
    for (const entry of entries) {
      if (entry === 'node_modules' || entry.startsWith('.')) continue;
      const child = path.join(directory, entry);
      try {
        if (statSync(child).isDirectory()) walk(child, depth + 1);
      } catch {
        /* ignore */
      }
    }
  }
  walk(root, 0);
  return found;
}

const candidates = findCandidateRoots(REPO).sort();
const packages = candidates.filter((c) => existsSync(path.join(c, 'storybook-static/preview-stats.json')));

console.log(`candidate roots: ${candidates.length}\n`);

for (const statsOwner of packages) {
  const statsFile = path.join(statsOwner, 'storybook-static/preview-stats.json');
  const stats = JSON.parse(readFileSync(statsFile, 'utf8'));
  const base = evidenceBase(stats);
  const distinct = new Set(base);

  console.log(`\n=== stats from ${path.relative(REPO, statsOwner)} (${distinct.size} distinct evidence names) ===`);

  const scores = candidates.map((candidate) => {
    let hits = 0;
    for (const name of distinct) {
      const absolutePath = resolveStatsPath(name, candidate);
      if (isInside(candidate, absolutePath) && existsSync(absolutePath)) hits += 1;
    }
    return { candidate, hits, pct: distinct.size ? (100 * hits) / distinct.size : 0 };
  });

  scores.sort((a, b) => b.hits - a.hits);
  for (const { candidate, hits, pct } of scores) {
    if (hits === 0) continue;
    const label = path.relative(REPO, candidate) || '.';
    const self = candidate === statsOwner ? '  <-- correct' : '';
    // `.some()` clears on a single hit, which is the current predicate's verdict.
    const current = hits > 0 ? 'NO BAIL' : 'bail';
    console.log(`  ${label.padEnd(28)} ${String(hits).padStart(4)} / ${distinct.size}  (${pct.toFixed(0)}%)  current=${current}${self}`);
  }
  const zero = scores.filter((s) => s.hits === 0).length;
  console.log(`  (${zero} candidates scored 0)`);
}
