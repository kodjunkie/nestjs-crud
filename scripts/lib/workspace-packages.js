/* eslint-disable @typescript-eslint/no-var-requires */
'use strict';

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Contract under test: every script that needs the set of workspace packages
// — the smoke gate, the manifest-contract checks, the release publish loop —
// derives it from the manifests under `packages/*`, instead of carrying its
// own hardcoded copy. Adding a package means adding a directory with a
// `package.json`; no script needs an edit. See CLAUDE.md "Encode contracts
// in config, not in prose".
// ---------------------------------------------------------------------------

const DEFAULT_ROOT = path.resolve(__dirname, '..', '..');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

// The module globs only `packages/*` — the same pattern the root manifest's
// `workspaces` and `lerna.json`'s `packages` already declare. If either
// diverges from that single-entry glob, the directories this module lists
// would silently stop matching what the rest of the tooling considers the
// workspace, so it throws instead of listing the wrong set.
function assertGlobIsPackagesStar(root) {
  const rootManifest = readJson(path.join(root, 'package.json'));
  const workspaces = rootManifest.workspaces;
  if (!Array.isArray(workspaces) || workspaces.length !== 1 || workspaces[0] !== 'packages/*') {
    throw new Error(
      `root package.json "workspaces" must be exactly ["packages/*"] (found: ${JSON.stringify(workspaces)})`,
    );
  }

  const lernaManifest = readJson(path.join(root, 'lerna.json'));
  const lernaPackages = lernaManifest.packages;
  if (!Array.isArray(lernaPackages) || lernaPackages.length !== 1 || lernaPackages[0] !== 'packages/*') {
    throw new Error(`lerna.json "packages" must be exactly ["packages/*"] (found: ${JSON.stringify(lernaPackages)})`);
  }
}

// Directories under `packages/` that contain a `package.json`, sorted by
// name. Manifests with `private: true` are skipped — they are not published
// and carry no publish-loop or smoke-gate obligation.
function listPackageDirs(root) {
  const packagesRoot = path.join(root, 'packages');
  const entries = fs
    .readdirSync(packagesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => fs.existsSync(path.join(packagesRoot, name, 'package.json')))
    .sort();

  const result = [];
  for (const dir of entries) {
    const manifestPath = path.join(packagesRoot, dir, 'package.json');
    const manifest = readJson(manifestPath);
    if (manifest.private) continue;
    result.push({ dir, manifestPath, manifest });
  }

  if (result.length === 0) {
    throw new Error(`no non-private packages found under ${packagesRoot}`);
  }
  return result;
}

// Every manifest's `name` must be `@nestjs-crud/` plus its directory name —
// the invariant every consumer of this module trusts to map a directory to
// an import specifier.
function assertNameMatchesDirectory(entry) {
  const expected = `@nestjs-crud/${entry.dir}`;
  if (entry.manifest.name !== expected) {
    throw new Error(
      `${entry.manifestPath} "name" must equal "${expected}" to match its directory (found: "${entry.manifest.name}")`,
    );
  }
}

// Collects internal edges from every package's `dependencies` and
// `peerDependencies` keys that start with `@nestjs-crud/`. A package that is
// the target of any such edge is internal; every other listed package is an
// adapter. No new manifest field records this — it is derived from the
// dependency graph itself.
function collectInternalEdges(entries) {
  const dirsByName = new Map(entries.map((entry) => [entry.manifest.name, entry.dir]));
  const internalDirSet = new Set();
  const edges = new Map(); // dir -> Set(dir it depends on, internal only)

  for (const entry of entries) {
    const deps = new Set([
      ...Object.keys(entry.manifest.dependencies || {}),
      ...Object.keys(entry.manifest.peerDependencies || {}),
    ]);
    const internalDeps = new Set();
    for (const depName of deps) {
      if (!depName.startsWith('@nestjs-crud/')) continue;
      const targetDir = dirsByName.get(depName);
      if (!targetDir) {
        throw new Error(`${entry.manifestPath} depends on unknown workspace package "${depName}"`);
      }
      internalDirSet.add(targetDir);
      internalDeps.add(targetDir);
    }
    edges.set(entry.dir, internalDeps);
  }

  return { internalDirSet, edges };
}

