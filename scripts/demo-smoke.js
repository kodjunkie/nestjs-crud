/* eslint-disable @typescript-eslint/no-var-requires */
'use strict';

// ---------------------------------------------------------------------------
// Boots the built typeorm-demo app, calls its list/create/join routes, and
// stops it again. Proves a fresh demo install actually works end to end —
// run identically on a developer machine and in CI. Node's built-in fetch
// and child_process.spawn only; no new dependency.
// ---------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const DEMO_DIR = process.env.DEMO_DIR || 'examples/typeorm-demo';
const BASE_URL = `http://127.0.0.1:${PORT}`;
const BOOT_TIMEOUT_MS = 60000;
const POLL_INTERVAL_MS = 500;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function portAlreadyInUse() {
  try {
    await fetch(`${BASE_URL}/users`);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const mainJsPath = path.join(DEMO_DIR, 'dist', 'main.js');
  if (!fs.existsSync(mainJsPath)) {
    console.error(`FAIL preflight: ${mainJsPath} is missing — build the demo first`);
    process.exitCode = 1;
    return;
  }

  if (await portAlreadyInUse()) {
    console.error(`FAIL preflight: something is already answering on port ${PORT}`);
    process.exitCode = 1;
    return;
  }

  let outputBuffer = '';
  const child = spawn('node', [mainJsPath], {
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => {
    outputBuffer += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    outputBuffer += chunk.toString();
  });

  let childExited = false;
  let childExitCode = null;
  child.on('exit', (code) => {
    childExited = true;
    childExitCode = code;
  });

  let failed = false;

  child.on('error', (err) => {
    console.error('FAIL boot: failed to spawn demo process:', err);
    failed = true;
    childExited = true; // avoid stopApp() waiting on a process that never started
  });

  async function stopApp() {
    if (!childExited) {
      child.kill('SIGTERM');
      const deadline = Date.now() + 10000;
      while (!childExited && Date.now() < deadline) {
        // eslint-disable-next-line no-await-in-loop
        await sleep(200);
      }
      if (!childExited) {
        child.kill('SIGKILL');
      }
    }
  }

  try {
    // Poll GET /users until the app answers, up to BOOT_TIMEOUT_MS, failing
    // early if the app process exits first.
    const deadline = Date.now() + BOOT_TIMEOUT_MS;
    let up = false;
    while (Date.now() < deadline) {
      if (childExited) {
        console.error(`FAIL boot: demo process exited early with code ${childExitCode}`);
        failed = true;
        break;
      }
      try {
        // eslint-disable-next-line no-await-in-loop
        const res = await fetch(`${BASE_URL}/users`);
        if (res.ok || res.status === 404) {
          up = true;
          break;
        }
      } catch {
        // not up yet
      }
      // eslint-disable-next-line no-await-in-loop
      await sleep(POLL_INTERVAL_MS);
    }
    if (!failed && !up) {
      console.error(`FAIL boot: demo did not answer on ${BASE_URL}/users within ${BOOT_TIMEOUT_MS}ms`);
      failed = true;
    }

    // Step: list
    if (!failed) {
      const res = await fetch(`${BASE_URL}/users`);
      const body = await res.json();
      if (res.status !== 200 || !Array.isArray(body) || body.length !== 0) {
        console.error(
          `FAIL list: expected 200 with an empty array, got status ${res.status} body ${JSON.stringify(body)} — point TYPEORM_DATABASE at an empty database`,
        );
        failed = true;
      }
    }

    // Step: create company
    let companyId;
    if (!failed) {
      const res = await fetch(`${BASE_URL}/companies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Acme', domain: 'acme.test', description: 'Demo co' }),
      });
      const body = await res.json();
      if (res.status !== 201 || typeof body.id !== 'number') {
        console.error(`FAIL create company: expected 201 with a numeric id, got status ${res.status} body ${JSON.stringify(body)}`);
        failed = true;
      } else {
        companyId = body.id;
      }
    }

    // Step: create user
    if (!failed) {
      const res = await fetch(`${BASE_URL}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'alice@acme.test', name: 'Alice', companyId }),
      });
      const body = await res.json();
      if (res.status !== 201 || body.companyId !== companyId) {
        console.error(
          `FAIL create user: expected 201 echoing companyId ${companyId}, got status ${res.status} body ${JSON.stringify(body)}`,
        );
        failed = true;
      }
    }

    // Step: join
    if (!failed) {
      const res = await fetch(`${BASE_URL}/users?join=company&limit=10&offset=0`);
      const body = await res.json();
      const company = body && body.data && body.data[0] && body.data[0].company;
      if (
        res.status !== 200 ||
        body.total !== 1 ||
        !company ||
        company.name !== 'Acme' ||
        Object.prototype.hasOwnProperty.call(company, 'description')
      ) {
        console.error(`FAIL join: expected 200 with total 1, data[0].company.name "Acme" and no description, got status ${res.status} body ${JSON.stringify(body)}`);
        failed = true;
      }
    }
  } catch (err) {
    failed = true;
    console.error('FAIL unexpected during steps:', err && err.stack ? err.stack : err);
  } finally {
    await stopApp();
    if (failed) {
      console.error('\n--- demo process output ---');
      console.error(outputBuffer);
    }
  }

  if (failed) {
    process.exitCode = 1;
    return;
  }

  console.log('demo smoke: OK');
}

main().catch((err) => {
  console.error('FAIL unexpected:', err && err.stack ? err.stack : err);
  process.exitCode = 1;
});
