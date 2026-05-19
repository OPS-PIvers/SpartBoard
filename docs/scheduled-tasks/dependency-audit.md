# Dependency & Security Audit — Scheduled Task Journal

_Audit model: claude-sonnet-4-6_
_Action model: claude-opus-4-6_
_Audit cadence: weekly — Tuesday_
_Last audited: 2026-05-19_
_Last action: 2026-05-12_

---

## In Progress

_Nothing currently in progress._

---

## Open

### HIGH `lodash-es@4.17.23` code injection via `@imgly/background-removal` — in production dep chain

- **Detected:** 2026-05-19
- **File:** package.json (production dependency `@imgly/background-removal@^1.7.0`)
- **Detail:** HIGH — `lodash-es` <=4.17.23 allows code injection via `_.template` (GHSA-gquv-pc4w-3hgv, same root cause as lodash non-ES build). This is reached via `@imgly/background-removal@1.7.0` which declares `lodash-es@4.17.23` as a direct dependency. `@imgly/background-removal` is a **production** dependency (in `dependencies`, not `devDependencies`) — the code injection vulnerability is present in the production bundle. `pnpm why lodash-es` confirms a single resolution: `lodash-es@4.17.23 <- @imgly/background-removal@1.7.0 <- spart-board (dependencies)`. Note: no lodash-es 4.18.x has been published (lodash-es mirrors lodash 4.x which is in maintenance mode with no planned 4.18 release) — the fix must come from @imgly updating its dependency or from overriding lodash-es at the pnpm level, though the latter may break @imgly's internal usage.
- **Fix:** Check if a newer version of `@imgly/background-removal` (>1.7.0) drops or replaces its lodash-es dependency. If not, add `"lodash-es": ">=4.18.0"` to `pnpm.overrides` as a future-proof gate (it will not resolve until lodash-es 4.18.0 is published). Until then, assess whether the `_.template` code path is reachable in @imgly's actual usage in this app — if the background-removal widget uses only image-processing APIs and not lodash's template function, the exploitability is theoretical.

### MEDIUM `flatted@3.3.3` has unbounded recursion DoS + prototype pollution — via eslint chain

- **Detected:** 2026-05-19
- **File:** package.json (devDependency via `eslint > file-entry-cache > flat-cache > flatted`)
- **Detail:** Two CVEs affect `flatted` <3.4.2:
  - Unbounded recursion DoS via deeply nested circular structures passed to `parse()` — `flatted@3.3.3` is vulnerable (<3.4.0 fix).
  - Prototype pollution via `parse()` — affects `flatted` <=3.4.1, fix >=3.4.2.
    The installed version is `flatted@3.3.3`. This is dev-only (ESLint toolchain, not shipped to users). `pnpm audit` reports both advisories. The dep chain is `eslint@9.39.2 > file-entry-cache@8.0.0 > flat-cache@4.0.1 > flatted@3.3.3`.
- **Fix:** Add `"flatted": ">=3.4.2"` to `pnpm.overrides` in `package.json`. This forces flatted to resolve to >=3.4.2 across the eslint dependency chain. Verify with `pnpm why flatted` after `pnpm install`. Dev/CI tooling only — no production runtime impact.

### MEDIUM `ws@8.19.0` + `ws@8.20.0` uninitialized memory disclosure — via jsdom/vitest

- **Detected:** 2026-05-19
- **File:** package.json (devDependencies via `jsdom@27.4.0` and `vitest@4.0.18`)
- **Detail:** `ws` >=8.0.0 <8.20.1 has an uninitialized memory disclosure vulnerability. Two vulnerable versions are installed:
  - `ws@8.19.0` — via `jsdom@27.4.0` and `vitest@4.0.18 > @vitest/mocker`
  - `ws@8.20.0` — via another dev dep chain
    Both are in the vulnerable range (fix is >=8.20.1). `ws@7.5.10` (via firebase-tools) is NOT in the vulnerable range. Dev-only — not shipped to users.