// Orders packages so each comes after every package it depends on, choosing
// among ready packages alphabetically by directory when more than one is
// ready at once. Throws on a cycle (a topological sort that cannot place
// every node).
function topologicalOrder(entries, edges) {
  const remaining = new Map(entries.map((entry) => [entry.dir, new Set(edges.get(entry.dir))]));
  const ordered = [];

  while (remaining.size > 0) {
    const ready = [...remaining.entries()]
      .filter(([, deps]) => deps.size === 0)
      .map(([dir]) => dir)
      .sort();

    if (ready.length === 0) {
      throw new Error(`dependency cycle detected among workspace packages: ${[...remaining.keys()].sort().join(', ')}`);
    }

    for (const dir of ready) {
      ordered.push(dir);
      remaining.delete(dir);
    }
    for (const deps of remaining.values()) {
      for (const dir of ready) deps.delete(dir);
    }
  }

  return ordered;
}

// `subpathSpecifiers` for one package: every explicit `exports` key that
// starts with `./`, skipping `./package.json` and any key containing `*`
// (a wildcard key such as `./lib/*` does not resolve an extensionless
// directory require the same way an explicit key does — see CLAUDE.md's
// "explicit `./lib/cache|cursor|query`" note). A package with no `exports`
// object contributes none.
function subpathSpecifiersFor(entry) {
  const exportsField = entry.manifest.exports;
  if (!exportsField || typeof exportsField !== 'object' || Array.isArray(exportsField)) return [];

  const specifiers = [];
  for (const key of Object.keys(exportsField)) {
    if (key === '.' || key === './package.json') continue;
    if (key.includes('*')) continue;
    if (!key.startsWith('./')) continue;
    specifiers.push(`${entry.manifest.name}${key.slice(1)}`);
  }
  return specifiers;
}

// `requiredExternalPeers`: the sorted set of `peerDependencies` names that do
// not start with `@nestjs-crud/` and are not marked optional in
// `peerDependenciesMeta`.
function requiredExternalPeersFor(entries) {
  const peers = new Set();
  for (const entry of entries) {
    const peerDeps = entry.manifest.peerDependencies || {};
    const peerDepsMeta = entry.manifest.peerDependenciesMeta || {};
    for (const name of Object.keys(peerDeps)) {
      if (name.startsWith('@nestjs-crud/')) continue;
      if (peerDepsMeta[name] && peerDepsMeta[name].optional) continue;
      peers.add(name);
    }
  }
  return [...peers].sort();
}

function loadWorkspacePackages(root) {
  const resolvedRoot = root ? path.resolve(root) : DEFAULT_ROOT;

  assertGlobIsPackagesStar(resolvedRoot);
  const entries = listPackageDirs(resolvedRoot);
  for (const entry of entries) assertNameMatchesDirectory(entry);

  const { internalDirSet, edges } = collectInternalEdges(entries);
  const order = topologicalOrder(entries, edges);

  const entriesByDir = new Map(entries.map((entry) => [entry.dir, entry]));
  const orderedEntries = order.map((dir) => entriesByDir.get(dir));

  const packages = orderedEntries.map((entry) => ({
    dir: entry.dir,
    name: entry.manifest.name,
    manifestPath: entry.manifestPath,
    manifest: entry.manifest,
    internal: internalDirSet.has(entry.dir),
  }));

  const dirs = packages.map((pkg) => pkg.dir);
  const internalDirs = packages.filter((pkg) => pkg.internal).map((pkg) => pkg.dir);
  const adapterDirs = packages.filter((pkg) => !pkg.internal).map((pkg) => pkg.dir);
  const rootSpecifiers = packages.map((pkg) => pkg.name);
  const subpathSpecifiers = orderedEntries.flatMap((entry) => subpathSpecifiersFor(entry));
  const requiredExternalPeers = requiredExternalPeersFor(orderedEntries);

  return {
    packages,
    dirs,
    internalDirs,
    adapterDirs,
    rootSpecifiers,
    subpathSpecifiers,
    requiredExternalPeers,
  };
}

module.exports = { loadWorkspacePackages };

// ---------------------------------------------------------------------------
// Command-line form: `node scripts/lib/workspace-packages.js [--root <dir>]`
// prints `dirs` one per line, or exits 2 with a `FATAL:` line on any thrown
// Error.
// ---------------------------------------------------------------------------

if (require.main === module) {
  const argv = process.argv.slice(2);
  let cliRoot;
  const rootIndex = argv.indexOf('--root');
  if (rootIndex !== -1) cliRoot = argv[rootIndex + 1];

  try {
    const { dirs } = loadWorkspacePackages(cliRoot);
    for (const dir of dirs) console.log(dir);
  } catch (err) {
    console.error(`FATAL: ${err.message}`);
    process.exit(2);
  }
}
