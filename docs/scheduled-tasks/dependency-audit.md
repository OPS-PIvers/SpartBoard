# Dependency & Security Audit — Scheduled Task Journal

_Audit model: claude-sonnet-4-6_
_Action model: claude-opus-4-6_
_Audit cadence: weekly — Tuesday_
_Last audited: 2026-04-28_
_Last action: 2026-04-28_

---

## In Progress

_Nothing currently in progress._

---

## Open

### MEDIUM `firebase-tools` brings in multiple vulnerable transitive deps

- **Detected:** 2026-04-14
- **File:** package.json (devDependency `firebase-tools`)
- **Detail:** firebase-tools pulls in several vulnerable transitive packages:
  - `basic-ftp` <5.2.0: CRITICAL path traversal in `downloadToDir()` (via proxy-agent)
  - `tar` <7.5.7 and <7.5.8: HIGH arbitrary file write (two CVEs) (via superstatic > re2 > node-gyp)
  - `minimatch` (multiple versions): HIGH ReDoS via repeated wildcards and extglobs
  - `@isaacs/brace-expansion` <=5.0.0: HIGH uncontrolled resource consumption
    All via firebase-tools devDependency chain. These do not affect production runtime.
    Current: 15.8.0, Latest: 15.15.0 — updating may resolve several transitively.
- **Fix:** `pnpm up firebase-tools@^15.15.0` in dev dependencies. Check that firebase deploy commands still work after upgrade.

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
      Root: firebase-admin is a transitive dep of the `firebase` SDK. Functions: firebase-admin@13.6.0 direct, latest 13.8.0.
- **Fix:** Update `firebase` in root to latest (12.12.0) and `firebase-admin` in functions/ to 13.8.0. Check if newer versions pin fixed transitive versions. May not fully resolve if firebase-admin itself hasn't updated @google-cloud/storage.

### MEDIUM `@modelcontextprotocol/sdk` cross-client data leak via `@google/genai`

- **Detected:** 2026-04-14
- **File:** package.json (transitive via `@google/genai`)
- **Detail:** HIGH severity — `@modelcontextprotocol/sdk` >=1.10.0 <=1.25.3 has a cross-client data leak vulnerability. This comes in as a transitive dependency of `@google/genai` (devDependency used for functions/Gemini calls). Current `@google/genai`: 1.39.0 (root dev), 1.38.0 (functions); latest: 1.50.1.
- **Fix:** `pnpm up @google/genai@^1.50.1` in both root and functions/ — newer version should depend on a patched MCP SDK. Also update functions/ `@google/genai` from 1.38.0.

### MEDIUM Functions: `lodash` code injection via `firebase-functions-test`

- **Detected:** 2026-04-14
- **File:** functions/package.json (devDependency `firebase-functions-test`)
- **Detail:** HIGH — lodash >=4.0.0 <=4.17.23 vulnerable to code injection via `_.template`. This comes via `firebase-functions-test > lodash`. Only in test infrastructure, not production runtime.
- **Fix:** Update `firebase-functions-test` from 3.4.1 to latest — check if newer version depends on a patched lodash. This is a test-only devDependency.

### HIGH `protobufjs <7.5.5` — CRITICAL arbitrary code execution via `@google/genai`

- **Detected:** 2026-04-28
- **File:** package.json (transitive via `@google/genai > protobufjs`), functions/package.json (same path)
- **Detail:** GHSA-xq3m-2v4x-88gg (critical): `protobufjs` versions <7.5.5 allow arbitrary code execution via a maliciously crafted protobuf message. Affects both root (`@google/genai: 1.39.0`, a devDependency used for functions/Gemini calls) and functions/ (`@google/genai: 1.38.0`). The runtime code path remains vulnerable to crafted input until the transitive dependency is upgraded to a patched version.
- **Fix:** Update `@google/genai` to >=1.50.1 in both root and functions/ (current: root 1.39.0, functions 1.38.0, latest 1.50.1). Newer versions should pin `protobufjs >= 7.5.5`. This fix is doubly important because it also resolves the previously documented `@modelcontextprotocol/sdk` cross-client data leak (MEDIUM). Verify with `pnpm why protobufjs` after upgrade. Command: `pnpm up "@google/genai@^1.50.1"` in root and `pnpm -C functions up "@google/genai@^1.50.1"`.

### MEDIUM `dompurify` has multiple XSS/sanitization bypasses — three CVEs

- **Detected:** 2026-04-21
- **Updated:** 2026-04-28
- **File:** package.json (transitive via `@monaco-editor/react > monaco-editor > dompurify`)
- **Detail:** Three CVEs affect the dompurify version pinned by `monaco-editor`, all patched in >=3.4.0:
  - GHSA-39q2-94rc-95cp (moderate): `ADD_TAGS` bypasses `FORBID_TAGS` via short-circuit evaluation in <=3.3.3.
  - GHSA-crv5-9vww-q3g8 (moderate): `SAFE_FOR_TEMPLATES` bypass in `RETURN_DOM` mode in >=1.0.10 <3.4.0.
  - GHSA-v9jr-rg53-9pgp (moderate): Prototype pollution XSS bypass via `CUSTOM_ELEMENT_HANDLING` fallback in >=3.0.1 <3.4.0.
    All three affect the Monaco editor used in the widget builder. Not directly exploitable by end users unless they can craft input through the Monaco sanitization path.
- **Fix:** Transitive dep three levels deep. Run `pnpm why dompurify` to trace the resolution; run `pnpm up @monaco-editor/react@latest` if a newer `monaco-editor` pins `dompurify >= 3.4.0`. If not resolved transitively, add a `pnpm.overrides` entry: `"dompurify": ">=3.4.0"`.

### LOW Major version updates available — require planned migration

- **Detected:** 2026-04-14
- **Updated:** 2026-04-28
- **File:** package.json
- **Detail:** Several packages have major version releases available that require migration planning (breaking changes):
  - `tailwindcss`: 3.4.19 → **4.2.3** (major — config format changed completely)
  - `vite`: 6.4.2 → **8.x** (2 majors ahead, but focus on patching within v6 first)
  - `eslint`: 9.39.2 → **10.2.1** (major — verify flat config compatibility)
  - `@eslint/js`: 9.39.2 → **10.0.1** (paired with eslint)
  - `typescript`: 5.9.3 → **6.0.3** (major — strict mode changes)
  - `i18next`: 25.8.13 → **26.0.8** (major — API changes)
  - `react-i18next`: 16.5.4 → **17.x** (paired with i18next)
  - `lucide-react`: 0.563.0 → **1.8.0** (first stable major — icon API changes possible)
  - `@vitejs/plugin-react`: 5.1.2 → **6.0.1** (major)
  - `@types/node`: 24.12.2 → **25.6.0** (major — verify Node 24 compat)
    Also notable minor updates: `react`/`react-dom` 19.2.4 → 19.2.5, `firebase-tools` 15.8.0 → 15.15.0, `firebase` 12.8.0 → 12.12.1.
    These should not be done in a single commit — each needs its own migration PR with testing.
- **Fix:** Prioritize security patches first. Schedule tailwindcss 4 migration separately (config rewrite required). typescript 6 migration after ensuring all types are clean. Coordinate eslint 9→10 with typescript-eslint team compatibility matrix.

---

## Completed

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