- **Fix:** Add `"ws": ">=8.20.1"` to `pnpm.overrides` in `package.json`. Alternatively, update `jsdom` and `vitest` to versions that pull in ws@8.20.1+. The `vitest` major version update (4.x → latest) is tracked in the LOW major versions item and would naturally resolve this.

### MEDIUM `yaml@2.8.2` stack overflow via deeply nested input — via dev toolchain

- **Detected:** 2026-05-19
- **File:** package.json (devDependencies via `firebase-tools`, `lint-staged`, `tailwindcss`, `vite`)
- **Detail:** `yaml` >=2.0.0 <2.8.3 has a stack overflow DoS vulnerability. Installed version is `yaml@2.8.2` (fix requires >=2.8.3). Reaches the codebase via multiple dev tool chains: `firebase-tools@15.8.0`, `lint-staged@16.2.7`, `tailwindcss@3.4.19 > postcss-load-config`, and `vite@6.4.2`. All are dev-only.
- **Fix:** Add `"yaml": ">=2.8.3"` to `pnpm.overrides` in `package.json`. This is a safe override since yaml 2.x has a stable API. Verify with `pnpm why yaml` after install. No production impact.

### MEDIUM `hono@4.12.15` has two MODERATE CVEs — patched in >=4.12.18

- **Detected:** 2026-05-12
- **File:** package.json (devDependency + pnpm.overrides)
- **Detail:** Two new moderate CVEs affect `hono` >=4.12.15 <4.12.18 that were not present when hono was upgraded to 4.12.15 (2026-04-28 completed item):
  - **GHSA-qp7p-654g-cw7p** (moderate): CSS Declaration Injection via Style Object Values in JSX SSR — unsafe CSS values can leak from attacker-controlled object properties when using `hono/jsx` SSR with style objects.
  - **GHSA-p77w-8qqv-26rm** (moderate): Cache Middleware ignores `Vary: Authorization` / `Vary: Cookie` headers, leading to cross-user cache leakage — a cached response for one user can be served to a different user if cache keys don't account for auth headers.
    `pnpm outdated` confirms current is 4.12.15, latest is 4.12.18. The `pnpm.overrides.hono` entry is what pins this across the dep graph.
- **Fix:** In `package.json`, update both `devDependencies.hono` and `pnpm.overrides.hono` from `^4.12.14` → `^4.12.18`, then run `pnpm install`. Verify `pnpm audit` no longer reports hono advisories. Run `pnpm type-check`, `pnpm lint`, and `pnpm test` to confirm no regressions.

### MEDIUM `axios@1.15.0` has multiple CVEs — several require >=1.15.2, full fix in >=1.16.0

- **Detected:** 2026-05-05
- **Updated:** 2026-05-19
- **File:** package.json (direct devDependency), functions/package.json (direct dependency)
- **Detail:** Six CVEs now appear in `pnpm audit` against the current `axios@1.15.0` (root and functions/):
  - **GHSA-vf2m-468p-8v99** (moderate): HTTP adapter streamed responses bypass `maxContentLength`. Patched >=1.15.1.
  - **GHSA-xx6v-rp6x-q39c** (moderate): XSRF Token Cross-Origin Leakage via Prototype Pollution. Patched >=1.15.1.
  - **NO_PROXY bypass** (high): Incomplete fix for CVE-2025-62718 — `NO_PROXY` hostname normalization bypass via SSRF. Patched >=1.15.1.
  - **Prototype Pollution Gadgets - Response** (high): Response object prototype pollution allowing manipulation of subsequent requests. Patched >=1.15.1.
  - **Header Injection via Prototype Pollution** (high): Header values can be injected via prototype-polluted objects. Patched >=1.15.1.
  - **Prototype pollution read-side gadgets** (high): Read-side prototype pollution in response parsing. Patched **>=1.15.2**.
    The last CVE requires >=1.15.2 — upgrading to 1.15.1 would not be sufficient. `pnpm outdated` shows latest is `1.16.0`.
