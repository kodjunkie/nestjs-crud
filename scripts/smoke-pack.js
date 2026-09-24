/* eslint-disable @typescript-eslint/no-var-requires */
'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync, spawnSync } = require('child_process');
const { loadWorkspacePackages } = require('./lib/workspace-packages');

// ---------------------------------------------------------------------------
// Configuration — contracts encoded here, not in prose comments
// ---------------------------------------------------------------------------

const REPO_ROOT = path.resolve(__dirname, '..');

let WORKSPACE;
try {
  WORKSPACE = loadWorkspacePackages(REPO_ROOT);
} catch (err) {
  console.error(`FATAL: ${err.message}`);
  process.exit(2);
}

// The full set of publishable workspace packages, and the subset that are
// adapters (packages nothing else in the workspace depends on), both derived
// from the manifests — see scripts/lib/workspace-packages.js.
const WORKSPACE_PACKAGES = WORKSPACE.dirs;
const ADAPTER_PACKAGES = WORKSPACE.adapterDirs;

// Specifiers that MUST resolve from the installed tarballs: every package's
// root specifier, plus every explicit `exports` subpath (today, only core
// has one).
const ALL_CHECKS = [...WORKSPACE.rootSpecifiers, ...WORKSPACE.subpathSpecifiers];

// Required (non-optional) peers across the packed manifests, excluding the
// internal @nestjs-crud/* ones, at the ranges the root manifest declares.
const REQUIRED_PEERS = WORKSPACE.requiredExternalPeers;
const EXTRA_ROOT_DEPS = ['@nestjs/core', 'reflect-metadata', 'rxjs'];

// pnpm 12.5.1 has a confirmed regression where a peerDependency satisfied
// through an `overrides`-resolved `file:`/`link:` specifier is always
// reported as unmet under --strict-peer-dependencies=true, regardless of the
// tarball's actual (self-checked) version — see
// https://github.com/pnpm/pnpm/issues/10417 and the closed-as-unrelated
// https://github.com/pnpm/pnpm/issues/7572 (that one covers `npm:` alias
// overrides, not `file:`/`link:`). Verified live: pnpm 10.34.5 resolves the
// identical stamped tarballs and consumer manifest cleanly under the same
// flag. Pinning the older, still-fully-strict release proves the real
// contract (no @nestjs-crud peer warnings) without disabling any check.
const PNPM_VERSION = '10.34.5';
const YARN_VERSION = '4.12.0';

