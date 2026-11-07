import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function sourcePackage(sourcePath) {
  const match = sourcePath.match(/^(.*\/node_modules\/(?:@[^/]+\/)?[^/]+)\//);
  if (!match) return;
  const { name, version } = JSON.parse(readFileSync(path.join(match[1], 'package.json'), 'utf8'));
  if (!name || !version) throw new Error(`Missing package identity for ${sourcePath}`);
  return { name, version };
}

// Read emitted sources, not the lockfile: installed packages may be external or tree-shaken away.
export function inventory(buildRoot) {
  return Object.fromEntries(
    ['dist', 'action'].map((target) => {
      const directory = path.resolve(buildRoot, target);
      const maps = readdirSync(directory).filter((file) => file.endsWith('.cjs.map'));
      if (maps.length === 0) throw new Error(`No source maps found in ${directory}`);
      const packages = new Map();
      for (const file of maps) {
        const map = JSON.parse(readFileSync(path.resolve(directory, file), 'utf8'));
        for (const source of map.sources) {
          const identity = sourcePackage(path.resolve(directory, map.sourceRoot || '', source));
          if (!identity) continue;
          const { name, version } = identity;
          if (!packages.has(name)) packages.set(name, new Set());
          packages.get(name).add(version);
        }
      }
      if (packages.size === 0) throw new Error(`No bundled packages found in ${directory}`);
      return [
        target,
        Object.fromEntries(
          [...packages]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([name, versions]) => [name, [...versions].sort()])
        ),
      ];
    })
  );
}

function cell(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('|', '&#124;')
    .replaceAll('`', '&#96;')
    .replaceAll(/\r?\n/g, ' ');
}

export function compare(base, head) {
  const output = [
    '### Bundled dependency changes',
    '',
    'Versions from emitted source maps; external dependencies are not included.',
  ];
  for (const target of ['dist', 'action']) {
    output.push('', `#### ${target === 'dist' ? 'CLI / Node API' : 'GitHub Action'}`, '');
    const rows = [];
    const names = [...new Set([...Object.keys(base[target]), ...Object.keys(head[target])])].sort();
    for (const name of names) {
      const before = (base[target][name] || []).join(', ');
      const after = (head[target][name] || []).join(', ');
      if (before !== after)
        rows.push(`| ${cell(name)} | ${cell(before) || '—'} | ${cell(after) || '—'} |`);
    }
    output.push(
      ...(rows.length > 0
        ? ['| Package | Base | PR |', '| --- | --- | --- |', ...rows]
        : ['No bundled dependency changes.'])
    );
  }
  return `${output.join('\n')}\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [command, first, second] = process.argv.slice(2);
  if (command === 'inventory' && first) {
    console.log(JSON.stringify(inventory(first), undefined, 2));
  } else if (command === 'compare' && first && second) {
    console.log(
      compare(JSON.parse(readFileSync(first, 'utf8')), JSON.parse(readFileSync(second, 'utf8')))
    );
  } else {
    throw new Error(
      'Usage: bundledDependencies.mjs inventory <build-root> | compare <base.json> <head.json>'
    );
  }
}
