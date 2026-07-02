# Dependency & Security Audit — Scheduled Task Journal

_Audit model: claude-sonnet-4-6_
_Action model: claude-opus-4-6_
_Audit cadence: weekly — Tuesday_
_Last audited: 2026-06-30_
_Last action: 2026-06-16_

---

## In Progress

_Nothing currently in progress._

---

## Open

_2026-06-30 (action): Fixed MEDIUM `dompurify` `ALLOWED_ATTR` pollution bypass (GHSA-cmwh-pvxp-8882). Bumped the direct production dependency `^3.4.2` → `^3.4.11` in `package.json` and added `"dompurify": "^3.4.11"` to `pnpm.overrides` (initially `">=3.4.11"`, tightened to `^3.4.11` in a follow-up commit per PR review — caps the transitive monaco bump below a hypothetical 4.x while resolving identically today). The override is required: before the fix, `pnpm why dompurify` showed two resolutions — `dompurify@3.4.2` (direct) and `dompurify@3.2.7` (transitive via `@monaco-editor/react > monaco-editor`, which pins dompurify to exactly `3.2.7`), so a top-level bump alone would not have lifted the transitive path. After `pnpm install`, `pnpm why dompurify` reports a single `dompurify@3.4.11` across both paths and `pnpm audit | grep -i 'dompurify|cmwh-pvxp'` returns 0. File-recency check passed: `package.json` last touched at 0164e761 (position 50 in branch history) — well outside the last 5 branch commits. `pnpm install --frozen-lockfile` passes against the dev-paul base. Verified clean: `prettier --check package.json` (clean), `pnpm type-check` (0 errors), `eslint utils/security.ts utils/notebookSvgEdit.ts` (0 warnings), `vitest run utils/security.test.ts` (15/15) + `vitest run utils/notebookSvgEdit.test.ts` (12/12). No code change required (usage passes config inline to `DOMPurify.sanitize()`, not `setConfig()`; sanitize API unchanged across 3.x). Moved item to Completed. PR opened against dev-paul: #2120 (branch `deps/dompurify-3.4.11`, rebased directly on dev-paul so the diff is exactly `package.json` + `pnpm-lock.yaml` — the code change does NOT carry this journal update; the journal record lives here on scheduled-tasks). Remaining MEDIUM items (ts-deepmerge, flatted, ws, yaml, hono, axios, firebase-tools, firebase-admin, MCP SDK, lodash) and the LOW items all still active._

_2026-06-30: pnpm audit (root): 142 vulnerabilities (12 low | 66 moderate | 62 high | 2 critical) — unchanged count from 2026-06-23. pnpm audit (functions): 58 vulnerabilities (4 low | 23 moderate | 30 high | 1 critical) — unchanged. Root critical: (1) basic-ftp path traversal via firebase-tools>proxy-agent>pac-proxy-agent>get-uri>basic-ftp; (2) fast-xml-parser entity encoding bypass via firebase-admin>@google-cloud/storage — same as prior runs. Functions critical: fast-xml-parser entity encoding bypass same path. pnpm outdated version drift vs 2026-06-23 snapshot: `@google/genai` (root+functions) latest moved 2.9.0→2.10.0; `firebase-admin` (functions) latest moved 14.0.0→14.1.0; `eslint` latest moved 10.5.0→10.6.0; `@vitejs/plugin-react` latest moved 6.0.2→6.0.3; `recharts` 3.8.1→3.9.0 (new minor); `@playwright/test` latest moved 1.61.0→1.61.1; `@types/node` (dev) 24.12.2→26.0.1 — now 2 major versions behind installed; `google-auth-library` (functions) 10.5.0→10.9.0; `@google-cloud/functions-framework` (functions) 5.0.0→5.0.2 (minor). New observation: `@types/tesseract.js@2.0.0` is deprecated per pnpm outdated output (shows "Deprecated" in Latest column) — logged as new LOW item. Updated LOW major-versions item with current versions. All existing open items (dompurify, ts-deepmerge, flatted, ws, yaml, hono, axios, firebase-tools, firebase-admin, MCP SDK, lodash) still active._

