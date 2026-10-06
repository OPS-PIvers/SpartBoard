#!/usr/bin/env node
// Post-deploy smoke test: the release is live, the teacher and student entry pages render, no uncaught errors.
// Usage: node scripts/smoke-test.mjs <base-url> [expected-build-id]
import { chromium } from '@playwright/test';

const [baseUrl, expectedBuildId] = process.argv.slice(2);
if (!baseUrl) {
  console.error('usage: smoke-test.mjs <base-url> [expected-build-id]');
  process.exit(2);
}

const failures = [];
const fail = (msg) => {
  failures.push(msg);
  console.error(`FAIL ${msg}`);
};
const pass = (msg) => console.log(`ok   ${msg}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function checkVersion() {
  if (!expectedBuildId) return;
  let seen = null;
  // The CDN is purged on release, but give stragglers a minute.
  for (let i = 0; i < 12; i++) {
    try {
      const res = await fetch(`${baseUrl}/version.json?t=${Date.now()}`, {
        headers: { 'cache-control': 'no-cache' },
      });
      seen = (await res.json()).buildId;
      if (seen === expectedBuildId) return pass(`version.json buildId ${seen}`);
    } catch (err) {
      seen = String(err);
    }
    await sleep(5000);
  }
  fail(`version.json buildId is ${seen}, expected ${expectedBuildId}`);
}

async function checkPage(browser, path, ready) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('response', (res) => {
    const url = res.url();
    if (
      url.startsWith(baseUrl) &&
      /\.(js|css)$/.test(url) &&
      res.status() >= 400
    ) {
      errors.push(`${res.status()} ${url}`);
    }
  });
  try {
    const res = await page.goto(`${baseUrl}${path}`, {
      waitUntil: 'load',
      timeout: 30000,
    });
    if (!res || res.status() >= 400) {
      fail(`${path} returned ${res?.status()}`);
    } else {
      await ready(page);
      pass(`${path} rendered`);
    }
  } catch (err) {
    fail(`${path} did not render: ${err.message.split('\n')[0]}`);
  }
  for (const e of errors) fail(`${path} error: ${e}`);
  await page.close();
}

const rootHasContent = (page) =>
  page.waitForFunction(
    () => (document.getElementById('root')?.childElementCount ?? 0) > 0,
    null,
    {
      timeout: 30000,
    }
  );

await checkVersion();
const browser = await chromium.launch();
try {
  await checkPage(browser, '/', (page) =>
    page
      .getByRole('button', { name: /sign in with google/i })
      .waitFor({ timeout: 30000 })
  );
  await checkPage(browser, '/quiz', rootHasContent);
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(`\nSmoke test failed (${failures.length}).`);
  process.exit(1);
}
console.log('\nSmoke test passed.');
