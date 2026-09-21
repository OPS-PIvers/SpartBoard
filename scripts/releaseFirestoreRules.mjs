#!/usr/bin/env node
/**
 * Compile, upload and release firestore.rules against the Firebase Rules API.
 *
 * WHY THIS EXISTS: from 2026-09-21T16:42Z the API began answering the release
 * call with
 *   400 {"message":"Request contains an invalid argument","status":"INVALID_ARGUMENT"}
 * naming no field. firebase-tools discards that error (`.catch(() =>
 * createRelease(...))`) and POSTs a new release instead, which fails 409
 * ALREADY_EXISTS because the release is right there. Only the 409 reached the
 * log, so the deploy looked like a harmless race while nothing shipped.
 *
 * Doing the calls here means the real status is printed. The compile and the
 * ruleset upload both return 200; only the release is refused. Adding
 * `updateMask` did not fix it, so `releaseAttempts` walks the request shapes
 * the API might want and stops at the first it accepts, printing what each
 * rejection said. The deploy workflow runs this in place of
 * `firebase deploy --only firestore:rules`; indexes, storage and functions
 * still go through the CLI.
 *
 * Retire this the day the CLI's own release call works again: drop the script
 * and put `firestore:rules` back in the deploy targets.
 *
 * Usage: node scripts/releaseFirestoreRules.mjs <project-id> [rules-path]
 * Required env: GOOGLE_APPLICATION_CREDENTIALS pointing at a service account
 * JSON file with firebaserules write permission.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { cert } from 'firebase-admin/app';
import { stripRulesComments } from './stripRulesComments.mjs';

const API = 'https://firebaserules.googleapis.com/v1';
const RELEASE_NAME = 'cloud.firestore';
const RULESETS_TO_GC = 10;
const MAX_ATTEMPTS = 4;

/** Issues the compile step reports that must stop the release. */
export function blockingIssues(issues) {
  return (issues ?? []).filter((issue) => issue.severity === 'ERROR');
}

/** A transient API failure, worth another attempt. Mirrors the deploy wrapper. */
export function isTransientStatus(status) {
  return status === 429 || (status >= 500 && status <= 599);
}

function formatIssue(issue) {
  const at = issue.sourcePosition ?? {};
  return `[${issue.severity}] ${at.line ?? '?'}:${at.column ?? '?'} - ${issue.description}`;
}

async function accessToken() {
  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!keyPath) {
    throw new Error('GOOGLE_APPLICATION_CREDENTIALS is not set');
  }
  const credential = cert(JSON.parse(readFileSync(keyPath, 'utf8')));
  const { access_token: token } = await credential.getAccessToken();
  return token;
}

