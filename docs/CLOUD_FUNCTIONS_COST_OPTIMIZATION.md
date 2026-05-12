# Cloud Functions Cost Optimization

Audit conducted 2026-05-10. ~$5 spent in the preceding 10 days, dominated by `adminAnalytics` (Cloud Functions compute plus the Firestore reads it triggers from unbounded collection scans).

## How Cloud Functions billing works

All callables here are Cloud Functions **2nd gen** (`firebase-functions/v2/https`), which run on Cloud Run and bill **memory (GiB-seconds) and vCPU (vCPU-seconds) separately**, both as a function of wall-clock runtime. Invocation count (first 2 M/month free) and outbound egress ($0.12/GB, first 5 GB free) also contribute but are secondary for this project. Firestore reads triggered from inside a function (especially the unbounded `collectionGroup('dashboards')` and `collection('ai_usage')` scans in `adminAnalytics` — see below) are billed against Firestore, not Cloud Functions, but show up on the same invoice and can be a meaningful share of the total.

The "GB-sec/call" column below is the **worst case per call** (memory × max timeout). Real per-call cost depends on actual wall-clock runtime; the cost column is the corresponding worst-case ceiling and is the right number for back-of-envelope budgeting on long-running functions like `adminAnalytics`.

| Function                    | Memory  | Max timeout    | GB-sec/call (max) | Est. cost/call (max) |
| --------------------------- | ------- | -------------- | ----------------- | -------------------- |
| `adminAnalytics` (hot path) | 1 GiB   | 30 s           | 30                | ~$0.0005             |
| `recomputeAdminAnalytics`   | 4 GiB   | 540 s (1/day)  | 2,160             | ~$0.039              |
| `generateVideoActivity`     | 1 GiB   | 300 s          | 300               | ~$0.005              |
| `transcribeVideoWithGemini` | 1 GiB   | 300 s          | 300               | ~$0.005              |
| `generateWithAI`            | 512 MiB | 60 s (default) | ~30               | ~$0.0005             |
| `archiveActivityWallPhoto`  | 512 MiB | 120 s          | ~60               | ~$0.001              |
| `fetchExternalProxy`        | 256 MiB | 30 s           | ~7.5              | ~$0.00014            |

The `adminAnalytics` row now reflects the post-2026-05-11 snapshot-read implementation. The 4 GiB / 540 s ceiling moved to the once-a-day scheduled `recomputeAdminAnalytics` job, so the per-call cost of admin page loads dropped by ~98% even before counting the Firestore reads that were eliminated.

---

## Primary cost drivers

### 1. `adminAnalytics` — likely the single largest line item

**Memory: 4 GiB. Timeout: 540 s.** (`functions/src/index.ts` `adminAnalytics`)

On every admin analytics page load, this function:

1. Loads the org's member roster from `organizations/{orgId}/members` and resolves Firebase Auth metadata (`auth().getUsers()`) for those members in 100-uid chunks. This is bounded by org size.
2. Streams **every dashboard document in the database** via `collectionGroup('dashboards').select('widgets', 'updatedAt').stream()` and filters each one against the in-memory member-uid set. The scan is system-wide; only the join is org-scoped.
3. Streams **every record in the top-level `ai_usage` collection** via `collection('ai_usage').select('count').stream()` and applies the same in-memory member-uid filter. Also unbounded.
4. Performs additional chunked `users` collection reads (and an Auth fallback) to resolve emails for widget drilldowns and the top 25 AI users.

Two unbounded reads-of-everything per admin page load is the root issue. With even a modestly populated database, each invocation burns substantial wall-clock and Firestore read quota; the 4 GiB allocation means each second of runtime costs more than necessary. Worst-case per-call compute alone is ~$0.039 (2,160 GiB-seconds at the 540 s ceiling), and the Firestore reads from steps 2 and 3 add to that on the same invoice. ~125 admin page visits at the worst-case rate would account for ~$5 on its own, which is consistent with the observed 10-day bill — though actual runtime is usually well below the timeout, so the Firestore-read share of the bill is likely meaningful.

**Recommended fix:** Cache computed analytics in a per-org Firestore doc (e.g. `organizations/{orgId}/analytics/cached`) with a `computedAt` timestamp. Scoping the cache per org is important — a shared global doc would leak data between organizations. Serve the cached result immediately on page load. Recompute in the background either on a Cloud Scheduler job (hourly) or when the cache is older than the acceptable staleness window. Once the cached path is in place, both unbounded scans (dashboards + `ai_usage`) only run on the recompute schedule, and the 4 GiB memory allocation can be dropped.

The function header itself flags this as known architectural debt:

> "Bumps memory and timeout to handle unbounded collection reads while a more scalable (paginated/aggregated) solution is developed."

### 2. `fetchExternalProxy` — bounded by admin tabs, but worth verifying

**Memory: 128 MiB. Cost per call: low but non-trivial at scale.**

This function is called by `AdminWeatherFetcher` (lazy-loaded in `App.tsx` only when `isAdmin` is true) and only when the weather feature config has `fetchingStrategy === 'admin_proxy'` and `source === 'earth_networks'` — the OpenWeather path calls the upstream API directly from the browser. Teacher Weather widgets read from `global_weather/current` via Firestore `onSnapshot` and never call the proxy. So invocation volume is scoped to: (admins with the tab open) × (1 / `updateFrequencyMinutes`). With `updateFrequencyMinutes` defaulting to 15 and a floor of 5, an admin keeping the dashboard open for an 8-hour day produces ~32 calls (default) or ~96 calls (floor). Multiple admins multiply linearly.

