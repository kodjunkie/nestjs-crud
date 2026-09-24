/* eslint-disable @typescript-eslint/no-var-requires */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

// ---------------------------------------------------------------------------
// Purpose: apply, assert, and restore an ephemeral downgrade of the root
// manifest to the oldest peer majors the packages claim, so CI (and a local
// run) can prove those lines actually work rather than merely declaring them.
// Never edits packages/*/package.json. Never commits package.json or
// yarn.lock in their downgraded state — apply/restore round-trips back to
// the committed tree, and the caller decides when to run each half.
// ---------------------------------------------------------------------------

const REPO_ROOT = path.resolve(__dirname, '..');
const ROOT_PKG_PATH = path.join(REPO_ROOT, 'package.json');
const LOCKFILE_PATH = path.join(REPO_ROOT, 'yarn.lock');

// Fixed (not PID-suffixed) so a later `--restore` invocation, run as a
// separate process, can find the snapshot an earlier `apply` call left
// behind.
const SNAPSHOT_DIR = path.join(os.tmpdir(), 'nestjs-crud-oldest-peers');
const SNAPSHOT_PKG_PATH = path.join(SNAPSHOT_DIR, 'package.json.snapshot');
const SNAPSHOT_LOCK_PATH = path.join(SNAPSHOT_DIR, 'yarn.lock.snapshot');
const SNAPSHOT_STATE_PATH = path.join(SNAPSHOT_DIR, 'state.json');

// The single resolution entry that forces @nestjs/swagger's own
// path-to-regexp onto the 8 line. Swagger 11 and 12 need it (their own
// path-to-regexp already sits on a lower line otherwise); swagger 7 and 8
// ship a path-to-regexp whose API this resolution would silently replace, so
// the NestJS 10 profiles drop it in the ephemeral tree before installing.
const SWAGGER_PATH_TO_REGEXP_RESOLUTION_KEY = '@nestjs/swagger/path-to-regexp';

const PROFILES = {
  nestjs11: {
    pins: {
      '@nestjs/common': '11.2.5',
      '@nestjs/core': '11.2.5',
      '@nestjs/platform-express': '11.2.5',
      '@nestjs/testing': '11.2.5',
      '@nestjs/typeorm': '11.0.3',
      '@nestjs/swagger': '11.4.7',
      typeorm: '0.3.30',
      'class-validator': '0.14.4',
      redis: '5.12.1',
      ioredis: '5.11.1',
    },
    dropResolutions: [],
  },
  'nestjs10-swagger7': {
    pins: {
      '@nestjs/common': '10.4.22',
      '@nestjs/core': '10.4.22',
      '@nestjs/platform-express': '10.4.22',
      '@nestjs/testing': '10.4.22',
      '@nestjs/typeorm': '10.0.2',
      '@nestjs/swagger': '7.4.2',
      typeorm: '0.3.30',
      'class-validator': '0.14.4',
      redis: '5.12.1',
      ioredis: '5.11.1',
    },
    dropResolutions: [SWAGGER_PATH_TO_REGEXP_RESOLUTION_KEY],
  },
  'nestjs10-swagger8': {
    pins: {
      '@nestjs/common': '10.4.22',
      '@nestjs/core': '10.4.22',
      '@nestjs/platform-express': '10.4.22',
      '@nestjs/testing': '10.4.22',
      '@nestjs/typeorm': '10.0.2',
      '@nestjs/swagger': '8.1.1',
      typeorm: '0.3.30',
      'class-validator': '0.14.4',
      redis: '5.12.1',
      ioredis: '5.11.1',
    },
    dropResolutions: [SWAGGER_PATH_TO_REGEXP_RESOLUTION_KEY],
  },
};

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function fail(message) {
  console.error(`FATAL: ${message}`);
  process.exit(2);
}

function usageAndExit() {
  console.error('Usage:');
  console.error(
    '  node scripts/oldest-peers.js <profile>   Apply a profile (' + Object.keys(PROFILES).join(', ') + ')',
  );
  console.error('  node scripts/oldest-peers.js --restore   Restore package.json and yarn.lock from the snapshot');
  process.exit(2);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, obj) {
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2) + '\n');
}

