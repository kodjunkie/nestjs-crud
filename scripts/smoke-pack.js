/* eslint-disable @typescript-eslint/no-var-requires */
'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync } = require('child_process');

// ---------------------------------------------------------------------------
// Configuration — contracts encoded here, not in prose comments
// ---------------------------------------------------------------------------

const REPO_ROOT = path.resolve(__dirname, '..');

const WORKSPACE_PACKAGES = [
  'util',
  'request',
  'core',
  'typeorm',
  'drizzle',
  'mikro-orm',
  'prisma',
];

// Specifiers that MUST resolve from the installed tarballs.
// Root package roots + core subpaths (canonical and workaround paths).
const ROOT_CHECKS = [
  '@nestjs-crud/util',
  '@nestjs-crud/request',
  '@nestjs-crud/core',
  '@nestjs-crud/typeorm',
  '@nestjs-crud/drizzle',
  '@nestjs-crud/mikro-orm',
  '@nestjs-crud/prisma',
];
const SUBPATH_CHECKS = [
  '@nestjs-crud/core/cache',
  '@nestjs-crud/core/cursor',
  '@nestjs-crud/core/query',
  '@nestjs-crud/core/lib/cache',
  '@nestjs-crud/core/lib/cursor',
  '@nestjs-crud/core/lib/query',
];
const ALL_CHECKS = [...ROOT_CHECKS, ...SUBPATH_CHECKS];

// ---------------------------------------------------------------------------
// Temp directory setup — PID-suffixed, always outside the monorepo
// ---------------------------------------------------------------------------

const tmpBase = path.join(os.tmpdir(), `nestjs-crud-smoke-${process.pid}`);
const tarballsDir = path.join(tmpBase, 'tarballs');
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readPkgVersion(pkgDir) {
  return JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8')).version;
}

function scopeToTarball(name, version) {
  // @nestjs-crud/foo-bar@2.2.2 → nestjs-crud-foo-bar-2.2.2.tgz
  return `nestjs-crud-${name}-${version}.tgz`;
}

// ---------------------------------------------------------------------------
// Step 1 — Pack all 7 workspace packages
// ---------------------------------------------------------------------------

fs.mkdirSync(tarballsDir, { recursive: true });
fs.mkdirSync(projectDir, { recursive: true });

console.log('=== nestjs-crud smoke:pack ===\n');
console.log('[1/4] Packing workspace packages...');

const tarballs = {};  // package-name → absolute tarball path

for (const name of WORKSPACE_PACKAGES) {
  const pkgDir = path.join(REPO_ROOT, 'packages', name);
  const version = readPkgVersion(pkgDir);
  const tarballName = scopeToTarball(name, version);
  const tarballPath = path.join(tarballsDir, tarballName);

  console.log(`  npm pack ${name}@${version}`);
  execSync(`npm pack --pack-destination "${tarballsDir}"`, {
    cwd: pkgDir,
    stdio: 'pipe',
  });

  if (!fs.existsSync(tarballPath)) {
    // npm pack may produce a slightly different name; find by glob
    const found = fs.readdirSync(tarballsDir).find(f => f.includes(`-${name}-`) || f.includes(`-${name.replace('/', '-')}-`));
    if (!found) {
      console.error(`FATAL: tarball for ${name} not found in ${tarballsDir}`);
      process.exit(2);
    }
    tarballs[name] = path.join(tarballsDir, found);
  } else {
    tarballs[name] = tarballPath;
  }
}

// ---------------------------------------------------------------------------
// Step 2 — Write temp project package.json with npm overrides
// ---------------------------------------------------------------------------

console.log('\n[2/4] Writing temp project with npm overrides...');

// Read each package's version dynamically
function tFile(name) {
  return `file:${tarballs[name]}`;
}

const tempPkg = {
  name: 'nestjs-crud-smoke',
  version: '1.0.0',
  private: true,
  dependencies: {
    '@nestjs-crud/typeorm': tFile('typeorm'),
    '@nestjs-crud/drizzle': tFile('drizzle'),
    '@nestjs-crud/mikro-orm': tFile('mikro-orm'),
    '@nestjs-crud/prisma': tFile('prisma'),
  },
  overrides: {
    '@nestjs-crud/core': tFile('core'),
    '@nestjs-crud/request': tFile('request'),
    '@nestjs-crud/util': tFile('util'),
  },
};

fs.writeFileSync(
  path.join(projectDir, 'package.json'),
  JSON.stringify(tempPkg, null, 2),
);

// ---------------------------------------------------------------------------
// Step 3 — npm install in temp project (outside monorepo)
// ---------------------------------------------------------------------------

console.log('\n[3/4] Running npm install in temp project (outside monorepo)...');
console.log(`  cwd: ${projectDir}`);

try {
  execSync('npm install --no-package-lock', {
    cwd: projectDir,
    stdio: 'inherit',
  });
} catch (err) {
  console.error('\nFATAL: npm install failed:', err.message);
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Step 4 — Resolution checks via child Node process in the temp project
// ---------------------------------------------------------------------------

console.log('\n[4/4] Checking specifier resolution via real Node resolution...\n');

const checkScript = ALL_CHECKS.map(spec =>
  `try { require.resolve(${JSON.stringify(spec)}); console.log('PASS: ${spec}'); } catch(e) { console.error('FAIL: ${spec} ->', e.message.split('\\n')[0]); failed++; }`
).join('\n');

const childScript = `
let failed = 0;
${checkScript}
process.exit(failed > 0 ? 1 : 0);
`;

let exitCode = 0;
try {
  execSync(`node -e ${JSON.stringify(childScript)}`, {
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
