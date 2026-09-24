/* eslint-disable @typescript-eslint/no-var-requires */
'use strict';

const fs = require('fs');
const path = require('path');
const { loadWorkspacePackages } = require('./lib/workspace-packages');

// ---------------------------------------------------------------------------
// Contract under test: the release never ships a drifted peer range.
//
// 1. Internal lockstep — every `@nestjs-crud/*` range in `dependencies` and
//    `peerDependencies` equals the caret of `lerna.json` "version", and every
//    package's own "version" equals it too. `lerna version` rewrites internal
//    `dependencies` but not `peerDependencies`, so this has to be checked
//    separately from Lerna's own bump. `--fix` rewrites the drifted ranges to
//    match; it never changes a version.
// 2. External peer lines — every major (or 0.x minor line) an external peer
//    range admits must have a CI-installed version at or above that line's
//    floor. "CI-installed" means: the version `yarn.lock` resolves for the
//    root manifest's own range of that peer, or the pin of an
//    `scripts/oldest-peers.js` PROFILES entry whose name is listed in this
//    root's `.github/workflows/tests.yml` `oldest-peers` job matrix — a
//    profile removed from that matrix stops counting as tested. A line with
//    no CI-installed version needs a written reason in root `package.json`
//    `peerRangeGaps`; a gap entry that is stale (a tested version now covers
//    it) or that names a line no range admits is itself a failure.
//
// Key order never matters anywhere this script reads. See CLAUDE.md "Encode
// contracts in config, not in prose".
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  let root = path.resolve(__dirname, '..');
  let fix = false;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--root') {
      root = path.resolve(argv[i + 1]);
      i += 1;
    } else if (argv[i] === '--fix') {
      fix = true;
    }
  }
  return { root, fix };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJsonFile(filePath, obj) {
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2) + '\n');
}

function relPath(root, absPath) {
  return path.relative(root, absPath).split(path.sep).join('/');
}

// ---------------------------------------------------------------------------
// Internal lockstep — assertion 1
// ---------------------------------------------------------------------------

function collectInternalRangeEntries(manifest) {
  const results = [];
  for (const section of ['dependencies', 'peerDependencies']) {
    const obj = manifest[section];
    if (!obj) continue;
    for (const key of Object.keys(obj)) {
      if (key.startsWith('@nestjs-crud/')) {
        results.push({ section, key, value: obj[key] });
      }
    }
  }
  return results;
}

function readLernaVersion(root) {
  return readJson(path.join(root, 'lerna.json')).version;
}

function assertInternalLockstep(root) {
  const version = readLernaVersion(root);
  if (!version || version === 'independent') {
    return {
      ok: false,
      reason: `lerna.json "version" must be a fixed version string, not "independent" or missing (found: ${JSON.stringify(
        version,
      )})`,
    };
  }

  const { packages } = loadWorkspacePackages(root);
  let rangeCount = 0;
  for (const entry of packages) {
    const manifestRel = relPath(root, entry.manifestPath);
    if (entry.manifest.version !== version) {
      return {
        ok: false,
        reason: `${manifestRel} "version" is "${entry.manifest.version}", expected "${version}" (lerna.json)`,
      };
    }
    for (const { section, key, value } of collectInternalRangeEntries(entry.manifest)) {
      rangeCount += 1;
      const expected = `^${version}`;
      if (value !== expected) {
        return {
          ok: false,
          reason: `${manifestRel} ${section}.${key} is "${value}", expected "${expected}"`,
        };
      }
    }
  }

  return {
    ok: true,
    message: `OK: all ${packages.length} packages are at ${version} and every internal @nestjs-crud range (${rangeCount}) is ^${version}`,
  };
}

// `--fix`: rewrite every internal `@nestjs-crud/*` range in `dependencies`
// and `peerDependencies` to the caret of the `lerna.json` version. Touches no
// other key. Never changes a version. Writes only manifests that changed.
function fixInternalLockstep(root) {
  const version = readLernaVersion(root);
  const { packages } = loadWorkspacePackages(root);
  const changes = [];

  for (const entry of packages) {
    const manifest = readJson(entry.manifestPath);
    let changed = false;
    for (const section of ['dependencies', 'peerDependencies']) {
      const obj = manifest[section];
      if (!obj) continue;
      for (const key of Object.keys(obj)) {
        if (!key.startsWith('@nestjs-crud/')) continue;
        const expected = `^${version}`;
        if (obj[key] !== expected) {
          changes.push({ manifestRel: relPath(root, entry.manifestPath), section, key, old: obj[key], next: expected });
          obj[key] = expected;
          changed = true;
        }
      }
    }
    if (changed) {
      writeJsonFile(entry.manifestPath, manifest);
    }
  }

  return changes;
}

