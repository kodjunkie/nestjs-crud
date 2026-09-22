/* eslint-disable @typescript-eslint/no-var-requires */
'use strict';

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Contract under test: qs has exactly one owner (packages/request) at exactly
// one resolved version, never below the floor it declares. Contracts encoded
// here, not in prose — see CLAUDE.md "Encode contracts in config, not prose".
// ---------------------------------------------------------------------------

const OWNER_PACKAGE = 'request';
const OWNER_RANGE = '^6.16.0';
const FLOOR_VERSION = '6.16.0';
const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];

// Mirrors scripts/smoke-pack.js WORKSPACE_PACKAGES — the fixed set of
// workspace packages this monorepo ships.
const WORKSPACE_PACKAGES = ['util', 'request', 'core', 'typeorm', 'drizzle', 'mikro-orm', 'prisma'];

function parseArgs(argv) {
  let root = path.resolve(__dirname, '..');
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--root') {
      root = path.resolve(argv[i + 1]);
      i += 1;
    }
  }
  return { root };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function compareVersions(a, b) {
  const partsA = a.split('.').map(Number);
  const partsB = b.split('.').map(Number);
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i += 1) {
    const diff = (partsA[i] || 0) - (partsB[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Assertion 1 — packages/request/package.json is the sole qs owner
// ---------------------------------------------------------------------------

function assertOwnerRange(root) {
  const ownerManifestPath = path.join('packages', OWNER_PACKAGE, 'package.json');
  const ownerManifest = readJson(path.join(root, ownerManifestPath));
  const declared = ownerManifest.dependencies && ownerManifest.dependencies.qs;
  if (declared !== OWNER_RANGE) {
    return {
      ok: false,
      reason: `${ownerManifestPath} must declare "qs": "${OWNER_RANGE}" in dependencies (found: ${
        declared === undefined ? 'missing' : declared
      })`,
    };
  }
  return {
    ok: true,
    message: `OK: ${ownerManifestPath} declares qs@${OWNER_RANGE}`,
  };
}

// ---------------------------------------------------------------------------
// Assertion 2 — no other manifest (root or any other workspace package)
// declares qs in any dependency field
// ---------------------------------------------------------------------------

function assertSingleOwner(root) {
  const manifestsToCheck = [
    { label: 'package.json', filePath: path.join(root, 'package.json') },
    ...WORKSPACE_PACKAGES.filter((name) => name !== OWNER_PACKAGE).map((name) => ({
      label: path.join('packages', name, 'package.json'),
      filePath: path.join(root, 'packages', name, 'package.json'),
    })),
  ];

  for (const manifest of manifestsToCheck) {
    if (!fs.existsSync(manifest.filePath)) continue;
    const json = readJson(manifest.filePath);
    for (const field of DEPENDENCY_FIELDS) {
      const section = json[field];
      // Exact key match only — `Object.prototype.hasOwnProperty` naturally
      // excludes `@types/qs`, which is a different package name.
      if (section && Object.prototype.hasOwnProperty.call(section, 'qs')) {
        return {
          ok: false,
          reason: `${manifest.label} declares qs in ${field} — only packages/${OWNER_PACKAGE}/package.json may own qs`,
        };
      }
    }
  }
  return { ok: true, message: 'OK: no other manifest declares qs' };
}

// ---------------------------------------------------------------------------
// Assertion 3 — yarn.lock resolves exactly one qs version, at or above the
// floor
// ---------------------------------------------------------------------------

function assertSingleResolvedVersion(root) {
  const lockPath = path.join(root, 'yarn.lock');
  const lines = fs.readFileSync(lockPath, 'utf8').split('\n');

  const resolvedVersions = new Set();
  let inQsBlock = false;

  for (const line of lines) {
    // Unindented, non-comment, non-metadata lines that end with ':' are
    // lockfile entry headers — one or more comma-separated descriptors.
    if (/^[^\s#].*:\s*$/.test(line) && line.trim() !== '__metadata:') {
      const header = line.trim().replace(/:$/, '');
      const unquoted = header.replace(/^"|"$/g, '');
      const descriptors = unquoted.split(', ');
      // Match the "qs" package name exactly — a descriptor for this package
      // always starts with "qs@npm:". This excludes "@types/qs@npm:..."
      // (starts with "@types") and "qs-something@npm:..." (starts with
      // "qs-", not "qs@").
      inQsBlock = descriptors.some((descriptor) => /^qs@npm:/.test(descriptor));
      continue;
    }
    if (inQsBlock) {
      const versionMatch = /^\s+version:\s*(\S+)\s*$/.exec(line);
      if (versionMatch) {
        resolvedVersions.add(versionMatch[1]);
      }
    }
  }

  if (resolvedVersions.size === 0) {
    return { ok: false, reason: 'yarn.lock resolves zero qs versions — expected exactly one' };
  }
  if (resolvedVersions.size > 1) {
    return {
      ok: false,
      reason: `yarn.lock resolves ${resolvedVersions.size} distinct qs versions: ${Array.from(resolvedVersions).join(
        ', ',
      )} — expected exactly one`,
    };
  }

  const [onlyVersion] = Array.from(resolvedVersions);
  if (compareVersions(onlyVersion, FLOOR_VERSION) < 0) {
    return {
      ok: false,
      reason: `yarn.lock resolves qs@${onlyVersion}, below the floor ${FLOOR_VERSION}`,
    };
  }

  return {
    ok: true,
    message: `OK: yarn.lock resolves exactly one qs version (${onlyVersion})`,
  };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function main() {
  const { root } = parseArgs(process.argv.slice(2));

  const assertions = [assertOwnerRange, assertSingleOwner, assertSingleResolvedVersion];

  for (const assertion of assertions) {
    const result = assertion(root);
    if (!result.ok) {
      console.error(`FAIL: ${result.reason}`);
      process.exitCode = 1;
      return;
    }
    console.log(result.message);
  }
}

main();