export async function call(
  token,
  method,
  path,
  body,
  { baseDelayMs = 2000, maxAttempts = MAX_ATTEMPTS } = {}
) {
  let backoff = baseDelayMs;
  for (let attempt = 1; ; attempt += 1) {
    const retry = async (reason) => {
      console.warn(
        `${method} ${path} -> ${reason}; retrying in ${backoff / 1000}s ` +
          `(attempt ${attempt}/${maxAttempts})`
      );
      await new Promise((resolve) => setTimeout(resolve, backoff));
      backoff *= 2;
    };

    let response;
    try {
      response = await fetch(`${API}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (error) {
      // ECONNRESET, socket hang up, DNS — a connection that never reaches a
      // status code. The bash wrapper retried these while the CLI owned this
      // call, and this step runs once, outside its retry loop.
      if (attempt >= maxAttempts) {
        throw new Error(`${method} ${path} -> ${error.message}`);
      }
      await retry(error.message);
      continue;
    }

    const text = await response.text();
    if (response.ok) {
      return text ? JSON.parse(text) : {};
    }
    if (isTransientStatus(response.status) && attempt < maxAttempts) {
      await retry(String(response.status));
      continue;
    }
    // The body carries the reason the deploy used to swallow. Print it.
    throw new Error(`${method} ${path} -> ${response.status} ${text}`);
  }
}

/**
 * Free space at the per-project ruleset cap by deleting rulesets no release
 * points at, the way firebase-tools does when creation returns 429. Taking
 * ruleset creation off the CLI would otherwise lose that and strand the
 * project at the cap. One page is plenty: ten deletions is all the CLI does
 * too, and a released ruleset is never a candidate.
 */
async function pruneRulesets(token, projectId) {
  const [{ releases = [] }, { rulesets = [] }] = await Promise.all([
    call(token, 'GET', `/projects/${projectId}/releases`),
    call(token, 'GET', `/projects/${projectId}/rulesets?pageSize=100`),
  ]);
  const released = new Set(releases.map((release) => release.rulesetName));
  const stale = rulesets
    .filter((ruleset) => !released.has(ruleset.name))
    .slice(-RULESETS_TO_GC);
  for (const ruleset of stale) {
    await call(token, 'DELETE', `/${ruleset.name}`);
  }
  console.log(`pruned ${stale.length} unreleased ruleset(s)`);
  return stale.length;
}

/**
 * Request shapes for the release call, tried in order until one is accepted.
 * Run 35657418157 showed the CLI's own shape releasing the live ruleset, so the
 * shape is probably not the fault; the masked variant stays as the one other
 * reading of a bare INVALID_ARGUMENT that names no field.
 */
export function releaseAttempts(projectId, rulesetName) {
  const path = `/projects/${projectId}/releases/${RELEASE_NAME}`;
  const release = {
    name: `projects/${projectId}/releases/${RELEASE_NAME}`,
    rulesetName,
  };
  return [
    { label: 'what the CLI sends', path, body: { release } },
    {
      label: 'mask in body',
      path,
      body: { release, updateMask: 'rulesetName' },
    },
  ];
}

/**
 * Run when every request shape has been refused. Re-pointing the release at the
 * ruleset it already serves is a no-op, so an acceptance there means the new
 * ruleset is what the API refuses rather than the request. A copy of the live
 * ruleset's own source then separates the two remaining readings: rules content
 * the service will not take, or nothing newly created being releasable at all.
 * Only runs on the failure path, so a healthy deploy makes none of these writes.
 */
async function diagnoseRefusal(token, projectId, live, attempted) {
  const path = `/projects/${projectId}/releases/${RELEASE_NAME}`;
  const releaseBody = (rulesetName) => ({
    release: {
      name: `projects/${projectId}/releases/${RELEASE_NAME}`,
      rulesetName,
    },
  });
  if (!live?.rulesetName || live.rulesetName === attempted) return;

  // Read-back proves nothing here, since the release already holds this
  // ruleset. What the probe reads is the status: accepted rather than refused.
  try {
    await call(token, 'PATCH', path, releaseBody(live.rulesetName));
    console.warn(
      'probe: re-releasing the live ruleset was accepted, not refused'
    );
  } catch (error) {
    console.warn(
      `probe: re-releasing the live ruleset failed too: ${error.message}`
    );
    return;
  }

  let copy;
  try {
    const { source } = await call(token, 'GET', `/${live.rulesetName}`);
    copy = await call(token, 'POST', `/projects/${projectId}/rulesets`, {
      source,
    });
  } catch (error) {
    console.warn(`probe: could not copy the live ruleset: ${error.message}`);
    return;
  }
  if (copy.name === live.rulesetName) {
    console.warn(
      'probe: the API returned the live ruleset itself, so the copy proves nothing'
    );
    return;
  }
  // Same rules, new ruleset: releasing it changes nothing a teacher can see.
  // This one is a real state change, so read it back rather than trusting 200.
  try {
    await call(token, 'PATCH', path, releaseBody(copy.name));
  } catch (error) {
    console.warn(
      `probe: a new ruleset holding the live rules was refused too (${error.message}), so the content is not what matters`
    );
    return;
  }
  const applied = await call(token, 'GET', path);
  if (applied.rulesetName === copy.name) {
    console.warn(
      `probe: a new ruleset holding the live rules (${copy.name}) released, so the refusal follows the rules content`
    );
  } else {
    console.warn(
      `probe: the copy was accepted but left the release on ${applied.rulesetName}, so a 200 here means nothing`
    );
  }
}

/** Page through the project's rulesets so the log carries how close the cap is. */
async function countRulesets(token, projectId) {
  let total = 0;
  let pageToken = '';
  for (let page = 0; page < 40; page += 1) {
    const query = `pageSize=100${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
    const { rulesets = [], nextPageToken } = await call(
      token,
      'GET',
      `/projects/${projectId}/rulesets?${query}`
    );
    total += rulesets.length;
    if (!nextPageToken) return total;
    pageToken = nextPageToken;
  }
  return total;
}

async function main() {
  const projectId = process.argv[2];
  if (!projectId) {
    throw new Error(
      'usage: releaseFirestoreRules.mjs <project-id> [rules-path]'
    );
  }
  const rulesPath =
    process.argv[3] ??
    fileURLToPath(new URL('../firestore.rules', import.meta.url));

  // Idempotent: the deploy workflow has usually stripped the file already.
  const content = stripRulesComments(readFileSync(rulesPath, 'utf8'));
  const files = [{ name: 'firestore.rules', content }];
  const token = await accessToken();

  const { issues = [] } = await call(
    token,
    'POST',
    `/projects/${projectId}:test`,
    {
      source: { files },
    }
  );
  for (const issue of issues) {
    console.log(formatIssue(issue));
  }
  const blocking = blockingIssues(issues);
  if (blocking.length) {
    throw new Error(
      `firestore.rules failed to compile:\n${blocking.map(formatIssue).join('\n')}`
    );
  }

  let ruleset;
  try {
    ruleset = await call(token, 'POST', `/projects/${projectId}/rulesets`, {
      source: { files },
    });
  } catch (error) {
    if (!/-> 429 /.test(error.message)) throw error;
    await pruneRulesets(token, projectId);
    ruleset = await call(token, 'POST', `/projects/${projectId}/rulesets`, {
      source: { files },
    });
  }
  console.log(`uploaded ruleset ${ruleset.name}`);

  // Diagnostic only, so a project without this release yet must not stop us.
  let current = {};
  try {
    current = await call(
      token,
      'GET',
      `/projects/${projectId}/releases/${RELEASE_NAME}`
    );
    console.log(`current release: ${JSON.stringify(current)}`);
  } catch (error) {
    console.warn(`could not read the current release: ${error.message}`);
  }

  let release;
  const rejected = [];
  for (const attempt of releaseAttempts(projectId, ruleset.name)) {
    try {
      await call(token, 'PATCH', attempt.path, attempt.body);
    } catch (error) {
      console.warn(`rejected "${attempt.label}": ${error.message}`);
      rejected.push(`${attempt.label}\n  ${error.message}`);
      continue;
    }
    // Some shapes omit fields the API may ignore rather than refuse, so read
    // the release back: a 200 that changed nothing is the silent failure
    // this script exists to end.
    const applied = await call(
      token,
      'GET',
      `/projects/${projectId}/releases/${RELEASE_NAME}`
    );
    if (applied.rulesetName === ruleset.name) {
      console.log(`released via "${attempt.label}"`);
      release = applied;
      break;
    }
    const note = `accepted but left the release on ${applied.rulesetName}`;
    console.warn(`rejected "${attempt.label}": ${note}`);
    rejected.push(`${attempt.label}\n  ${note}`);
  }
  if (!release) {
    // Nothing here may throw: the rejections below are the point of the run.
    try {
      console.warn(
        `the project holds ${await countRulesets(token, projectId)} ruleset(s)`
      );
      await diagnoseRefusal(token, projectId, current, ruleset.name);
    } catch (error) {
      console.warn(`diagnostics failed: ${error.message}`);
    }
    throw new Error(
      `every release request shape was rejected:\n${rejected.join('\n')}`
    );
  }
  console.log(`released ${release.name} -> ${release.rulesetName}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`ERROR: ${error.message}`);
    process.exit(1);
  });
}