function runCapture(cmd, args, cwd, extraEnv) {
  const env = { ...process.env, ...(extraEnv || {}) };
  const result = spawnSync(cmd, args, { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const output = (result.stdout || '') + (result.stderr || '');
  process.stdout.write(output);
  return { status: result.status === null ? 1 : result.status, output };
}

function gitPorcelain(paths) {
  const result = spawnSync('git', ['status', '--porcelain', '--', ...paths], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  return (result.stdout || '').trim();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Mirrors the header/version parsing in scripts/check-manifest-contracts.js,
// generalized to any package name instead of a single hardcoded one.
function resolvedVersionsForPackage(lockText, pkgName) {
  const descriptorPrefix = `${pkgName}@npm:`;
  const headerNeedle = new RegExp(`(^|[",\\s])${escapeRegExp(descriptorPrefix)}`);
  const versions = new Set();
  let inBlock = false;

  for (const line of lockText.split('\n')) {
    if (/^[^\s#].*:\s*$/.test(line) && line.trim() !== '__metadata:') {
      inBlock = headerNeedle.test(line);
      continue;
    }
    if (inBlock) {
      const match = /^\s+version:\s*(\S+)\s*$/.exec(line);
      if (match) versions.add(match[1]);
    }
  }
  return Array.from(versions);
}

function installedVersion(pkgName) {
  const manifestPath = path.join(REPO_ROOT, 'node_modules', pkgName, 'package.json');
  if (!fs.existsSync(manifestPath)) return null;
  try {
    return readJson(manifestPath).version;
  } catch (_) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

function applyProfile(profileName) {
  const profile = PROFILES[profileName];
  if (!profile) {
    fail(`unknown profile "${profileName}" (expected one of: ${Object.keys(PROFILES).join(', ')})`);
  }

  console.log(`=== oldest-peers: apply ${profileName} ===\n`);

  const dirty = gitPorcelain(['package.json', 'yarn.lock']);
  if (dirty) {
    fail(
      'package.json and/or yarn.lock have uncommitted changes. Refusing to apply a profile on a dirty tree, ' +
        'so the snapshot this script takes is the committed state:\n' +
        dirty,
    );
  }

  fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
  fs.copyFileSync(ROOT_PKG_PATH, SNAPSHOT_PKG_PATH);
  fs.copyFileSync(LOCKFILE_PATH, SNAPSHOT_LOCK_PATH);
  writeJson(SNAPSHOT_STATE_PATH, { profile: profileName, appliedAt: new Date().toISOString() });
  console.log(`Snapshot of package.json and yarn.lock written to: ${SNAPSHOT_DIR}\n`);

  if (profile.dropResolutions.length > 0) {
    const pkg = readJson(ROOT_PKG_PATH);
    let changed = false;
    for (const key of profile.dropResolutions) {
      if (pkg.resolutions && Object.prototype.hasOwnProperty.call(pkg.resolutions, key)) {
        delete pkg.resolutions[key];
        changed = true;
        console.log(`Dropped resolution "${key}" for this profile.`);
      }
    }
    if (changed) writeJson(ROOT_PKG_PATH, pkg);
  }

  const specs = Object.entries(profile.pins).map(([name, version]) => `${name}@${version}`);
  console.log(`\nRunning: yarn up ${specs.join(' ')}\n`);
  const up = runCapture('yarn', ['up', ...specs], REPO_ROOT, { YARN_ENABLE_IMMUTABLE_INSTALLS: 'false' });
  if (up.status !== 0) {
    fail(`yarn up exited ${up.status}. The manifest and/or lockfile may now be partially modified — run --restore.`);
  }

  console.log('\nAsserting installed versions and lockfile resolutions against the pinned set...\n');
  const failures = [];
  for (const [name, expected] of Object.entries(profile.pins)) {
    const installed = installedVersion(name);
    const lockVersions = resolvedVersionsForPackage(fs.readFileSync(LOCKFILE_PATH, 'utf8'), name);
    const installedOk = installed === expected;
    const lockOk = lockVersions.length === 1 && lockVersions[0] === expected;
    const status = installedOk && lockOk ? 'OK' : 'FAIL';
    console.log(
      `  [${status}] ${name}: expected=${expected} installed=${installed || 'MISSING'} lockfile=${
        lockVersions.length === 0 ? 'NONE' : lockVersions.join(', ')
      }`,
    );
    if (!installedOk || !lockOk) {
      failures.push({ name, expected, installed, lockVersions });
    }
  }

  if (failures.length > 0) {
    console.error('\nFATAL: the following pinned packages did not land as expected:');
    for (const f of failures) {
      console.error(
        `  - ${f.name}: expected ${f.expected}, installed ${f.installed || 'MISSING'}, lockfile [${f.lockVersions.join(', ')}]`,
      );
    }
    console.error('\nThe manifest and/or lockfile are left as-is for investigation. Run --restore when done.');
    process.exit(2);
  }

  console.log(`\nProfile ${profileName} applied and verified.`);
}

// ---------------------------------------------------------------------------
// Restore
// ---------------------------------------------------------------------------

function restore() {
  console.log('=== oldest-peers: restore ===\n');

  if (!fs.existsSync(SNAPSHOT_PKG_PATH) || !fs.existsSync(SNAPSHOT_LOCK_PATH)) {
    fail(`no snapshot found at ${SNAPSHOT_DIR} — nothing to restore (was a profile ever applied?)`);
  }

  fs.copyFileSync(SNAPSHOT_PKG_PATH, ROOT_PKG_PATH);
  fs.copyFileSync(SNAPSHOT_LOCK_PATH, LOCKFILE_PATH);
  console.log('package.json and yarn.lock restored from snapshot.\n');

  console.log('Running: yarn install --immutable\n');
  const install = runCapture('yarn', ['install', '--immutable'], REPO_ROOT);
  if (install.status !== 0) {
    fail(
      `yarn install --immutable exited ${install.status} after restoring the snapshot — investigate before retrying.`,
    );
  }

  const dirty = gitPorcelain(['package.json', 'yarn.lock']);
  if (dirty) {
    fail(`package.json and/or yarn.lock are still modified after restore:\n${dirty}`);
  }

  try {
    fs.rmSync(SNAPSHOT_DIR, { recursive: true, force: true });
  } catch (_) {
    // best-effort cleanup
  }

  console.log('Restore verified clean.');
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function main() {
  const argv = process.argv.slice(2);
  const restoreFlag = argv.includes('--restore');
  const profileArg = argv.find((a) => !a.startsWith('--'));

  if (restoreFlag && profileArg) {
    usageAndExit();
  }
  if (restoreFlag) {
    restore();
    return;
  }
  if (!profileArg) {
    usageAndExit();
  }
  applyProfile(profileArg);
}

module.exports = { PROFILES };

if (require.main === module) {
  main();
}