- **Fix:** `pnpm up axios@^1.16.0` in root and `pnpm -C functions up axios@^1.16.0` in functions/. All 6 CVEs are patched in `>=1.15.2`; upgrading to `1.16.0` (latest) addresses all. Verify `pnpm type-check`, `pnpm lint`, and `pnpm test` pass after upgrade.

### MEDIUM `firebase-tools` brings in multiple vulnerable transitive deps

- **Detected:** 2026-04-14
- **Updated:** 2026-05-19
- **File:** package.json (devDependency `firebase-tools`)
- **Detail:** firebase-tools pulls in several vulnerable transitive packages:
  - `basic-ftp` <5.2.0: CRITICAL path traversal in `downloadToDir()` (via proxy-agent). Additional: incomplete CRLF injection protection (<=5.2.1), DoS (<=5.2.2), malicious FTP server RCE (<=5.3.0) — needs >=5.3.1.
  - `tar` (via superstatic > re2 > node-gyp): The `pnpm.overrides` entry `"tar": "^7.5.4"` resolves to `tar@7.5.6`. Four HIGH CVEs are now published requiring progressively higher versions: path traversal via hardlink (<7.5.7), file read/write via hardlink target escape (<7.5.8), hardlink path traversal via drive-relative (<=7.5.9, fix >=7.5.10), and symlink path traversal via drive-relative (<=7.5.10, fix **>=7.5.11**). The current override resolves to 7.5.6 — insufficient. The override must be updated to `"tar": ">=7.5.11"`.
  - `minimatch` (multiple versions): HIGH ReDoS via repeated wildcards and extglobs.
  - `@isaacs/brace-expansion` <=5.0.0: HIGH uncontrolled resource consumption.
    All via firebase-tools devDependency chain. These do not affect production runtime.
    Current: 15.8.0, Latest: 15.17.0 — updating may resolve several transitively.
- **Fix:** (1) Update `pnpm.overrides.tar` from `"^7.5.4"` to `">=7.5.11"` to address all four tar CVEs. (2) `pnpm up firebase-tools@^15.17.0` in dev dependencies and check that firebase deploy commands still work.

### MEDIUM `firebase-admin` (root + functions) brings in `fast-xml-parser` and `node-forge` CVEs

- **Detected:** 2026-04-14
- **File:** package.json (firebase, firebase-admin transitive), functions/package.json (firebase-admin@13.6.0)
- **Detail:**
  - `fast-xml-parser` via `firebase-admin > @google-cloud/storage`:
    - **CRITICAL** entity encoding bypass via regex injection in DOCTYPE entity names (>=4.1.3 <4.5.4)
    - **HIGH** DoS through entity expansion
    - **HIGH** numeric entity expansion
  - `node-forge` via `firebase-admin` (functions only):
    - **HIGH** basicConstraints bypass (<=1.3.3)
    - **HIGH** signature forgery in Ed25519 (<1.4.0)
    - **HIGH** DoS via Infinite Loop (<1.4.0)
    - **HIGH** RSA-PKCS signature forgery (<1.4.0)
      Root: firebase-admin is a transitive dep of the `firebase` SDK. Functions: firebase-admin@13.6.0 direct, latest 13.9.0. `firebase` root: 12.8.0, latest 12.13.0. (Updated: firebase-admin latest moved from 13.8.0 → 13.9.0; firebase latest moved from 12.12.0 → 12.13.0 as of 2026-05-12.)
- **Fix:** Update `firebase` in root to latest (12.13.0) and `firebase-admin` in functions/ to 13.9.0. Check if newer versions pin fixed transitive versions. May not fully resolve if firebase-admin itself hasn't updated @google-cloud/storage.

### MEDIUM `@modelcontextprotocol/sdk` cross-client data leak (still resolves to 1.25.2 after `@google/genai` upgrade)

