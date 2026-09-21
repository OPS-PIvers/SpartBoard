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
 * The API rejects the wrong shape with a bare INVALID_ARGUMENT naming no field,
 * so trying them is the only way to find the one it wants.
 */
export function releaseAttempts(projectId, rulesetName) {
  const path = `/projects/${projectId}/releases/${RELEASE_NAME}`;
  const release = {
    name: `projects/${projectId}/releases/${RELEASE_NAME}`,
    rulesetName,
  };
  return [
    {
      label: 'mask in body',
      path,
      body: { release, updateMask: 'rulesetName' },
    },
    {
      label: 'mask in body, no resource name',
      path,
      body: { release: { rulesetName }, updateMask: 'rulesetName' },
    },
    {
      label: 'mask in query, path relative to the release',
      path: `${path}?updateMask=rulesetName`,
      body: { release },
    },
    {
      label: 'unwrapped release body, mask in query',
      path: `${path}?updateMask=rulesetName`,
      body: release,
    },
    { label: 'unwrapped release body, no mask', path, body: release },
    { label: 'what the CLI sends', path, body: { release } },
  ];
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

  const current = await call(
    token,
    'GET',
    `/projects/${projectId}/releases/${RELEASE_NAME}`
  );
  console.log(`current release: ${JSON.stringify(current)}`);

  let release;
  const rejected = [];
  for (const attempt of releaseAttempts(projectId, ruleset.name)) {
    try {
      release = await call(token, 'PATCH', attempt.path, attempt.body);
      console.log(`released via "${attempt.label}"`);
      break;
    } catch (error) {
      console.warn(`rejected "${attempt.label}": ${error.message}`);
      rejected.push(`${attempt.label}\n  ${error.message}`);
    }
  }
  if (!release) {
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
