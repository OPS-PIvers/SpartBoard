#!/usr/bin/env node
// Usage (from the repo root):
//   function-delete-check.mjs pre <project> <deploy-only>  fails if the deploy would delete a function some codebase still exports
//   function-delete-check.mjs post <project> <deploy-only> fails if a targeted function's live label differs from functions/codebases.json, or a moved function was recreated
// Env: FUNCTIONS_LIB_INDEX (default functions/lib/index.js), FUNCTIONS_DISCOVERY_CONFIG (FIREBASE_CONFIG for loading it),
// FUNCTION_SNAPSHOT_FILE (pre writes live labels and createTimes, post compares), LIVE_FUNCTIONS_JSON (a saved list response, for tests).

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  DEFAULT_CODEBASE,
  codebaseOf,
  configCodebases,
  parseTarget,
  readManifest,
} from './codebases.mjs';

const CODEBASE_LABEL = 'firebase-functions-codebase';

const fail = (message) => {
  process.stderr.write(`::error::${message}\n`);
  process.exit(1);
};

async function accessToken() {
  const { applicationDefault } = await import('firebase-admin/app');
  const { access_token: token } = await applicationDefault().getAccessToken();
  return token;
}

// Every live function as { id, codebase, managed, createTime }.
async function liveFunctions(project) {
  let functions = [];
  if (process.env.LIVE_FUNCTIONS_JSON) {
    functions =
      JSON.parse(readFileSync(process.env.LIVE_FUNCTIONS_JSON, 'utf-8'))
        .functions ?? [];
  } else {
    const token = await accessToken();
    let pageToken = '';
    do {
      const url = `https://cloudfunctions.googleapis.com/v2/projects/${project}/locations/-/functions?pageSize=1000${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
      let response;
      for (let attempt = 1; ; attempt++) {
        response = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        }).catch((error) => ({ ok: false, status: String(error) }));
        if (
          response.ok ||
          attempt === 4 ||
          (typeof response.status === 'number' &&
            response.status < 500 &&
            response.status !== 429)
        )
          break;
        await new Promise((r) => setTimeout(r, attempt * 5000));
      }
      if (!response.ok)
        fail(
          `could not list live functions in ${project} (${response.status}); not deploying blind.`
        );
      const body = await response.json();
      functions.push(...(body.functions ?? []));
      if ((body.unreachable ?? []).length > 0)
        fail(`function list is missing regions: ${body.unreachable.join(',')}`);
      pageToken = body.nextPageToken ?? '';
    } while (pageToken);
  }
  return functions.map((f) => ({
    id: f.name.split('/').pop(),
    codebase: f.labels?.[CODEBASE_LABEL] || DEFAULT_CODEBASE,
    // The CLI only ever deletes functions it deployed (isFirebaseManaged).
    managed: (f.labels?.['deployment-tool'] ?? '').startsWith('cli-firebase'),
    createTime: f.createTime ?? '',
  }));
}

// codebase -> Set of the Cloud Function names it exports.
function exportsByCodebase(codebases, manifest) {
  if (process.env.FUNCTIONS_DISCOVERY_CONFIG) {
    const config = JSON.parse(process.env.FUNCTIONS_DISCOVERY_CONFIG);
    process.env.FIREBASE_CONFIG = process.env.FUNCTIONS_DISCOVERY_CONFIG;
    process.env.GCLOUD_PROJECT = config.projectId;
  }
  const lib = resolve(
    process.env.FUNCTIONS_LIB_INDEX ?? 'functions/lib/index.js'
  );
  const exported = createRequire(import.meta.url)(lib);
  const names = Object.keys(exported).filter(
    (name) => exported[name]?.__endpoint
  );
  if (names.length === 0) fail(`${lib} exports no Cloud Functions.`);
  for (const [name, codebase] of manifest) {
    if (!codebases.includes(codebase))
      fail(
        `functions/codebases.json puts ${name} in '${codebase}', which firebase.json does not deploy.`
      );
    if (!names.includes(name))
      fail(
        `functions/codebases.json lists ${name}, which is not an exported Cloud Function.`
      );
  }
  const byCodebase = new Map(codebases.map((c) => [c, new Set()]));
  for (const name of names) {
    const codebase = codebaseOf(name, manifest);
    if (!byCodebase.has(codebase))
      fail(
        `${name} belongs to '${codebase}', which firebase.json does not deploy.`
      );
    byCodebase.get(codebase).add(name);
  }
  return byCodebase;
}

// The functions targets as the CLI's filters, plus the codebases they deploy.
function filtersOf(deployOnly, codebases) {
  const filters = deployOnly
    .split(',')
    .filter((t) => t === 'functions' || t.startsWith('functions:'))
    .map((t) => parseTarget(t, codebases));
  const deployed = codebases.filter((c) =>
    filters.some((f) => f.all || f.codebase === c)
  );
  // endpointMatchesAnyFilter: a filter's codebase must equal the endpoint's (live label or deploying codebase).
  const matches = (id, codebase) =>
    filters.some(
      (f) =>
        f.all ||
        (f.codebase === codebase &&
          (!f.name || id === f.name || id.startsWith(`${f.name}-`)))
    );
  return { deployed, matches };
}

// What the CLI would delete: groupEndpointsByCodebase gives a live function to the first deployed codebase
// exporting it, else to its labelled codebase if deployed. createDeploymentPlan then keeps it as live when its
// label matches a filter, and as wanted only when its owner exports it and a filter for the owner matches.
export function plannedDeletes(live, deployOnly, codebases, exports) {
  const { deployed, matches } = filtersOf(deployOnly, codebases);
  return live.filter((fn) => {
    if (!fn.managed) return false;
    const owner =
      deployed.find((c) => exports.get(c).has(fn.id)) ??
      (deployed.includes(fn.codebase) ? fn.codebase : undefined);
    if (!owner) return false;
    const wanted = exports.get(owner).has(fn.id) && matches(fn.id, owner);
    return !wanted && matches(fn.id, fn.codebase);
  });
}

async function pre(project, deployOnly) {
  const codebases = configCodebases();
  const manifest = readManifest();
  const exports = exportsByCodebase(codebases, manifest);
  const live = await liveFunctions(project);
  const snapshot = process.env.FUNCTION_SNAPSHOT_FILE;
  if (snapshot && !existsSync(snapshot)) {
    writeFileSync(
      snapshot,
      JSON.stringify(
        Object.fromEntries(
          live.map((f) => [
            f.id,
            { codebase: f.codebase, createTime: f.createTime },
          ])
        )
      )
    );
  }
  const allExports = new Set(
    [...exports.values()].flatMap((names) => [...names])
  );
  const deletes = plannedDeletes(live, deployOnly, codebases, exports);
  // A delete of an exported name is a function deleted from the codebase it left, deployed without its new owner.
  const moved = deletes.filter((f) => allExports.has(f.id));
  for (const f of deletes.filter((f) => !moved.includes(f))) {
    process.stdout.write(
      `Will delete ${f.id} (codebase ${f.codebase}): no codebase exports it any more.\n`
    );
  }
  if (moved.length > 0) {
    fail(
      `This deploy would delete functions another codebase still exports: ${moved.map((f) => `${f.id} (live in ${f.codebase}, now ${codebaseOf(f.id, manifest)})`).join(', ')}. Deploy every codebase together (full_backend).`
    );
  }
  process.stdout.write(
    `Delete check passed: ${live.length} live functions, ${deletes.length} removals.\n`
  );
}

async function post(project, deployOnly) {
  const codebases = configCodebases();
  const manifest = readManifest();
  const exports = exportsByCodebase(codebases, manifest);
  const live = new Map((await liveFunctions(project)).map((f) => [f.id, f]));
  const snapshotFile = process.env.FUNCTION_SNAPSHOT_FILE;
  const before =
    snapshotFile && existsSync(snapshotFile)
      ? JSON.parse(readFileSync(snapshotFile, 'utf-8'))
      : {};
  // Only functions this deploy targeted must match: drift elsewhere (a preview branch's manifest) is not this run's.
  const { matches } = filtersOf(deployOnly, codebases);
  const problems = [];
  for (const [codebase, names] of exports) {
    for (const name of names) {
      const fn = live.get(name);
      if (!fn) {
        process.stdout.write(`::warning::${name} is exported but not live.\n`);
        continue;
      }
      if (fn.codebase !== codebase && !matches(name, codebase)) {
        process.stdout.write(
          `::warning::${name} is live in '${fn.codebase}' but belongs to '${codebase}'; a deploy of '${codebase}' moves it.\n`
        );
      } else if (fn.codebase !== codebase) {
        problems.push(
          `${name} is live in '${fn.codebase}' but belongs to '${codebase}'`
        );
      }
      const was = before[name];
      if (
        was &&
        was.codebase !== fn.codebase &&
        was.createTime &&
        was.createTime !== fn.createTime
      ) {
        problems.push(
          `${name} moved from '${was.codebase}' to '${fn.codebase}' by being recreated, not updated`
        );
      } else if (was && was.createTime && was.createTime !== fn.createTime) {
        process.stdout.write(
          `::warning::${name} was recreated during this deploy.\n`
        );
      }
    }
  }
  if (problems.length > 0) fail(`Label check failed: ${problems.join('; ')}.`);
  process.stdout.write(
    `Label check passed: every function this deploy targeted is in its functions/codebases.json codebase.\n`
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const [mode, project, deployOnly = ''] = process.argv.slice(2);
  if (!project || !['pre', 'post'].includes(mode)) {
    process.stderr.write(
      'usage: function-delete-check.mjs pre|post <project> <deploy-only>\n'
    );
    process.exit(2);
  }
  try {
    await (mode === 'pre'
      ? pre(project, deployOnly)
      : post(project, deployOnly));
  } catch (error) {
    fail(`function ${mode}-deploy check could not run: ${error.message}`);
  }
  // Loading the functions can leave SDK handles open.
  process.exit(0);
}