_2026-06-23: pnpm audit (root): 142 vulnerabilities (12 low | 66 moderate | 62 high | 2 critical). pnpm audit (functions): 58 vulnerabilities (4 low | 23 moderate | 30 high | 1 critical). Root count increased by 7 from 2026-06-16 (135 → 142). Functions count decreased by 1 (qs fix from 2026-06-16 still holding at 59 → 58 after merge). Two new items detected: (a) dompurify 3.4.2 → needs >=3.4.11 (GHSA-cmwh-pvxp-8882, MEDIUM, production dependency); (b) ts-deepmerge DoS in functions via firebase-functions-test (GHSA-87mf-gv2c-c62c, MODERATE, test-only). Updated LOW major-versions item with current latest versions from `pnpm outdated`: hono 4.12.15 → 4.12.27, dompurify 3.4.2 → 3.4.11, firebase 12.8.0 → 12.15.0, react/react-dom 19.2.4 → 19.2.7, @google/genai (root+functions) 1.51.0 → 2.9.0, firebase-admin (functions) 13.6.0 → 14.0.0, jose (functions) 4.15.9 → 6.2.3, typescript (functions) 5.9.3 → 6.0.3, @vitejs/plugin-react 5.1.2 → 6.0.2, eslint 9.39.2 → 10.5.0, axios (root) 1.15.0 → 1.18.1. Existing open items (flatted, ws, yaml, hono, axios, firebase-tools, firebase-admin, MCP SDK, lodash, major-versions) all still active._

