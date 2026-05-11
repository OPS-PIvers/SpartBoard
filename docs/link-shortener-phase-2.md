# Link Shortener — Phase 2 Roadmap

## Context

Phase 1 of the admin link shortener shipped in [PR #1570](https://github.com/OPS-PIvers/SpartBoard/pull/1570). It delivers:

- Admin-only creation, editing, deletion of `short_links/{code}` docs via an Admin Settings tab (`components/admin/LinkShortenerManager.tsx`) and a Sidebar quick-action (`components/admin/ShortLinkQuickCreate.tsx`).
- A public `/r/:code` resolver (`components/common/ShortLinkRedirect.tsx`) that performs a client-side Firestore lookup, atomically increments a per-link `clicks` counter, and redirects via `window.location.replace()`.
- Custom slug + random fallback code generation with reserved-word guard (`utils/shortLinkValidation.ts`).
- Firestore rules that allow public reads, admin-only writes, and a narrow anonymous click-counter update (`firestore.rules` — `/short_links/{code}`).
- 100-link cap on the admin listing query (`hooks/useShortLinks.ts`).

**Net infra cost of phase 1: $0/month** (existing domain, existing SPA fallback, no Cloud Function added).

Phase 2 builds on that foundation in three independent slices — each can ship on its own without blocking the others. None of them require a new domain or new infrastructure surface area; the dominant cost remains dev time.

---

## Phase 2 PRs (roadmap snapshot)

| PR  | Title                                                     | Status   |
| --- | --------------------------------------------------------- | -------- |
| 1   | Analytics tab in `AnalyticsManager` (Links panel)         | Planned  |
| 2   | Per-click event log + richer metrics                      | Planned  |
| 3   | "Shorten this URL" integration in widgets + Announcements | Planned  |
| 4   | Bulk import/export                                        | Sketch   |
| 5   | Vanity short domain                                       | Deferred |

---

## PR 1 — Analytics: "Links" panel in `AnalyticsManager`

### Goal

Surface the click data phase 1 already collects. No new writes — just read what's there and render it inside the existing analytics chrome so admins can spot which shared resources teachers actually use.

### Key design decisions

1. **Reuse the existing tab pattern in `AnalyticsManager.tsx`** (the `tabs` array around line 1641). Add `{ id: 'links', label: 'Links', icon: <Link2 /> }` and a `LinksPanel` component conditionally rendered alongside the other panels.

2. **Pull data with the same `useShortLinks()` hook** from phase 1 (`hooks/useShortLinks.ts`). The 100-link cap there is already appropriate for analytics — districts with more than that should hit a pagination/search story before they hit an analytics story.

3. **Reuse `KpiCard` + `PanelCard`** wrappers from `AnalyticsManager.tsx:232-286` so the visual language matches every other analytics panel. Charts use Recharts (already a dependency).

4. **Three sections, top to bottom:**
   - **KPIs row:** total links, total clicks (sum of `link.clicks`), links created in the last 7 days, links with zero clicks (dead-link cleanup candidates).
   - **Top links table:** ordered by `clicks` desc, top 10. Columns mirror the `LinkShortenerManager` table but no edit/delete (this is analytics, not management — link to the Links tab for actions).
   - **Recent activity:** links sorted by `lastClickedAt` desc, top 10. Shows what's currently in rotation.

5. **No chart in PR 1.** A clicks-over-time chart needs the event log from PR 2; without it, all we have is "total clicks since creation" which doesn't bucket by date. Adding a fake aggregation here would be misleading.

### Files

**New:**

- `components/admin/Analytics/LinksPanel.tsx`

**Modified:**

- `components/admin/Analytics/AnalyticsManager.tsx` — register the tab.

### Cost

$0 — same Firestore data phase 1 already reads.

### Verification

1. As admin: Admin Settings → Analytics → confirm "Links" tab appears with `Link2` icon.
2. KPIs show non-zero numbers after creating a few links and clicking them in another browser/incognito.
3. Top-links table sorts by clicks descending.
4. Recent-activity table updates after clicking a link (allow snapshot to fire).
5. Empty state (`links.length === 0`) renders gracefully.

---

## PR 2 — Per-click event log + richer metrics

### Goal

Move from a counter-only model to per-click events so analytics can show clicks over time, device class, and referrer. This is the prerequisite for any time-series chart.

### Key design decisions

1. **New collection: `/short_link_events/{eventId}`**, one doc per click. Auto-ID. Schema:

   ```ts
   interface ShortLinkEvent {
     code: string; // FK to short_links/{code}
     timestamp: number; // Date.now() at click
     referrer: string | null; // document.referrer, truncated to 256 chars
     deviceClass: 'desktop' | 'tablet' | 'mobile' | 'unknown';
     // Deliberately NO IP, NO user agent string, NO uid — FERPA-aware.
   }
   ```

2. **Resolver writes both** — counter (today) **and** event doc. Both writes are fire-and-forget. The event write happens in `recordShortLinkClick()` in `hooks/useShortLinks.ts`.

3. **Security rule:** anonymous create allowed when payload matches schema; nobody but admins can read or update. Read aggregation happens through a scheduled Cloud Function (next decision), not direct queries.

4. **Scheduled rollup function** — a Cloud Function that runs nightly and writes per-day aggregates to `short_links/{code}/daily_clicks/{yyyy-mm-dd}` with `{ clicks, byDevice }`. This is what `LinksPanel` actually queries for time-series — never the raw events. Keeps client read costs flat regardless of click volume.

5. **TTL on raw events: 30 days.** Firestore TTL policy on `/short_link_events/{*}` so storage stays bounded. After 30 days only the daily aggregates remain.

6. **Cost framing:** this is the one phase 2 PR that actually adds infra surface area — a scheduled Cloud Function and an additional write per click. Both stay well within free tier for a single-district audience (free tier covers 125k function invocations/month; one nightly function is ~30/month). Net expected spend: still **$0/month**.

### Files

**New:**

- `functions/src/rollupShortLinkClicks.ts` — scheduled function.
- `tests/utils/deviceClass.test.ts` (optional) — covers UA-string → deviceClass mapping.

**Modified:**

- `hooks/useShortLinks.ts` — `recordShortLinkClick()` also writes an event doc.
- `types.ts` — `ShortLinkEvent` interface.
- `firestore.rules` — `/short_link_events/{eventId}` rules; admin-only read.
- `functions/src/index.ts` — export the scheduled function.
- `components/admin/Analytics/LinksPanel.tsx` — read `daily_clicks` rollups and render a clicks-over-time chart.

### Verification

1. Click a short link → confirm a new `short_link_events` doc appears in Firestore.
2. Manually invoke the rollup (`firebase functions:shell`) → confirm `daily_clicks/{date}` subdocs are created.
3. Analytics panel shows a 7-day bar chart that matches the event-log totals.
4. Sign out → click a link → event doc is still created (anonymous create rule).
5. As non-admin: attempting to query `/short_link_events` returns permission-denied.

---

## PR 3 — Inline "Shorten this URL" integration

### Goal

Make the shortener useful from where URLs actually get entered, without an auto-shortening sweep. Admin pastes a long URL into a widget setting or an announcement → optional button next to the field converts it to a `/r/:code` link, returning the short URL to the field.

### Key design decisions

1. **New shared component: `<ShortenUrlButton url onShortened>`** in `components/admin/ShortenUrlButton.tsx`. Renders a small button next to URL inputs. Click → calls `createShortLink()` from `useShortLinks` → on success, calls `onShortened(shortUrl)` so the parent component can replace the field value.

2. **Admin-gated.** Component returns `null` when `!isAdmin`. Non-admins keep entering raw URLs as today.

3. **Opt-in placement.** Do NOT auto-replace URLs. The button is a hint, not magic. Three planned integration points:
   - `components/admin/Announcements/EmbedConfigEditor.tsx` — alongside the URL input.
   - Widget settings panels for `iframe`, `embed`, `url`, `video-activity` — wherever a long external URL is stored. Audit which widgets actually accept external URLs via `grep` for `<input type="url"` and `placeholder="https://`.
   - `components/admin/WidgetBuilder/*` — when an admin pastes a resource URL into a generated widget.

4. **No auto-detection.** Don't try to recognize "this looks like a Google Doc, shorten it." Teachers should choose. This avoids surprising rewrites and keeps the audit trail clean.

5. **The link inherits a label** from the surrounding context where possible. The announcement editor passes the announcement title as the label; widget integrations pass the widget label. Defaults to blank if no good source.

### Files

**New:**

- `components/admin/ShortenUrlButton.tsx`

**Modified:** (one entry per integration point — pick the highest-value ones first)

- `components/admin/Announcements/EmbedConfigEditor.tsx`
- Widget settings panels for URL-bearing widgets (audit pending — list once the integration PR opens).

### Verification

1. As admin in the Announcements editor: paste a long URL → button appears → click → field replaced with `spartboard.web.app/r/<code>` → confirm new entry in `LinkShortenerManager`.
2. As non-admin: button hidden everywhere.
3. Widget settings with URL fields show the same button next to the URL input.
4. Created link has the contextual label populated (announcement title / widget label).

---

## PR 4 — Bulk import/export (Sketch)

CSV in / CSV out for the Links tab. Useful for district-wide migrations and offline editing. Skeleton:

- Export: download `short_links` as CSV (`code, destination, label, clicks, createdAt`).
- Import: parse a CSV, validate each row through `validateDestination` + `validateSlug`, dry-run preview, then batch `setDoc` writes.
- UX lives behind a small "More" menu in the Links tab header so the primary CRUD surface stays uncluttered.

Defer until there's a real district-migration scenario asking for it.

---

## PR 5 — Vanity short domain (Deferred)

The shortest possible URL on `spartboard.web.app/r/abc` is ~28 characters. A custom `.app`/`.link`/`.io` short domain could drop that to ~12. The implementation work is trivial (Firebase Hosting supports multiple custom domains; just add a domain that rewrites the same `/r/:code` path).

**Out of zero-cost scope** because a usable short domain typically runs $15–50/yr. Revisit only if there's a documented user complaint about URL length.

---

## Cross-cutting notes

### Privacy / FERPA

- Never log IPs, user agent strings, full referrer query strings, or anything that could identify a student.
- Truncate `document.referrer` to its origin (or 256 chars) before storing.
- Device class only — not user agent.
- TTL on raw events keeps the privacy surface area small.

### Backwards compatibility

- Phase 1 docs (`short_links/{code}`) don't gain any required fields in phase 2. `daily_clicks` is a subcollection, optional. Old links keep working.
- The `clicks` counter on the parent doc stays authoritative as a quick-read fallback if the rollup hasn't run yet.

### Out-of-scope across all phase 2 PRs

- QR code generation for short links (separate feature; widgets like `qr` already generate QR codes).
- Password-protected or expiring links (no use case yet; the dock + analytics gives admins the same control via delete).
- Per-user short links (admin-only is a deliberate scope choice; broadening it changes the security-rule model).
- Server-side `301` redirects (would require a Cloud Function rewrite; client redirect is fine for our latency budget).
