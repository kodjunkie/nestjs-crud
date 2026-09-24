/* eslint-disable @typescript-eslint/no-var-requires */
'use strict';

const fs = require('fs');
const path = require('path');
const { loadWorkspacePackages } = require('./lib/workspace-packages');

// ---------------------------------------------------------------------------
// Contract under test: qs has exactly one owner (packages/request) at exactly
// one resolved version, never below the floor it declares. Contracts encoded
// here, not in prose — see CLAUDE.md "Encode contracts in config, not prose".
// ---------------------------------------------------------------------------

const OWNER_PACKAGE = 'request';
const OWNER_RANGE = '^6.16.0';
const FLOOR_VERSION = '6.16.0';
const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];

// Contract under test: every published manifest declares the same Node floor,
// and that floor is exactly EXPECTED_NODE_FLOOR. A published package with no
// floor, or with a floor that drifts from its siblings, is a defect — see
// CLAUDE.md "Encode contracts in config, not prose".
const EXPECTED_NODE_FLOOR = '>=22.12.0';

// Contract under test: every key in root package.json's `resolutions` block
// has a same-named, non-empty, written reason in the sibling
// `resolutionReasons` object (and vice versa) — a resolutions entry with no
// recorded reason is a defect, not a style nit. See CLAUDE.md "Encode
// contracts in config, not prose".

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