_2026-06-16 (action): Fixed MEDIUM `qs` DoS in functions (GHSA-q8mj-m7cp-5q26). Added `"qs": ">=6.15.2"` to `functions/package.json` `pnpm.overrides` (option (b) — the deterministic fix). Before: `pnpm -C functions why qs` showed two vulnerable resolutions (qs@6.14.2 via `@google-cloud/functions-framework>body-parser>qs` and qs@6.15.0 via `@google-cloud/functions-framework>express>qs`, both in the vulnerable range >=6.11.1 <=6.15.1). After `pnpm -C functions install`: `pnpm -C functions why qs` reports a single `qs@6.15.2`, and `pnpm -C functions audit` no longer reports GHSA-q8mj-m7cp-5q26 (grep count 0). File-recency check passed: `functions/package.json` last touched at 316d3062 (#1973) — outside the last 5 branch commits. Verified clean: `prettier --check functions/package.json` (clean), `pnpm -C functions type-check` (0 errors), `pnpm -C functions build` (tsc succeeds), `pnpm -C functions test` (29 files / 532 tests all pass). Moved item to Completed. PR opened against dev-paul: #1991 (rebased directly on dev-paul so the diff is just the two functions/ files — the code change does NOT carry this journal update; the journal record lives here on scheduled-tasks). The root-side instance of this advisory (via `@google/genai > @modelcontextprotocol/sdk > express > qs`) remains covered by the separate MEDIUM MCP SDK item. Remaining MEDIUM items (flatted, ws, yaml, hono, axios, firebase-tools, firebase-admin, MCP SDK, lodash) and the LOW major-versions item all still active._

_2026-06-16: pnpm audit (root): 135 vulnerabilities (12 low | 59 moderate | 62 high | 2 critical). pnpm audit (functions): 59 vulnerabilities (4 low | 24 moderate | 30 high | 1 critical). No new vulnerabilities beyond existing tracked items. Status updates: (a) vitest@4.1.8 — CRITICAL GHSA-5xrq-8626-4rwp NOT reported in audit output (resolved — already in Completed from 2026-06-09); (b) firebase-admin latest jumped to 14.0.0 (major) — MEDIUM firebase-admin item updated; (c) firebase-tools latest is now 15.20.0 (up from 15.19.1); (d) vite latest is 8.0.16 (2 majors); (e) hono still at 4.12.15 (both MEDIUM and HIGH open items remain). @modelcontextprotocol/sdk still at 1.25.2. All open items confirmed still active._

### MEDIUM `ts-deepmerge` prototype method override DoS — via `firebase-functions-test` in functions

- **Detected:** 2026-06-23
- **File:** functions/package.json (devDependency via `firebase-functions-test@3.4.1 > ts-deepmerge`)
- **Detail:** **GHSA-87mf-gv2c-c62c** (moderate): "ts-deepmerge: Prototype Method Override leads to DoS." Affects `ts-deepmerge` <8.0.0, patched in >=8.0.0. Installed via `firebase-functions-test@3.4.1` in functions/. `pnpm outdated` (functions) shows `firebase-functions-test` current 3.4.1, latest 3.5.0. Test-only devDependency — no production runtime impact.
- **Fix:** `pnpm -C functions up firebase-functions-test@^3.5.0` and verify the newer version pulls in `ts-deepmerge@>=8.0.0`. If not, add `"ts-deepmerge": ">=8.0.0"` to `pnpm.overrides` in `functions/package.json`. Run `pnpm -C functions test` to confirm test suite still passes.

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
      Root: firebase-admin is a transitive dep of the `firebase` SDK. Functions: firebase-admin@13.6.0 direct, latest **14.0.0** (major version jump). `firebase` root: 12.8.0, latest 12.14.0. (Updated 2026-06-16: firebase-admin latest jumped to 14.0.0 — a major version — from 13.9.0; firebase latest moved to 12.14.0. Note: major version of firebase-admin indicates potential breaking changes; check migration guide before updating.)
- **Fix:** Update `firebase` in root to latest (12.14.0) and `firebase-admin` in functions/ to 14.0.0 (review changelog for breaking changes first). Check if newer versions pin fixed transitive versions of fast-xml-parser and node-forge. May not fully resolve if firebase-admin itself hasn't updated @google-cloud/storage.

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

### LOW `@types/tesseract.js@2.0.0` is deprecated — may become a resolution problem

- **Detected:** 2026-06-30
- **File:** package.json (devDependency `@types/tesseract.js@2.0.0`)
- **Detail:** `pnpm outdated` reports `@types/tesseract.js@2.0.0` as "Deprecated" in the Latest column. Deprecated DefinitelyTyped packages are removed from the registry or superseded by bundled types. `tesseract.js` itself is installed at 7.0.0 — newer versions of tesseract.js may bundle their own types, making the separate `@types/tesseract.js` package redundant. If the DefinitelyTyped package is removed or falls out of sync, `tsc` may produce errors or use stale types.
- **Fix:** Check whether `tesseract.js@7.0.0` bundles its own TypeScript types (inspect `node_modules/tesseract.js/package.json` for `"types"` or `"typings"` fields). If it does, remove `@types/tesseract.js` from `devDependencies` entirely and verify `pnpm type-check` still passes. If it doesn't bundle types, keep `@types/tesseract.js@2.0.0` but add a comment explaining why the deprecated package is retained.

### LOW Major version updates available — require planned migration

- **Detected:** 2026-04-14
- **Updated:** 2026-06-30
- **File:** package.json
- **Detail:** Several packages have major version releases available that require migration planning (breaking changes):
  - `tailwindcss`: 3.4.19 → **4.3.0** (major — config format changed completely)
  - `vite`: 6.4.2 → **8.0.16** (2 majors ahead; focus on patching within v6 first)
  - `eslint`: 9.39.2 → **10.6.0** (major — verify flat config compatibility)
  - `@eslint/js`: 9.39.2 → **10.0.1** (paired with eslint)
  - `typescript`: 5.9.3 → **6.0.3** (major — strict mode changes)
  - `i18next`: 25.8.13 → **26.2.0** (major — API changes)
  - `react-i18next`: 16.5.4 → **17.0.8** (paired with i18next)
  - `lucide-react`: 0.563.0 → **1.18.0** (first stable major — icon API changes possible)
  - `@vitejs/plugin-react`: 5.1.2 → **6.0.3** (major)
  - `@types/node`: 24.12.2 → **26.0.1** (2 major versions behind — verify Node 24 compat; was tracking 25.9.0 previously, latest now at 26.x)
  - `jsdom`: 27.4.0 → **29.1.1** (2 majors ahead — test environment only; also resolves ws CVE)
  - `lint-staged`: 16.2.7 → **17.0.5** (major — check husky integration compatibility)
  - `@google/genai`: 1.51.0 → **2.10.0** (major — AI API surface may have breaking changes; test all generation flows after upgrade)
  - Functions: `jose` 4.15.9 → **6.2.3** (2 major versions behind; jose is a JWT/JWK library used transitively via `firebase-admin`; no direct import in project code confirmed. Major version gap may involve breaking API changes if ever imported directly.)
  - Functions: `firebase-admin` 13.6.0 → **14.1.0** (major version jump; check migration guide for breaking changes before updating)
    Also notable patch/minor updates: `react`/`react-dom` 19.2.4 → **19.2.7**, `firebase-tools` 15.8.0 → **15.22.1+** (check latest), `firebase` 12.8.0 → **12.15.0**, `@playwright/test` 1.58.0 → **1.61.1**, `@typescript-eslint/*` 8.54.0 → **8.62.1**, `vitest` (root) 4.1.8 → **4.1.9**, `hono` 4.12.15 → **4.12.27** (also has active MEDIUM CVE — see separate item), `dompurify` 3.4.2 → **3.4.11** (also has active MEDIUM CVE — see separate item), `postcss` 8.5.6 → **8.5.16**, `prettier` 3.8.1 → **3.9.4**, `eslint-plugin-prettier` 5.5.5 → **5.5.6**, `eslint-plugin-react-hooks` 7.0.1 → **7.1.1**, `globals` 17.2.0 → **17.7.0**, `@firebase/rules-unit-testing` 5.0.0 → 5.0.1, `google-auth-library` (functions) 10.5.0 → **10.9.0**, `lucide-react` 0.563.0 → **1.18.0** (major; first stable), `react-i18next` 16.5.4 → **17.0.8** (major), `@google/genai` (root+functions) 1.51.0 → **2.10.0** (major — all AI generation flows need testing after upgrade), functions `axios` 1.15.0 → **1.18.1**, functions `@google-cloud/functions-framework` 5.0.0 → **5.0.2**, `axios` (root) 1.15.0 → **1.18.1** (also active separate MEDIUM CVE — upgrade resolves), `recharts` 3.8.1 → **3.9.0**. (Updated 2026-06-30)
    These should not be done in a single commit — each needs its own migration PR with testing.
- **Fix:** Prioritize security patches first. Schedule tailwindcss 4 migration separately (config rewrite required). typescript 6 migration after ensuring all types are clean. Coordinate eslint 9→10 with typescript-eslint team compatibility matrix. `@google/genai` major bump warrants dedicated testing of all AI generation flows (quiz, mini-app, widget builder, OCR, etc.). jsdom update to v29 also resolves the ws CVE tracked separately.

---

## Completed

### MEDIUM `dompurify@3.4.2` has `ALLOWED_ATTR` pollution bypass — direct production dependency

- **Detected:** 2026-06-23
- **Completed:** 2026-06-30
- **File:** package.json (direct production dependency + `pnpm.overrides`), pnpm-lock.yaml
- **Detail:** **GHSA-cmwh-pvxp-8882** (moderate): "DOMPurify: Permanent `ALLOWED_ATTR` pollution via `setConfig()` bypassing the hook clone-guard (incomplete fix of the 3.4.7 hook-pollution patch)." Affects `dompurify` <=3.4.10, patched in >=3.4.11. dompurify is a **production dependency** consumed directly by `utils/security.ts` (`sanitizeHtml`/`sanitizeQuizResponse`) and `utils/notebookSvgEdit.ts` (`sanitizePageSvg`). Pre-fix, `pnpm why dompurify` showed two resolutions: `dompurify@3.4.2` (direct) and `dompurify@3.2.7` (transitive via `@monaco-editor/react > monaco-editor`, which pins dompurify to exactly `3.2.7`).
- **Resolution:** Bumped the direct dependency `^3.4.2` → `^3.4.11` and added `"dompurify": "^3.4.11"` to `pnpm.overrides` (the override is required because monaco-editor's exact `3.2.7` pin would otherwise keep the transitive path on the vulnerable version; the override was tightened from `">=3.4.11"` to `^3.4.11` in a follow-up commit per PR review, resolving identically while capping the transitive bump below a future 4.x). After `pnpm install`, `pnpm why dompurify` reports a single resolved version `3.4.11` across both the direct and `@monaco-editor/react` paths, and `pnpm audit | grep dompurify/cmwh-pvxp` returns 0. `pnpm install --frozen-lockfile` passes against the dev-paul base. Verified clean: `prettier --check package.json` (clean), `pnpm type-check` (0 errors), `eslint utils/security.ts utils/notebookSvgEdit.ts` (0 warnings), `vitest run utils/security.test.ts` (15/15 pass), `vitest run utils/notebookSvgEdit.test.ts` (12/12 pass). No code change needed — all usage passes config inline to `DOMPurify.sanitize()` (not `setConfig()`), and the sanitize API is unchanged across the 3.x series. Shipped as PR #2120 against dev-paul (branch `deps/dompurify-3.4.11` rebased directly on dev-paul tip, so the PR diff is exactly `package.json` + `pnpm-lock.yaml`; this journal record lives on scheduled-tasks).

### MEDIUM `qs` DoS in functions via `@google-cloud/functions-framework` — patched in >=6.15.2

- **Detected:** 2026-05-26
- **Completed:** 2026-06-16
- **File:** functions/package.json (`pnpm.overrides`; transitive via `@google-cloud/functions-framework@5.0.0`)
- **Detail:** `qs` >=6.11.1 <=6.15.1 has a remotely triggerable DoS: `qs.stringify` crashes with `TypeError` on `null`/`undefined` entries in comma-format arrays when `encodeValuesOnly` is set (GHSA-q8mj-m7cp-5q26, moderate). In functions/, this reached the codebase via two paths: `@google-cloud/functions-framework@5.0.0 > body-parser > qs` (resolving `qs@6.14.2`) and `@google-cloud/functions-framework@5.0.0 > express > qs` (resolving `qs@6.15.0`) — both in the vulnerable range. The same advisory also appears in root via `@google/genai > @modelcontextprotocol/sdk > express > qs`, which remains covered by the separate MCP SDK Open item.
- **Resolution:** Chose option (b) — added `"qs": ">=6.15.2"` to the `pnpm.overrides` block in `functions/package.json` (deterministic, version-independent of `@google-cloud/functions-framework`). After `pnpm -C functions install`, `pnpm -C functions why qs` reports a single `qs@6.15.2` (patched) and `pnpm -C functions audit` no longer reports GHSA-q8mj-m7cp-5q26 (grep count 0). Verified clean: `prettier --check functions/package.json` (clean), `pnpm -C functions type-check` (0 errors), `pnpm -C functions build` (tsc succeeds), `pnpm -C functions test` (29 files / 532 tests all pass). Shipped as PR #1991 against dev-paul (branch rebased directly on dev-paul tip so the PR diff is exactly the two `functions/` files — `package.json` + `pnpm-lock.yaml`). The override-only approach (vs. bumping `@google-cloud/functions-framework` to 5.0.2) avoids touching the direct dependency's version while guaranteeing the patched qs across all transitive paths.

### HIGH `vitest@4.0.18` (root) — CRITICAL arbitrary file read/execute when UI server is active

- **Detected:** 2026-06-09
- **Completed:** 2026-06-09
- **File:** package.json (direct devDependencies `vitest`, `@vitest/coverage-v8`)
- **Detail:** GHSA-5xrq-8626-4rwp (CRITICAL): "When Vitest UI server is listening, arbitrary file can be read and executed." Root `vitest` was pinned at `4.0.18`, in the vulnerable range `>=4.0.0 <4.1.0`. The UI server is not enabled in CI (no `--ui` flag in `pnpm run test`), but any developer running `vitest --ui` locally on the root package was exposed. Patched in `>=4.1.0`.
- **Resolution:** Bumped both `vitest` and `@vitest/coverage-v8` from `^4.0.18` to `^4.1.8` in root `package.json` (they version-lock together) and ran `pnpm install` — both resolved to `4.1.8`. `pnpm audit` no longer reports GHSA-5xrq-8626-4rwp. Verified clean: `pnpm type-check` (0 errors), `pnpm lint --max-warnings 0` (0 errors/warnings), `pnpm format:check` on package.json (clean), and the full `pnpm test` suite (422 files / 4343 tests, all passing on `vitest@4.1.8`). Note: the separate MEDIUM `ws@8.19.0`/`ws@8.20.0` item is NOT closed by this bump — `vitest@4.1.8 > @vitest/mocker > ws@8.19.0` still resolves the vulnerable `ws`, so that item remains Open with its own override fix.

### HIGH `path-to-regexp` HIGH ReDoS via `firebase-functions@7.2.5 > express` (root)

- **Detected:** 2026-06-02
- **Completed:** 2026-06-02
- **File:** package.json (`pnpm.overrides`)
- **Detail:** `path-to-regexp` had two HIGH advisories reported by root `pnpm audit`: (1) GHSA-37ch-88jc-xwx2 — ReDoS via multiple route parameters in `<0.1.13`, reached via `.>firebase-functions>express>path-to-regexp` (resolved to the vulnerable `0.1.12`); and (2) GHSA-j3q9-mxjg-w52f — DoS via sequential optional groups in `>=8.0.0 <8.4.0`, reached via `.>@google/genai>@modelcontextprotocol/sdk>express>router>path-to-regexp` (resolved to the vulnerable `8.3.0`). Investigation showed `express@4.22.1` declares `path-to-regexp: ~0.1.12` (permits `0.1.13`) and `router@2.2.0` declares `path-to-regexp: ^8.x` (permits `8.4.x`), so both ranges already allow the patched versions — the root lockfile was simply stale. Confirmed by the functions/ workspace, which (with a more recently regenerated lockfile and no path-to-regexp override) already resolved `0.1.13` and `8.4.2` cleanly; `pnpm audit` in functions/ reports no path-to-regexp advisory. A blanket `"path-to-regexp"` override was NOT used because the `0.1.x` line (express@4) and the `8.x` line (express@5/router) have incompatible APIs; pinning all resolutions to one version would break express@4.
- **Resolution:** Added two version-scoped entries to root `package.json` `pnpm.overrides`: `"path-to-regexp@0.1": "^0.1.13"` (pins the express@4 chain to the patched `0.1.13`) and `"path-to-regexp@8": "^8.4.0"` (pins the express@5/router chain to the patched `8.4.2`). The unrelated `1.9.0` resolution (via `superstatic > firebase-tools`, not flagged) is left untouched. After `pnpm install`, `pnpm why path-to-regexp` reports `0.1.13`, `1.9.0`, and `8.4.2`; `pnpm audit | grep -c path-to-regexp` returns 0 (both HIGH advisories cleared). functions/ needed no change. Verified clean: `pnpm type-check` (0 errors), `pnpm lint --max-warnings 0` (0 errors/warnings), `pnpm format:check` (package.json clean), `pnpm build` (succeeded, 31.6s). The `8.x` resolution is downstream of the separate MCP SDK Open item, but clearing it here was a trivial same-package, same-fix side effect of refreshing path-to-regexp, so both HIGH advisories were closed together.

### HIGH `lodash-es@4.17.23` code injection via `@imgly/background-removal` — in production dep chain

- **Detected:** 2026-05-19
- **Completed:** 2026-05-19
- **File:** package.json (`pnpm.overrides`)
- **Detail:** HIGH — `lodash-es` <=4.17.23 was vulnerable to code injection via `_.template` (GHSA-r5fr-rjxr-66jc and GHSA-f23m-r3pf-42rh, both patched in >=4.18.0). Reached via the production dep chain `@imgly/background-removal@1.7.0 > lodash-es@4.17.23`. The 2026-05-19 audit note speculated that no lodash-es 4.18.x had been published, but `npm view lodash-es versions` confirmed 4.18.0 (released ~1 month ago) and 4.18.1 are both available, and `@imgly/background-removal@1.7.0` declares `lodash-es: ^4.17.21` — a range that accepts 4.18.x. A pnpm override is therefore feasible without waiting on upstream @imgly.
- **Resolution:** Added `"lodash-es": "^4.18.1"` to the `pnpm.overrides` block in root `package.json`. After `pnpm install`, `pnpm why lodash-es` confirms a single resolution `lodash-es@4.18.1 <- @imgly/background-removal@1.7.0 <- spart-board (dependencies)`. `pnpm audit --json | grep -c "lodash-es"` returns 0 — both advisories cleared. Verified clean: `pnpm type-check` (0 errors), `pnpm lint --max-warnings 0` (0 errors/warnings), `pnpm format:check` (clean), `pnpm test` (2809 tests across 283 files all pass), `pnpm build` (19.26s, successful — `imgly-bg-removal` chunk still emits at 82.77 kB, confirming @imgly's lodash-es consumers still resolve correctly under the override).

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