**Check invocation counts first** in Firebase Console → Functions → Usage. A few hundred calls per day across the admin pool is the expected order of magnitude. Thousands per day means too many admin tabs are open with too short a refresh interval, or the strategy is misconfigured.

**Recommended fix (if volume is unexpectedly high):** Audit `AdminWeatherFetcher` (`components/admin/AdminWeatherFetcher.tsx`) — confirm the `setInterval` honors `updateFrequencyMinutes` (currently `Math.max(5, …)`), and consider gating on tab visibility (`document.visibilityState === 'visible'`) so background tabs don't fire calls every interval. Server-side, a small in-memory or Firestore-backed cache keyed by upstream URL with a 10–15 min TTL would deduplicate concurrent admin calls.

### 3. `generateWithAI` — unnecessary Firestore reads on every AI call

**Memory: 512 MiB.** (default 60 s timeout; no `timeoutSeconds` specified)

Every AI generation call performs 4–6 Firestore reads before the Gemini API call even begins:

- `admins/{email}` (1 read, outside the transaction).
- Inside `runTransaction`: the per-day overall usage counter (`ai_usage/{uid}_{today}`) and, for the 7 typed flows, the per-feature counter (`ai_usage/{uid}_{featureId}_{today}`) — 1–2 reads.
- Inside the same transaction, for non-admin callers only: `global_permissions/gemini-functions` and (if a typed feature) `global_permissions/{featureId}` — 0–2 reads.
- After the transaction: `getGeminiModelConfig()` re-reads `global_permissions/gemini-functions` to pick the model name — 1 read every call.

The usage counters genuinely change per invocation, but `admins/{email}` and the `global_permissions/*` docs change rarely. The model-config read post-transaction is a duplicate of one already performed in the transaction (for non-admins).

**Recommended fix:** Cache the long-lived reads in module scope with a short TTL (e.g. 5 minutes). Cloud Functions 2nd-gen instances are reused across warm invocations, so a module-level `{ value, cachedAt }` cache is effective with no external infrastructure. The straightforward wins are (a) memoize `getGeminiModelConfig()` so warm calls skip the post-transaction read entirely, and (b) memoize the admin check by email. Caching `global_permissions/*` reads inside the transaction is also possible, but note those reads currently gate rate-limit enforcement — moving the threshold lookup outside the transaction (only the usage counter read needs to stay transactional) is the cleanest restructuring.

---

## Secondary issues (not primary cost drivers but worth fixing)

### Unbounded file download in `archiveActivityWallPhoto`

No file size validation occurs before downloading from Firebase Storage. A single large video upload could exceed the 512 MiB allocation and cause an OOM crash or very long runtime, both of which are billed.

**Fix:** Read the file metadata first (`getMetadata()`), reject anything above a reasonable threshold (e.g. 50 MB) before downloading.

### Unbounded parallelism in `getClassLinkRosterV1`

`Promise.all()` is used to fetch per-class student lists with no concurrency limit. A teacher with 100+ classes would fire 100+ simultaneous HTTP requests to the ClassLink API, which risks hitting ClassLink rate limits and extends the function's wall-clock time.

**Fix:** Process class fetches in batches of 10–20 using a simple chunked `Promise.all()` loop.

### Response size unchecked in `fetchExternalProxy`

The proxy function streams external API responses back to the caller with no size check. A misbehaving or redirected URL could return a very large response that causes an OOM error on the 128 MiB instance.

**Fix:** Use `responseType: 'stream'` in the axios call and check the `Content-Length` response header before consuming the body, aborting the stream if it exceeds a safe threshold (e.g. 1 MB). A simple `axios.get` without streaming already buffers the entire response into memory before headers can be inspected, so the stream approach is required for this guard to be effective. Alternatively, issue a HEAD request first to check the size before fetching.

---

## Recommended action order

1. ~~**Cache `adminAnalytics` output per org**~~ — **Done** (2026-05-11). Replaced with a once-daily scheduled recompute (`recomputeAdminAnalytics`, 5 AM Central) that writes `/organizations/{orgId}/analytics/snapshot`. The hot-path HTTP handler now reads that snapshot doc and returns it; the two unbounded streams (`collectionGroup('dashboards')` + `collection('ai_usage')`) are gone from the per-call path entirely. Hot-path memory dropped from 4 GiB to 1 GiB, timeout from 540 s to 30 s. UI shows a "Updated Xh ago · Next update at 5:00 AM" badge instead of a Refresh button — analytics are explicitly a luxury daily read, and a manual recompute button would just reintroduce the cost path that this change amortizes. Compute helper extracted to `functions/src/adminAnalyticsCompute.ts`; the scheduled job and snapshot reader live in `functions/src/adminAnalyticsSnapshot.ts`. Per-org failures in the recompute don't abort the batch.
2. **Verify `fetchExternalProxy` invocation counts** in Firebase Console → Functions → Usage. A few hundred/day across the admin pool is expected; thousands/day means too many admin tabs or a misconfigured refresh interval.
3. **Add module-level caching to `generateWithAI`** — easy win, saves Firestore reads with no behavioral change.
4. **Add file size guard to `archiveActivityWallPhoto`**.
5. **Batch ClassLink roster fetches**.

## How to monitor going forward

- Firebase Console → **Functions → Usage**: check per-function invocation counts and GB-seconds.
- Firebase Console → **Firestore → Usage**: reads/writes/deletes per day.
- Set a **Budget Alert** in Google Cloud Billing at $2 and $5/month to get email notifications before costs accumulate.