- **Detected:** 2026-04-14
- **Updated:** 2026-04-30
- **File:** package.json (transitive via `@google/genai` and `firebase-tools`)
- **Detail:** HIGH severity — `@modelcontextprotocol/sdk` >=1.10.0 <=1.25.3 has a cross-client data leak vulnerability. As of 2026-04-30, `@google/genai` was upgraded to 1.51.0 (root + functions) but `pnpm why @modelcontextprotocol/sdk` shows it still resolves to 1.25.2 — the new `@google/genai` does not yet pin a post-1.25.3 MCP SDK. Also pulled in by `firebase-tools@15.8.0`.
- **Fix:** Watch upstream `@google/genai` releases for an MCP SDK >=1.25.4 bump, or apply a `pnpm.overrides` entry: `"@modelcontextprotocol/sdk": ">=1.25.4"`, after verifying neither consumer breaks. May also be resolved by the pending `firebase-tools` upgrade in the separate Open item below.

### MEDIUM Functions: `lodash` code injection via `firebase-functions-test`

- **Detected:** 2026-04-14
- **File:** functions/package.json (devDependency `firebase-functions-test`)
- **Detail:** HIGH — lodash >=4.0.0 <=4.17.23 vulnerable to code injection via `_.template`. This comes via `firebase-functions-test > lodash`. Only in test infrastructure, not production runtime.
- **Fix:** Update `firebase-functions-test` from 3.4.1 to latest — check if newer version depends on a patched lodash. This is a test-only devDependency.

### LOW Major version updates available — require planned migration

- **Detected:** 2026-04-14
- **Updated:** 2026-05-19
- **File:** package.json
- **Detail:** Several packages have major version releases available that require migration planning (breaking changes):
  - `tailwindcss`: 3.4.19 → **4.3.0** (major — config format changed completely)
  - `vite`: 6.4.2 → **8.0.13** (2 majors ahead; focus on patching within v6 first)
  - `eslint`: 9.39.2 → **10.4.0** (major — verify flat config compatibility)
  - `@eslint/js`: 9.39.2 → **10.0.1** (paired with eslint)
  - `typescript`: 5.9.3 → **6.0.3** (major — strict mode changes)
  - `i18next`: 25.8.13 → **26.2.0** (major — API changes)
  - `react-i18next`: 16.5.4 → **17.0.8** (paired with i18next)
  - `lucide-react`: 0.563.0 → **1.16.0** (first stable major — icon API changes possible)
  - `@vitejs/plugin-react`: 5.1.2 → **6.0.2** (major)
  - `@types/node`: 24.12.2 → **25.9.0** (major — verify Node 24 compat)
  - `jsdom`: 27.4.0 → **29.1.1** (2 majors ahead — test environment only; also resolves ws CVE)
  - `lint-staged`: 16.2.7 → **17.0.5** (major — check husky integration compatibility)
  - `@google/genai`: 1.51.0 → **2.4.0** (major — AI API surface may have breaking changes; test all generation flows after upgrade)
    Also notable patch/minor updates: `react`/`react-dom` 19.2.4 → 19.2.6, `firebase-tools` 15.8.0 → 15.17.0, `firebase` 12.8.0 → 12.13.0, `firebase-admin` 13.6.0 → 13.10.0, `@playwright/test` 1.58.0 → 1.60.0, `@typescript-eslint/*` 8.54.0 → 8.59.3, `vitest`/`@vitest/coverage-v8` 4.0.18 → 4.1.6.
    These should not be done in a single commit — each needs its own migration PR with testing.
- **Fix:** Prioritize security patches first. Schedule tailwindcss 4 migration separately (config rewrite required). typescript 6 migration after ensuring all types are clean. Coordinate eslint 9→10 with typescript-eslint team compatibility matrix. `@google/genai` major bump warrants dedicated testing of all AI generation flows (quiz, mini-app, widget builder, OCR, etc.). jsdom update to v29 also resolves the ws CVE tracked separately.

---

## Completed

### HIGH `protobufjs` CRITICAL arbitrary code execution via `firebase-functions` path