// ---------------------------------------------------------------------------
// peerRangeGaps reasons — assertion 2
// ---------------------------------------------------------------------------

function readPeerRangeGaps(rootManifest) {
  return rootManifest.peerRangeGaps || {};
}

function assertPeerGapReasons(root) {
  const manifest = readJson(path.join(root, 'package.json'));
  const gapsField = manifest.peerRangeGaps;
  if (gapsField !== undefined && (typeof gapsField !== 'object' || gapsField === null || Array.isArray(gapsField))) {
    return { ok: false, reason: 'root package.json "peerRangeGaps" must be a plain object when present' };
  }
  const gaps = gapsField || {};
  for (const key of Object.keys(gaps)) {
    const value = gaps[key];
    if (typeof value !== 'string' || value.trim() === '') {
      return { ok: false, reason: `peerRangeGaps["${key}"] must be a non-empty string` };
    }
  }
  return {
    ok: true,
    message: `OK: every peer range gap (${Object.keys(gaps).length}) has a written reason`,
  };
}

// ---------------------------------------------------------------------------
// External peer lines — assertion 3
// ---------------------------------------------------------------------------

function readYarnLockLines(root) {
  return fs.readFileSync(path.join(root, 'yarn.lock'), 'utf8').split('\n');
}

// Same header/version parsing approach as scripts/check-manifest-contracts.js,
// generalized to an arbitrary "<name>@npm:<range>" descriptor.
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
      if (versionMatch) return versionMatch[1];
    }
  }
  return null;
}

function extractMatrixProfileNames(root) {
  const text = fs.readFileSync(path.join(root, '.github', 'workflows', 'tests.yml'), 'utf8');
  const names = new Set();
  const re = /-\s*profile:\s*([A-Za-z0-9_-]+)/g;
  let match;
  while ((match = re.exec(text))) {
    names.add(match[1]);
  }
  return names;
}

// A branch (or a plain version) is on line "X" when major X is above 0,
// otherwise "0.Y".
function lineFor(major, minor) {
  return major > 0 ? String(major) : `0.${minor}`;
}

function parseCaretBranch(branchStr) {
  const m = /^\^(\d+)\.(\d+)\.(\d+)$/.exec(branchStr);
  if (!m) return null;
  const major = Number(m[1]);
  const minor = Number(m[2]);
  const patch = Number(m[3]);
  return { major, minor, patch, line: lineFor(major, minor) };
}

function parsePlainVersion(value) {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(value));
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

