# Cloud Functions Cost Optimization

Audit conducted 2026-05-10. ~$5 spent in the preceding 10 days, almost entirely attributable to Cloud Functions compute.

## How Cloud Functions billing works

Billing is primarily **GB-seconds**: memory allocation × wall-clock runtime. Invocation count (first 2 M/month free) and outbound egress ($0.12/GB, first 5 GB free) also contribute but are secondary for this project.

| Function                    | Memory  | Max timeout | GB-sec/call | Est. cost/call |
| --------------------------- | ------- | ----------- | ----------- | -------------- |
| `adminAnalytics`            | 4 GiB   | 540 s       | 2,160       | ~$0.039        |
| `generateVideoActivity`     | 1 GiB   | 300 s       | 300         | ~$0.005        |
| `transcribeVideoWithGemini` | 1 GiB   | 300 s       | 300         | ~$0.005        |
| `generateWithAI`            | 512 MiB | ~60 s       | ~30         | ~$0.0005       |
| `archiveActivityWallPhoto`  | 512 MiB | 120 s       | ~60         | ~$0.001        |
| `fetchExternalProxy`        | 128 MiB | 30 s        | ~0.25       | ~$0.000005     |

---

## Primary cost drivers

### 1. `adminAnalytics` — likely the single largest line item

**Memory: 4 GiB. Timeout: 540 s.**

On every admin analytics page load, this function:

1. Issues a `collectionGroup('dashboards')` query that streams **every dashboard document across every user** in the database.
2. Filters results in-memory by org membership.
3. Fetches Firebase Auth metadata for all matched users in parallel batches.

Even a modestly populated database makes this very slow, and the 4 GiB allocation means each invocation burns up to 2,160 GB-seconds. At ~$0.04 per call, 125 admin page visits over 10 days accounts for ~$5 on its own — matching the observed bill exactly.

**Recommended fix:** Cache computed analytics in a Firestore doc (e.g. `admin_analytics/cached`) with a `computedAt` timestamp. Serve the cached result immediately on page load. Recompute in the background either on a Cloud Scheduler job (hourly) or when the cache is older than the acceptable staleness window. The 4 GiB memory allocation can also be reduced once the unbounded collection scan is removed.

The code itself notes this is a known architectural debt:

> "more scalable (paginated/aggregated) solution [needed]"

### 2. `fetchExternalProxy` — death by a thousand cuts

**Memory: 128 MiB. Cost per call: negligible. Invocation count: potentially very high.**

This function is invoked by the Weather widget. If teachers leave dashboards open and the widget polls on a short interval, a classroom of 50 teachers could generate tens of thousands of invocations over a school day. Each call also hits the OpenWeatherMap external API, consuming that quota.

The project already has a `/global_weather/` Firestore collection intended as a cache, but if the cache TTL is too short or the cache key doesn't match what the function writes, every widget refresh bypasses the cache and spawns a new function invocation.

**Recommended fix:** Audit the weather caching logic end-to-end. Ensure the function reads from `/global_weather/` first and only calls the external API when the cached entry is stale (10–15 minutes is appropriate for weather data). Verify the cache key used when writing matches the key used when reading.

### 3. `generateWithAI` — unnecessary Firestore reads on every AI call

**Memory: 512 MiB.**

Every AI generation call performs 4–6 Firestore reads before the Gemini API call even begins:

- Admin status check (`admins/{email}`)
- Model config fetch (`geminiConfig`)
- Global permissions doc per feature
- Usage counter read (transactional)

These docs change rarely. Reading them fresh on every invocation wastes both latency and Firestore read quota.

**Recommended fix:** Store `global_permissions` and model config in module-level variables with a short TTL (e.g. 5 minutes). Cloud Functions instances are reused across warm invocations, so a module-level cache is effective and requires no external infrastructure.

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

**Fix:** Add a `Content-Length` check on the response headers before reading the body, and abort if it exceeds a safe threshold (e.g. 1 MB).

---

## Recommended action order

1. **Cache `adminAnalytics` output** — highest ROI, likely eliminates the majority of the bill.
2. **Audit and fix weather caching** — check invocation counts in Firebase Console → Functions → Usage; if `fetchExternalProxy` shows 50 k+ calls/10 days, the cache is not working.
3. **Add module-level caching to `generateWithAI`** — easy win, saves Firestore reads with no behavioral change.
4. **Reduce `adminAnalytics` memory** — after caching is in place, drop from 4 GiB to 512 MiB.
5. **Add file size guard to `archiveActivityWallPhoto`**.
6. **Batch ClassLink roster fetches**.

## How to monitor going forward

- Firebase Console → **Functions → Usage**: check per-function invocation counts and GB-seconds.
- Firebase Console → **Firestore → Usage**: reads/writes/deletes per day.
- Set a **Budget Alert** in Google Cloud Billing at $2 and $5/month to get email notifications before costs accumulate.