function readYarnLockLines(root) {
  const lockPath = path.join(root, 'yarn.lock');
  return fs.readFileSync(lockPath, 'utf8').split('\n');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
  const { dirs } = loadWorkspacePackages(root);
  const manifestsToCheck = [
    { label: 'package.json', filePath: path.join(root, 'package.json') },
    ...dirs
      .filter((name) => name !== OWNER_PACKAGE)
      .map((name) => ({
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
  const lines = readYarnLockLines(root);

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
// Assertion 4 — every published manifest declares the same engines.node
// floor, and that floor is the expected value
// ---------------------------------------------------------------------------

function assertEnginesFloor(root) {
  const { dirs } = loadWorkspacePackages(root);
  for (const name of dirs) {
    const manifestPath = path.join('packages', name, 'package.json');
    const manifest = readJson(path.join(root, manifestPath));
    const nodeFloor = manifest.engines && manifest.engines.node;
    if (!nodeFloor) {
      return {
        ok: false,
        reason: `${manifestPath} declares no engines.node — expected "${EXPECTED_NODE_FLOOR}"`,
      };
    }
    if (nodeFloor !== EXPECTED_NODE_FLOOR) {
      return {
        ok: false,
        reason: `${manifestPath} declares engines.node "${nodeFloor}" — expected "${EXPECTED_NODE_FLOOR}" (must be identical across all ${dirs.length} published packages)`,
      };
    }
  }
  return {
    ok: true,
    message: `OK: all ${dirs.length} published packages declare engines.node ${EXPECTED_NODE_FLOOR}`,
  };
}

// ---------------------------------------------------------------------------
// Assertion 5 — every root `resolutions` entry carries a written reason
// ---------------------------------------------------------------------------

function assertResolutionReasons(root) {
  const manifestPath = path.join(root, 'package.json');
  const manifest = readJson(manifestPath);

  const resolutionsField = manifest.resolutions;
  if (
    resolutionsField !== undefined &&
    (typeof resolutionsField !== 'object' || resolutionsField === null || Array.isArray(resolutionsField))
  ) {
    return { ok: false, reason: 'root package.json "resolutions" must be a plain object when present' };
  }
  const reasonsField = manifest.resolutionReasons;
  if (
    reasonsField !== undefined &&
    (typeof reasonsField !== 'object' || reasonsField === null || Array.isArray(reasonsField))
  ) {
    return { ok: false, reason: 'root package.json "resolutionReasons" must be a plain object when present' };
  }

  const resolutions = resolutionsField || {};
  const reasons = reasonsField || {};

  for (const key of Object.keys(resolutions)) {
    if (!Object.prototype.hasOwnProperty.call(reasons, key)) {
      return { ok: false, reason: `resolutions key "${key}" has no matching entry in resolutionReasons` };
    }
  }
  for (const key of Object.keys(reasons)) {
    if (!Object.prototype.hasOwnProperty.call(resolutions, key)) {
      return { ok: false, reason: `resolutionReasons key "${key}" has no matching entry in resolutions` };
    }
    const value = reasons[key];
    if (typeof value !== 'string' || value.trim() === '') {
      return { ok: false, reason: `resolutionReasons["${key}"] must be a non-empty string` };
    }
  }

  const count = Object.keys(resolutions).length;
  return {
    ok: true,
    message: `OK: every root resolutions entry (${count}) has a written reason`,
  };
}

// ---------------------------------------------------------------------------
// Assertion 6 — every root `resolutions` override actually takes effect:
// yarn.lock resolves the override descriptor to a version at or above the
// patched floor its resolutionReasons entry cites, and the named parent
// still declares a dependency on the overridden package. Catches the
// regression assertResolutionReasons can't: a resolutions key that stops
// matching any real dependency edge (Yarn silently no-ops an unmatched
// resolution rather than erroring), which would otherwise silently
// reintroduce the exact vulnerable version the override exists to exclude.
// See CLAUDE.md "Encode contracts in config, not prose".
// ---------------------------------------------------------------------------

// Confirms `parentName`'s own lockfile entry still declares a dependency on
// `pkgName` — the structural edge the resolutions override targets.
function parentDeclaresDependency(lines, parentName, pkgName) {
  const parentHeaderPattern = new RegExp(`^"?${escapeRegExp(parentName)}@npm:`);
  let inParentBlock = false;
  let inDependenciesSection = false;

  for (const line of lines) {
    if (/^[^\s#].*:\s*$/.test(line) && line.trim() !== '__metadata:') {
      inDependenciesSection = false;
      inParentBlock = parentHeaderPattern.test(line.trim());
      continue;
    }
    if (!inParentBlock) continue;
    if (/^\s{2}dependencies:\s*$/.test(line)) {
      inDependenciesSection = true;
      continue;
    }
    if (inDependenciesSection) {
      if (/^\s{2}\S/.test(line)) {
        // Dedented back to a block-level key (checksum, languageName, ...) —
        // the dependencies section ended without a match.
        inDependenciesSection = false;
        continue;
      }
      const keyMatch = /^\s{4}("?)([^":]+)\1:/.exec(line);
      if (keyMatch && keyMatch[2] === pkgName) {
        return true;
      }
    }
  }
  return false;
}

// Finds the resolved `version:` for a lockfile entry whose header lists the
// exact descriptor `<pkgName>@npm:<range>` — same header-parsing approach as
// assertSingleResolvedVersion above, generalized to an arbitrary descriptor.
function findResolvedVersionForDescriptor(lines, descriptor) {
  let inBlock = false;
  for (const line of lines) {
    if (/^[^\s#].*:\s*$/.test(line) && line.trim() !== '__metadata:') {
      const header = line.trim().replace(/:$/, '');
      const unquoted = header.replace(/^"|"$/g, '');
      const descriptors = unquoted.split(', ');
      inBlock = descriptors.includes(descriptor);
      continue;
    }
    if (inBlock) {
      const versionMatch = /^\s+version:\s*(\S+)\s*$/.exec(line);
      if (versionMatch) {
        return versionMatch[1];
      }
    }
  }
  return null;
}

function assertResolutionsApplied(root) {
  const manifest = readJson(path.join(root, 'package.json'));
  const resolutions = manifest.resolutions || {};
  const reasons = manifest.resolutionReasons || {};
  const lines = readYarnLockLines(root);

  for (const key of Object.keys(resolutions)) {
    // key is "<parent>/<pkg>"; pkg is always the last segment, parent is
    // everything before it (parent may itself be scoped, e.g.
    // "@prisma/adapter-mariadb/mariadb").
    const segments = key.split('/');
    const pkgName = segments.pop();
    const parentName = segments.join('/');
    const range = resolutions[key];

    if (!parentDeclaresDependency(lines, parentName, pkgName)) {
      return {
        ok: false,
        reason: `resolutions["${key}"] targets a dependency edge that no longer exists — yarn.lock's "${parentName}" entry no longer declares a "${pkgName}" dependency, so this override is a silent no-op`,
      };
    }

    const descriptor = `${pkgName}@npm:${range}`;
    const resolvedVersion = findResolvedVersionForDescriptor(lines, descriptor);
    if (!resolvedVersion) {
      return {
        ok: false,
        reason: `resolutions["${key}"] = "${range}" but yarn.lock has no resolved entry for "${descriptor}" — the override may not be taking effect`,
      };
    }

    const reasonText = reasons[key] || '';
    const floorMatch = /patched in ([0-9]+\.[0-9]+\.[0-9]+)/.exec(reasonText);
    if (!floorMatch) {
      return {
        ok: false,
        reason: `resolutionReasons["${key}"] does not state a "patched in X.Y.Z" floor to verify yarn.lock against`,
      };
    }
    const floorVersion = floorMatch[1];
    if (compareVersions(resolvedVersion, floorVersion) < 0) {
      return {
        ok: false,
        reason: `yarn.lock resolves "${descriptor}" to ${resolvedVersion}, below the floor ${floorVersion} that resolutionReasons["${key}"] cites as patched`,
      };
    }
  }

  const count = Object.keys(resolutions).length;
  return {
    ok: true,
    message: `OK: all ${count} resolutions overrides resolve in yarn.lock at or above their cited patched floor`,
  };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function main() {
  const { root } = parseArgs(process.argv.slice(2));

  const assertions = [
    assertOwnerRange,
    assertSingleOwner,
    assertSingleResolvedVersion,
    assertEnginesFloor,
    assertResolutionReasons,
    assertResolutionsApplied,
  ];

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