- **Detected:** 2026-05-05
- **Completed:** 2026-05-12
- **File:** package.json (devDependency `firebase-functions` + `pnpm.overrides.protobufjs`), functions/package.json (dependency `firebase-functions` + `pnpm.overrides.protobufjs`)
- **Detail:** GHSA-xq3m-2v4x-88gg (CRITICAL): `protobufjs <7.5.5` allows arbitrary code execution. The 2026-04-30 fix resolved the `@google/genai > protobufjs` path, but a separate `protobufjs@7.5.4` resolution survived via the `firebase-functions@7.0.5 (root) / 7.2.3 (functions) > @google-cloud/firestore / @grpc/proto-loader > protobufjs` chains. Both root and functions/ `pnpm audit` reported the advisory.
- **Resolution:** Upgraded `firebase-functions` from `^7.0.5` → `^7.2.5` in root (devDependency) and from `^7.2.3` → `^7.2.5` in functions/ (dependency). Because `firebase-functions@7.2.5` declares `protobufjs: ^7.2.2` (a broad range that still permits the vulnerable 7.5.4), added a `pnpm.overrides` entry `"protobufjs": "^7.5.6"` to both root `package.json` and functions/ `package.json` to pin all transitive resolutions. After `pnpm install` + `pnpm -C functions install`, `pnpm why protobufjs` now reports a single `protobufjs@7.5.6` in both workspaces (`Found 1 version of protobufjs`). `pnpm audit --json` filtered for protobufjs returns empty in both root and functions/. Verified clean: `pnpm type-check` (root + functions) 0 errors; `pnpm lint --max-warnings 0` 0 errors/warnings; `pnpm format:check` clean; `pnpm test` 2301/2301 across 221 files; `pnpm -C functions test` 209/209 across 11 files; `pnpm build` (~43s) and `pnpm -C functions build` both succeed.

### HIGH `protobufjs <7.5.5` — CRITICAL arbitrary code execution via `@google/genai`

- **Detected:** 2026-04-28
- **Completed:** 2026-04-30
- **File:** package.json (transitive via `@google/genai > protobufjs`), functions/package.json (same path)
- **Detail:** GHSA-xq3m-2v4x-88gg (critical): `protobufjs` versions <7.5.5 allow arbitrary code execution via a maliciously crafted protobuf message. Affected both root (`@google/genai: 1.39.0`) and functions/ (`@google/genai: 1.38.0`).
- **Resolution:** Ran `pnpm up "@google/genai@^1.50.1"` (root) and `pnpm -C functions up "@google/genai@^1.50.1"` (functions). Both bumped to `@google/genai@1.51.0`. `pnpm why protobufjs` confirms `@google/genai@1.51.0` now resolves to `protobufjs@7.5.6` (patched) on both sides — the vulnerable `protobufjs@7.5.4` no longer comes via `@google/genai`. A separate `protobufjs@7.5.4` resolution still exists via `firebase-functions@7.0.5 / @google-cloud/firestore` chains (untouched by this fix; not in the @google/genai path the journal targeted). The bundled `@modelcontextprotocol/sdk` did **not** advance past 1.25.2 with this upgrade — that MEDIUM entry has been updated and remains Open. Verified clean: `pnpm type-check` (root + functions) 0 errors; `pnpm lint --max-warnings 0` 0 errors/warnings; `pnpm format:check` clean; `pnpm test` 1672/1672 pass across 175 files; `pnpm build` (21.4s) and `pnpm -C functions build` both succeed.

### MEDIUM `dompurify` multiple XSS/sanitization CVEs — resolved via direct production dependency

- **Detected:** 2026-04-21
- **Completed:** 2026-05-19
- **File:** package.json
- **Detail:** Three CVEs (GHSA-39q2-94rc-95cp, GHSA-crv5-9vww-q3g8, GHSA-v9jr-rg53-9pgp) affected dompurify <=3.3.3 transitive via `@monaco-editor/react > monaco-editor > dompurify`. The open item recommended either `pnpm up @monaco-editor/react@latest` or adding `pnpm.overrides "dompurify": ">=3.4.0"`.
- **Resolution:** Resolved outside journal workflow. `dompurify@^3.4.2` is now declared as a direct production dependency in `package.json` (in `dependencies`, not `devDependencies`). The installed version is `dompurify@3.4.2` which is past the vulnerable range (all three CVEs patched in >=3.4.0, >=3.3.2 for the ADD_ATTR issue). `pnpm audit` no longer reports any dompurify advisories. The 2026-05-19 `pnpm audit` run confirms clean for this package.