// The npm workaround for the typeorm/ioredis optional-peer ERESOLVE is
// documented in these locations; the --expect-ioredis-eresolve canary's
// failure message must name all of them so a maintainer knows exactly what
// to remove once the conflict stops reproducing.
const IOREDIS_DOC_LOCATIONS = [
  'scripts/smoke-pack.js (this ioredis pin, in the legacy/npm consumer)',
  'packages/typeorm/README.md',
  'docs/wiki/ServiceTypeorm.md',
  'CHANGELOG.md (Unreleased)',
  'packages/typeorm/CHANGELOG.md (Unreleased)',
  'skills/nestjs-crud/SKILL.md (troubleshooting table)',
  'skills/nestjs-crud-migration/SKILL.md (troubleshooting table)',
];

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
function hasFlag(name) {
  return argv.includes(`--${name}`);
}
function getOpt(name, fallback) {
  const prefix = `--${name}=`;
  const found = argv.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

const PM = getOpt('pm', 'npm');
const STRICT_PEERS = hasFlag('strict-peers');
const EXPECT_IOREDIS_ERESOLVE = hasFlag('expect-ioredis-eresolve');
const FAULT = getOpt('fault', null);

if (!['npm', 'yarn', 'pnpm'].includes(PM)) {
  console.error(`FATAL: unknown --pm=${PM} (expected npm, yarn, or pnpm)`);
  process.exit(2);
}
if (FAULT !== null && FAULT !== 'unmet-peer') {
  console.error(`FATAL: unknown --fault=${FAULT} (expected unmet-peer)`);
  process.exit(2);
}
if (!STRICT_PEERS && !EXPECT_IOREDIS_ERESOLVE && PM !== 'npm') {
  console.error(
    'FATAL: the legacy (non-strict) consumer shape only needs the ioredis pin npm requires; pass --strict-peers to exercise yarn or pnpm.',
  );
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Temp directory setup — PID-suffixed, always outside the monorepo
// ---------------------------------------------------------------------------

const tmpBase = path.join(os.tmpdir(), `nestjs-crud-smoke-${process.pid}`);
const tarballsDir = path.join(tmpBase, 'tarballs');
const stagingDir = path.join(tmpBase, 'staging');
const projectDir = path.join(tmpBase, 'project');

// Cleanup registered BEFORE any writes so it always fires
function cleanup() {
  try {
    fs.rmSync(tmpBase, { recursive: true, force: true });
  } catch (_) {
    // best-effort
  }
}

process.on('exit', cleanup);
process.on('SIGINT', () => process.exit(130));

fs.mkdirSync(tarballsDir, { recursive: true });
fs.mkdirSync(stagingDir, { recursive: true });
fs.mkdirSync(projectDir, { recursive: true });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// A single prerelease identifier (no dots) so a numeric-looking sha can never
// turn this into a bare-numeric semver prerelease — "ci-<sha>-<pid>" always
// contains letters. Every run gets a throwaway version no registry has ever
// published, so no package manager can substitute registry metadata for a
// published release (see the version-collision finding this stamping fixes).
function computeStamp() {
  let idPart;
  try {
    idPart = execSync('git rev-parse --short HEAD', {
      cwd: REPO_ROOT,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
  } catch (_) {
    idPart = '';
  }
  if (!idPart) idPart = `t${Date.now()}`;
  return `0.0.0-ci-${idPart}-${process.pid}`;
}

const STAMP = computeStamp();

const ROOT_PKG = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
function rootRange(name) {
  return (
    (ROOT_PKG.dependencies && ROOT_PKG.dependencies[name]) ||
    (ROOT_PKG.devDependencies && ROOT_PKG.devDependencies[name])
  );
}

// Spawns a package manager with an environment copy that drops inherited
// YARN_/BERRY_/npm_ keys, so running this harness from a yarn script (or a
// CI job that already set npm_config_* vars) cannot leak configuration into
// the child install.
function cleanEnv() {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith('YARN_') || key.startsWith('BERRY_') || key.startsWith('npm_')) continue;
    env[key] = value;
  }
  env.COREPACK_ENABLE_DOWNLOAD_PROMPT = '0';
  return env;
}

function runCapture(cmd, args, cwd) {
  const result = spawnSync(cmd, args, { cwd, env: cleanEnv(), encoding: 'utf8' });
  const output = (result.stdout || '') + (result.stderr || '');
  return { status: result.status === null ? 1 : result.status, output };
}

function tarballFileSpec(name) {
  return `file:${tarballs[name]}`;
}

// ---------------------------------------------------------------------------
// Step 1 — stamp, stage and pack every workspace package
// ---------------------------------------------------------------------------

console.log('=== nestjs-crud smoke:pack ===\n');
console.log(`Stamp for this run: ${STAMP}\n`);
console.log('[1/4] Staging + packing workspace packages with stamped manifests...');

const tarballs = {}; // package short-name -> absolute tarball path

function extractManifestFromTarball(tarballPath) {
  const buf = execSync(`tar -xOzf "${tarballPath}" package/package.json`);
  return JSON.parse(buf.toString('utf8'));
}

function selfCheckTarball(name, tarballPath) {
  const manifest = extractManifestFromTarball(tarballPath);
  if (manifest.version !== STAMP) {
    console.error(
      `FATAL: self-check failed for ${name}: tarball version is "${manifest.version}", expected stamp "${STAMP}"`,
    );
    process.exit(2);
  }
  for (const section of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    const deps = manifest[section] || {};
    for (const [dep, range] of Object.entries(deps)) {
      if (dep.startsWith('@nestjs-crud/') && range !== STAMP) {
        console.error(
          `FATAL: self-check failed for ${name}: ${section}.${dep} = "${range}", expected exact stamp "${STAMP}"`,
        );
        process.exit(2);
      }
    }
  }
}

function stagePackage(name) {
  const pkgDir = path.join(REPO_ROOT, 'packages', name);
  const pkgJson = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
  const stageDir = path.join(stagingDir, name);
  fs.mkdirSync(stageDir, { recursive: true });

  // Copy exactly what `files` ships, plus README.md/LICENSE when present.
  const entries = new Set(pkgJson.files || []);
  entries.add('README.md');
  entries.add('LICENSE');
  for (const entry of entries) {
    const src = path.join(pkgDir, entry);
    if (!fs.existsSync(src)) continue;
    fs.cpSync(src, path.join(stageDir, entry), { recursive: true });
  }

  // Rewrite the staged manifest only — the source manifest under packages/
  // is never touched.
  const rewritten = JSON.parse(JSON.stringify(pkgJson));
  rewritten.version = STAMP;
  for (const section of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    if (!rewritten[section]) continue;
    for (const dep of Object.keys(rewritten[section])) {
      if (dep.startsWith('@nestjs-crud/')) rewritten[section][dep] = STAMP;
    }
  }

  // --fault=unmet-peer: locally rewrite core's class-validator peer to a
  // range no published version satisfies, to prove each manager's strict
  // gate actually trips. Never mutates an @nestjs-crud/* range.
  if (
    FAULT === 'unmet-peer' &&
    name === 'core' &&
    rewritten.peerDependencies &&
    rewritten.peerDependencies['class-validator']
  ) {
    rewritten.peerDependencies['class-validator'] = '^99.0.0';
  }

  fs.writeFileSync(path.join(stageDir, 'package.json'), JSON.stringify(rewritten, null, 2));

  execSync(`npm pack --pack-destination "${tarballsDir}"`, { cwd: stageDir, stdio: 'pipe' });
  const expectedName = `nestjs-crud-${name}-${STAMP}.tgz`;
  let tarballPath = path.join(tarballsDir, expectedName);
  if (!fs.existsSync(tarballPath)) {
    const found = fs.readdirSync(tarballsDir).find((f) => f.includes(`-${name}-${STAMP}`));
    if (!found) {
      console.error(`FATAL: tarball for ${name} not found in ${tarballsDir}`);
      process.exit(2);
    }
    tarballPath = path.join(tarballsDir, found);
  }
  return tarballPath;
}

for (const name of WORKSPACE_PACKAGES) {
  const tarballPath = stagePackage(name);
  selfCheckTarball(name, tarballPath);
  tarballs[name] = tarballPath;
  console.log(`  packed ${name}@${STAMP} -> ${path.basename(tarballPath)} (self-check OK)`);
}

// ---------------------------------------------------------------------------
// Step 2 — build the consumer project
// ---------------------------------------------------------------------------

console.log('\n[2/4] Writing temp consumer project...');

function internalOverridesMap() {
  const overrides = {};
  for (const dir of WORKSPACE.internalDirs) {
    overrides[`@nestjs-crud/${dir}`] = tarballFileSpec(dir);
  }
  return overrides;
}

// The original, still-default shape: every adapter package as a direct
// dependency, every internal package supplied only via an override, and
// (unless told otherwise) the ioredis pin npm needs against the current
// typeorm/NestJS peer set. This is `yarn smoke:pack`'s shape, and the shape
// --expect-ioredis-eresolve uses with the pin removed.
function buildLegacyConsumer({ includeIoredisPin }) {
  const dependencies = {};
  for (const name of ADAPTER_PACKAGES) dependencies[`@nestjs-crud/${name}`] = tarballFileSpec(name);
  if (includeIoredisPin) {
    // typeorm 1.x declares an optional ioredis peer at ^5, while NestJS 12's
    // microservices package declares an optional ioredis peer of any version,
    // which npm resolves to 6.x and then rejects with ERESOLVE. Consumers
    // installing with npm need the same pin (see the TypeORM adapter README).
    // Remove this once typeorm's optional ioredis peer accepts 6.x.
    dependencies.ioredis = '^5.0.4';
  }
  return {
    name: 'nestjs-crud-smoke',
    version: '1.0.0',
    private: true,
    dependencies,
    overrides: internalOverridesMap(),
  };
}

// The realistic-consumer shape needed to prove there are no peer warnings
// against our own ranges: every workspace package's tarball as a direct
// dependency, every required peer at the range the root manifest declares
// for it, plus the manager's own override mechanism mapping every internal
// package name to its own tarball.
function buildStrictConsumer(pm) {
  const dependencies = {};
  for (const name of WORKSPACE_PACKAGES) dependencies[`@nestjs-crud/${name}`] = tarballFileSpec(name);
  for (const peer of [...REQUIRED_PEERS, ...EXTRA_ROOT_DEPS]) {
    const range = rootRange(peer);
    if (!range) {
      console.error(`FATAL: root package.json declares no range for required peer "${peer}"`);
      process.exit(2);
    }
    dependencies[peer] = range;
  }
  if (pm === 'npm') {
    // npm is the manager that needs the ioredis pin (see buildLegacyConsumer).
    dependencies.ioredis = '^5.0.4';
  }

  const consumerPkg = {
    name: 'nestjs-crud-pm-check',
    version: '1.0.0',
    private: true,
    dependencies,
  };

  if (pm === 'yarn') {
    consumerPkg.resolutions = internalOverridesMap();
    consumerPkg.packageManager = `yarn@${YARN_VERSION}`;
  } else if (pm === 'pnpm') {
    consumerPkg.packageManager = `pnpm@${PNPM_VERSION}`;
    // pnpm's own overrides live in pnpm-workspace.yaml (written below), not
    // in package.json — see the PNPM_VERSION comment above.
  } else {
    consumerPkg.overrides = internalOverridesMap();
  }
  return consumerPkg;
}

function writeConsumerManifest(consumerPkg) {
  fs.writeFileSync(path.join(projectDir, 'package.json'), JSON.stringify(consumerPkg, null, 2));
}

function writePnpmWorkspaceYaml() {
  const lines = ['overrides:'];
  for (const [dep, spec] of Object.entries(internalOverridesMap())) {
    lines.push(`  "${dep}": "${spec}"`);
  }
  fs.writeFileSync(path.join(projectDir, 'pnpm-workspace.yaml'), lines.join('\n') + '\n');
}

function writeYarnProjectFiles() {
  fs.writeFileSync(path.join(projectDir, '.yarnrc.yml'), 'nodeLinker: node-modules\nenableImmutableInstalls: false\n');
  fs.writeFileSync(path.join(projectDir, 'yarn.lock'), '');
}

// ---------------------------------------------------------------------------
// Step 3 — install, classified by manager
// ---------------------------------------------------------------------------

// Treats a peer complaint as a failure only when the requirer is an
// @nestjs-crud package; complaints between upstream packages are logged, not
// fatal.
function classifyNpmOutput(output) {
  return /(?:from|peer(?:Optional)?)\s+@nestjs-crud\//.test(output);
}

function runNpmInstall() {
  const install = runCapture('npm', ['install', '--no-package-lock'], projectDir);
  console.log(install.output);
  if (install.status !== 0) {
    const blocking = classifyNpmOutput(install.output);
    const message = blocking
      ? 'FATAL: npm install failed — an unmet peer names an @nestjs-crud package as the requirer:\n' + install.output
      : 'FATAL: npm install failed for a reason not attributable to an @nestjs-crud package. Establish why before treating this as expected:\n' +
        install.output;
    return { fatal: true, message };
  }
  return { fatal: false };
}

// pnpm's strict-peer tree reports each root package once (`└─┬ <name>
// <version>`), followed by its own `✕ unmet peer` lines. Attribute each
// complaint to the nearest preceding root line.
function classifyPnpmPeerIssues(output) {
  let currentOwner = null;
  const issues = [];
  for (const line of output.split('\n')) {
    const rootMatch = line.match(/^[│\s]*[└├]─┬\s+(\S+)\s+/);
    if (rootMatch) {
      currentOwner = rootMatch[1];
      continue;
    }
    if (/✕\s*unmet peer/.test(line)) {
      issues.push({ owner: currentOwner, line: line.trim() });
    }
  }
  return issues;
}

function runPnpmInstall() {
  const strict = runCapture('corepack', ['pnpm', 'install', '--strict-peer-dependencies=true'], projectDir);
  console.log(strict.output);
  if (strict.status === 0) return { fatal: false };

  const issues = classifyPnpmPeerIssues(strict.output);
  const blocking = issues.filter((i) => i.owner && i.owner.startsWith('@nestjs-crud/'));
  const upstream = issues.filter((i) => !(i.owner && i.owner.startsWith('@nestjs-crud/')));

  if (blocking.length > 0) {
    // The stamping in step 1 guarantees every internal @nestjs-crud/* range
    // is the exact installed version — if pnpm still names one here, that is
    // a pnpm reporting defect, not evidence of a real range problem. Report
    // both texts; do not soften the gate.
    let message = 'FATAL: pnpm strict-peer-dependencies failed against an @nestjs-crud package:\n';
    for (const b of blocking) message += `  owner=${b.owner}: ${b.line}\n`;
    message += `\nSelf-check in step 1 already proved every internal range equals the stamp "${STAMP}" exactly, so this names a pnpm defect, not a real range gap. Not softened.\n`;
    return { fatal: true, message };
  }

  if (issues.length === 0) {
    return {
      fatal: true,
      message:
        'FATAL: pnpm strict install failed for a reason other than a parseable peer complaint:\n' + strict.output,
    };
  }

  console.log(
    `NOTE: ${upstream.length} upstream-only pnpm peer warning(s) logged, not fatal. Reinstalling non-strictly to continue...`,
  );
  for (const u of upstream) console.log(`  owner=${u.owner}: ${u.line}`);

  const nonStrict = runCapture('corepack', ['pnpm', 'install'], projectDir);
  console.log(nonStrict.output);
  if (nonStrict.status !== 0) {
    return { fatal: true, message: 'FATAL: pnpm non-strict fallback install also failed:\n' + nonStrict.output };
  }
  return { fatal: false };
}

function extractFailingYarnHashes(output) {
  const hashes = [];
  for (const line of output.split('\n')) {
    const m = line.match(/^(p[a-f0-9]{5,7})\s*→\s*✘/);
    if (m) hashes.push(m[1]);
  }
  return hashes;
}

function namesFromYarnDetail(detail) {
  const names = [];
  for (const line of detail.split('\n')) {
    const m = line.match(/^[\s│├└─]*(\S+)@(?:npm|file|link|workspace|patch):/);
    if (m) names.push(m[1]);
  }
  return names;
}

function runYarnInstall() {
  const install = runCapture('corepack', ['yarn', 'install'], projectDir);
  console.log(install.output);
  if (install.status !== 0) {
    return { fatal: true, message: 'FATAL: yarn install failed:\n' + install.output };
  }

  const explain = runCapture('corepack', ['yarn', 'explain', 'peer-requirements'], projectDir);
  console.log(explain.output);

  const failingHashes = extractFailingYarnHashes(explain.output);
  const blocking = [];
  const upstream = [];
  for (const hash of failingHashes) {
    const detail = runCapture('corepack', ['yarn', 'explain', 'peer-requirements', hash], projectDir).output;
    const names = namesFromYarnDetail(detail).filter((n) => n.startsWith('@nestjs-crud/'));
    if (names.length > 0) {
      blocking.push({ hash, detail, names });
    } else {
      upstream.push({ hash, detail });
    }
  }

  if (blocking.length > 0) {
    let message =
      'FATAL: yarn peer-requirements failed — an unmet peer names an @nestjs-crud package as a requester:\n';
    for (const b of blocking) message += `\n[${b.hash}] requesters: ${b.names.join(', ')}\n${b.detail}\n`;
    return { fatal: true, message };
  }

  if (upstream.length > 0) {
    console.log(`NOTE: ${upstream.length} upstream-only yarn peer warning(s) logged, not fatal.`);
    for (const u of upstream) console.log(u.detail);
  }
  return { fatal: false };
}

// ---------------------------------------------------------------------------
// --expect-ioredis-eresolve — canary for the known npm/typeorm/ioredis
// conflict
// ---------------------------------------------------------------------------

function matchesKnownIoredisSignature(output) {
  const hasIoredis6 = /ioredis@6\.\d+\.\d+/.test(output) || /Found:\s*ioredis@6/.test(output);
  const hasTypeorm = /typeorm@1\.\d+\.\d+/.test(output) || /from typeorm@/.test(output);
  const hasPeerOptionalIoredis = /peerOptional ioredis@/.test(output);
  return hasIoredis6 && hasTypeorm && hasPeerOptionalIoredis;
}

function runExpectIoredisEresolveMode() {
  console.log('[mode] --expect-ioredis-eresolve: reproducing the known npm ioredis/typeorm conflict without the pin\n');
  writeConsumerManifest(buildLegacyConsumer({ includeIoredisPin: false }));

  const install = runCapture('npm', ['install', '--no-package-lock'], projectDir);
  console.log(install.output);

  const signatureMatched = matchesKnownIoredisSignature(install.output);

  if (install.status !== 0 && signatureMatched) {
    const matchedLines = install.output.split('\n').filter((l) => /ioredis@6|typeorm@1|peerOptional ioredis/.test(l));
    console.log('\nResult: PASS (canary) — the known npm ERESOLVE conflict still reproduces.');
    console.log('Matched signature lines:\n' + matchedLines.join('\n'));
    process.exit(0);
  }

  if (install.status === 0) {
    console.error('\nFATAL: the known npm ioredis/typeorm ERESOLVE conflict no longer reproduces.');
    console.error('The install succeeded without the ioredis pin. Remove the pin and its documentation from:');
    for (const loc of IOREDIS_DOC_LOCATIONS) console.error('  - ' + loc);
    process.exit(2);
  }

  console.error('\nFATAL: npm install failed, but not with the known ioredis/typeorm ERESOLVE signature.');
  console.error('This is a different failure — investigate before assuming the canary target changed.');
  process.exit(2);
}

if (EXPECT_IOREDIS_ERESOLVE) {
  runExpectIoredisEresolveMode();
}

// ---------------------------------------------------------------------------
// Dispatch: build the consumer for the chosen mode/manager, then install
// ---------------------------------------------------------------------------

if (STRICT_PEERS) {
  const consumerPkg = buildStrictConsumer(PM);
  writeConsumerManifest(consumerPkg);
  if (PM === 'pnpm') writePnpmWorkspaceYaml();
  if (PM === 'yarn') writeYarnProjectFiles();
} else {
  writeConsumerManifest(buildLegacyConsumer({ includeIoredisPin: true }));
}

console.log(
  `\n[3/4] Running ${PM} install${STRICT_PEERS ? ' (strict peers)' : ''} in temp project (outside monorepo)...`,
);
console.log(`  cwd: ${projectDir}`);

let installResult;
if (PM === 'yarn') {
  installResult = runYarnInstall();
} else if (PM === 'pnpm') {
  installResult = runPnpmInstall();
} else {
  installResult = runNpmInstall();
}

if (installResult.fatal) {
  console.error('\n' + installResult.message);
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Step 4 — resolution checks via child Node process in the temp project
// ---------------------------------------------------------------------------

console.log('\n[4/4] Checking specifier resolution via real Node resolution...\n');

const checkLines = ALL_CHECKS.map(
  (spec) =>
    `try { require.resolve(${JSON.stringify(spec)}); console.log('PASS: ${spec}'); } catch(e) { console.error('FAIL: ${spec} ->', e.message.split('\\n')[0]); failed++; }`,
);

const childScript = ["'use strict';", 'let failed = 0;', ...checkLines, 'process.exit(failed > 0 ? 1 : 0);'].join('\n');

const checkScriptPath = path.join(projectDir, 'smoke-check.js');
fs.writeFileSync(checkScriptPath, childScript);

let exitCode = 0;
try {
  execSync(`node smoke-check.js`, {
    cwd: projectDir,
    stdio: 'inherit',
  });
} catch (err) {
  exitCode = err.status || 1;
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log('\n=== smoke:pack complete ===');
if (exitCode !== 0) {
  console.error(`\nResult: FAIL (exit ${exitCode}) — one or more specifiers did not resolve`);
} else {
  console.log('\nResult: PASS — all specifiers resolved');
}

process.exit(exitCode);