function compareTriples(a, b) {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

function floorLabel(floor) {
  return `${floor.major}.${floor.minor}.${floor.patch}`;
}

function assertExternalPeerLines(root) {
  const { packages } = loadWorkspacePackages(root);
  const rootManifest = readJson(path.join(root, 'package.json'));
  const lockLines = readYarnLockLines(root);
  const matrixProfileNames = extractMatrixProfileNames(root);

  let profiles;
  try {
    // eslint-disable-next-line import/no-dynamic-require, global-require
    profiles = require(path.join(root, 'scripts', 'oldest-peers.js')).PROFILES;
  } catch (err) {
    return { ok: false, reason: `could not load scripts/oldest-peers.js PROFILES: ${err.message}` };
  }
  if (!profiles || typeof profiles !== 'object') {
    return { ok: false, reason: 'scripts/oldest-peers.js does not export PROFILES' };
  }

  function testedVersionsForPeer(peerName) {
    const versions = [];
    for (const section of ['dependencies', 'devDependencies']) {
      const obj = rootManifest[section] || {};
      if (Object.prototype.hasOwnProperty.call(obj, peerName)) {
        const range = obj[peerName];
        const resolved = findResolvedVersionForDescriptor(lockLines, `${peerName}@npm:${range}`);
        if (resolved) versions.push(resolved);
      }
    }
    for (const profileName of matrixProfileNames) {
      const profile = profiles[profileName];
      if (!profile || !profile.pins) continue;
      if (Object.prototype.hasOwnProperty.call(profile.pins, peerName)) {
        versions.push(profile.pins[peerName]);
      }
    }
    return versions;
  }

  function isLineCovered(peer, line, floor) {
    const tested = testedVersionsForPeer(peer);
    const covering = tested.find((v) => {
      const parsed = parsePlainVersion(v);
      if (!parsed) return false;
      if (lineFor(parsed.major, parsed.minor) !== line) return false;
      return compareTriples(parsed, floor) >= 0;
    });
    return { covered: Boolean(covering), tested };
  }

  // Step 1 — collect every admitted external peer line, validating shape.
  const admittedByLine = new Map();
  for (const entry of packages) {
    const manifestRel = relPath(root, entry.manifestPath);
    const peerDeps = entry.manifest.peerDependencies || {};
    for (const peer of Object.keys(peerDeps)) {
      if (peer.startsWith('@nestjs-crud/')) continue;
      const rangeRaw = peerDeps[peer];
      const branches = String(rangeRaw)
        .split('||')
        .map((s) => s.trim());
      for (const branchStr of branches) {
        const parsed = parseCaretBranch(branchStr);
        if (!parsed) {
          return {
            ok: false,
            reason: `${manifestRel} peerDependencies.${peer} has an unsupported range "${rangeRaw}" (branch "${branchStr}" is not a caret range)`,
          };
        }
        const key = `${peer}@${parsed.line}`;
        const existing = admittedByLine.get(key);
        if (!existing) {
          admittedByLine.set(key, { peer, line: parsed.line, floor: parsed });
        } else if (compareTriples(parsed, existing.floor) > 0) {
          existing.floor = parsed;
        }
      }
    }
  }

  // Step 2 — every admitted line needs a CI-installed version at or above
  // its floor, or a reasoned gap.
  const gaps = readPeerRangeGaps(rootManifest);
  const gapsUsed = new Set();
  for (const [key, rec] of admittedByLine) {
    const { covered, tested } = isLineCovered(rec.peer, rec.line, rec.floor);
    if (covered) continue;
    if (Object.prototype.hasOwnProperty.call(gaps, key)) {
      gapsUsed.add(key);
      continue;
    }
    return {
      ok: false,
      reason: `${rec.peer}@${rec.line} (floor ^${floorLabel(rec.floor)}) has no CI-installed version and no peerRangeGaps["${key}"] entry (tested versions: ${
        tested.length ? tested.join(', ') : 'none'
      })`,
    };
  }

  // Step 3 — every gap entry must parse, admit, and still be needed.
  for (const gapKey of Object.keys(gaps)) {
    const at = gapKey.lastIndexOf('@');
    if (at <= 0) {
      return { ok: false, reason: `peerRangeGaps key "${gapKey}" does not parse as "<name>@<line>"` };
    }
    const name = gapKey.slice(0, at);
    const line = gapKey.slice(at + 1);
    const rec = admittedByLine.get(`${name}@${line}`);
    if (!rec) {
      return { ok: false, reason: `peerRangeGaps["${gapKey}"] does not match any admitted external peer line` };
    }
    const { covered } = isLineCovered(rec.peer, rec.line, rec.floor);
    if (covered) {
      return {
        ok: false,
        reason: `peerRangeGaps["${gapKey}"] is stale — a CI-installed version already covers ${name}@${line}`,
      };
    }
  }

  return {
    ok: true,
    message: `OK: every admitted external peer line (${admittedByLine.size}) has a CI-installed version or a reasoned gap (${gapsUsed.size})`,
  };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function main() {
  const { root, fix } = parseArgs(process.argv.slice(2));

  if (fix) {
    const changes = fixInternalLockstep(root);
    for (const change of changes) {
      console.log(`fixed: ${change.manifestRel} ${change.section} ${change.key} ${change.old} -> ${change.next}`);
    }
    if (changes.length > 0) {
      console.log(
        'NOTE: run a real `yarn install` (yarn.lock records workspace peer ranges), then `yarn install --immutable`.',
      );
    }
  }

  const assertions = [assertInternalLockstep, assertPeerGapReasons, assertExternalPeerLines];

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