### HIGH `hono` has authorization bypass, arbitrary file access, and HTML injection vulnerabilities

- **Detected:** 2026-04-14
- **Completed:** 2026-04-28
- **File:** package.json (`devDependencies.hono` and `pnpm.overrides.hono`)
- **Detail:** Three CVEs affected hono <4.12.14:
  - `@hono/node-server` authorization bypass for certain request patterns.
  - Hono arbitrary file access via path traversal in static file serving.
  - GHSA-458j-xx4x-4375 (moderate): Hono improperly handles JSX attribute names, allowing HTML injection in `hono/jsx` SSR — patched in >=4.12.14.
- **Resolution:** Bumped both `devDependencies.hono` and the `pnpm.overrides.hono` entry from `^4.11.4` → `^4.12.14` and ran `pnpm install`. The override forces a single hono version across the dep graph; without bumping it the lockfile would have stayed pinned at 4.11.4. Hono now resolves to 4.12.15 (`pnpm why hono` shows a single version, transitively used by `@hono/node-server`, `@modelcontextprotocol/sdk`, `@google/genai`, and `firebase-tools`). No direct hono imports exist in the project source — `grep "from 'hono"` returned zero matches — so no static file serving routes needed review. Verified clean: `pnpm type-check` (0 errors), `pnpm lint --max-warnings 0` (0 errors/warnings), `pnpm format:check` (clean), `pnpm build` (16.7s, successful), `pnpm test` (1511 tests pass across 161 files).

### HIGH `vite` dev server has HIGH arbitrary file read vulnerability

- **Detected:** 2026-04-14
- **Completed:** 2026-04-21
- **File:** package.json
- **Detail:** HIGH vulnerability in the Vite dev server allows arbitrary file reads via path traversal. Rollup (transitive dep of Vite) also had a HIGH path traversal issue in versions <4.59.0.
- **Resolution:** Ran `pnpm up vite` which upgraded `vite` from 6.4.1 → 6.4.2 (semver-compatible within ^6.x range). `pnpm up vite` did not pull in a newer rollup on its own, so added `"rollup": "^4.59.0"` to the existing `pnpm.overrides` block in `package.json`. After reinstall, rollup resolved to 4.60.2. Verified both advisories cleared in `pnpm audit`. `pnpm type-check`, `pnpm -C functions type-check`, `pnpm lint --max-warnings 0`, `pnpm format:check`, `pnpm build` (23.5s, successful), and `pnpm test` (all 1367 unit tests pass across 150 files) all clean.

### HIGH `axios` direct dependency has CRITICAL CVEs — upgrade to >=1.15.0

- **Detected:** 2026-04-14
- **Completed:** 2026-04-14
- **File:** package.json, functions/package.json
- **Detail:** Three CVEs affected axios <1.15.0:
  - **CRITICAL** GHSA-jr5f-v2jv-69x6: NO_PROXY hostname normalization bypass
  - **CRITICAL** GHSA-wf5p-g6vw-rhxx: Unrestricted Cloud Metadata Exfiltration via SSRF
  - **HIGH** DoS via `__proto__` pollution in response headers
- **Resolution:** Ran `pnpm up axios@^1.15.0` in both root and `functions/`. Both now resolve to `axios@1.15.0`. Verified:
  - `pnpm run type-check` (root) — clean
  - `pnpm -C functions run type-check` — clean
  - `pnpm run lint` — 0 errors, 0 warnings
  - `pnpm run format:check` — clean
  - `pnpm run test` — all 1094 unit tests pass
  - `pnpm run build` — production build succeeds
  - `pnpm -C functions run build` — functions TypeScript compile succeeds
  - Functions tests involving axios mocks pass (sanitize/embeddability/classlink). Five pre-existing adminAnalytics test failures are unrelated to axios (confirmed by stash/compare). Only functions/ uses axios directly (root axios is devDep not imported).
