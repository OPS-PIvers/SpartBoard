# Spike: Embed slide-control feasibility (Remote Control v2, Task 1)

**VERDICT: FAIL** — When a teacher pastes a Google Slides link, SpartBoard stores and
renders the **`/presentation/d/<id>/preview`** form (via `convertToEmbedUrl`), NOT a
publish-to-web (`pubembed`/`pub`) form. The `/preview` iframe has no `&slide=N` URL
contract, so slide next/prev is **not** reliably drivable by updating the iframe `src`.
Task 5 should ship **spotlight/swap only** for Slides decks.

Date: 2026-06-13 · Branch: `dev-paul` · Investigation only, no feature code.

---

## What smart paste actually produces for a Slides link

There is **no** publish-to-web / `pubembed` / `pub` conversion anywhere in the paste
pipeline. The smart-paste "convert a pasted Slides URL to a published embed" behavior
described as a possibility by the product owner **does not exist in the code**. Searched
the whole repo for `pubembed`, `/pub`, `publishedUrl`, `published`, `normalizeUrl` — the
only `pub`-related hits are `utils/assignmentExportShared.ts` and
`utils/publishGradePush.ts` (grade-pushing, unrelated to embeds).

### Exact code path (file:line)

1. **Paste entry → detection.** `utils/smartPaste.ts` `detectWidgetType(text)` routes a
   pasted string. URLs hit `tryParseEmbedWidget` (`utils/smartPaste.ts:191-203`):

   ```ts
   const EMBED_PROVIDERS =
     /(youtube\.com|youtu\.be|vimeo\.com|docs\.google\.com|...)/; // :188
   function tryParseEmbedWidget(url: string): PasteResult | null {
     if (EMBED_PROVIDERS.test(url)) {
       return {
         action: 'create-widget',
         type: 'embed',
         config: { url: convertToEmbedUrl(url), mode: 'url' } as WidgetConfig, // :197
       };
     }
     return null;
   }
   ```

   The stored `EmbedConfig.url` is whatever `convertToEmbedUrl(url)` returns. No further
   transformation.

2. **URL transform.** `utils/urlHelpers.ts` `convertToEmbedUrl`, Slides branch
   (`utils/urlHelpers.ts:151-167`):

   ```ts
   parsed.pathname = `/presentation/d/${slideId}/preview`;
   parsed.search = ''; // strips ?slide=...
   parsed.hash = ''; // strips #slide=id.p
   return parsed.toString();
   ```

   So `https://docs.google.com/presentation/d/<id>/edit?slide=id.gXXX#slide=id.gXXX`
   becomes `https://docs.google.com/presentation/d/<id>/preview` — any slide anchor is
   discarded.

3. **Test confirms it.** `utils/smartPaste.test.ts:11-26` ("detects Google Slides and
   converts to preview URL") asserts the stored config URL `toContain('/presentation/
d/<id>/preview')`. This is a locked-in, tested contract — the published form is never
   produced.

4. **Render.** `components/widgets/Embed/Widget.tsx:210-218` derives the iframe src:

   ```ts
   const sanitizedUrl = ensureProtocol(url);
   const embedUrl = convertToEmbedUrl(sanitizedUrl); // idempotent for /preview
   const finalEmbedUrl = applyStartAt(
     applyAutoplay(embedUrl, autoplay),
     startAtSeconds
   );
   ```

   and `<iframe src={displayMode === 'url' ? finalEmbedUrl : undefined} ...>`
   (`Widget.tsx:565-568`). The rendered src is the `/preview` URL. `applyAutoplay` /
   `applyStartAt` are YouTube-oriented and add no slide param.

   Note: `convertToEmbedUrl` runs **again** at render on the already-stored `/preview`
   URL. That branch matches `/presentation/` but the slide-id regex still matches the id,
   re-sets `search=''`/`hash=''` — so even if Task 5 stored a `?slide=N` on the config
   URL, this render-time pass would **strip it**. Any future slide-param approach must
   account for this double-conversion (it would need to be appended after
   `convertToEmbedUrl`, like `applyAutoplay` does, not stored on `config.url`).

## Does the `/preview` form support slide-index navigation via src changes?

No. The Google Slides `/preview` viewer does not honor `&slide=N` / `#slide=N` for
programmatic navigation. Only the **publish-to-web** embed
(`/presentation/d/e/<pubId>/embed?...`, sometimes called `pubembed`) honors `slide=` and
auto-advance (`start`, `loop`, `delayms`) params. SpartBoard never generates that form,
so the precondition for iframe-src slide control is absent.

## EmbedConfig shape

`types.ts:1142-1153` — `EmbedConfig` = `{ url, mode?, html?, refreshInterval?,
isEmbeddable?, blockedReason?, zoom?, autoplay?, startAtSeconds? }`. **No slide-index
field.** (Comment at `:1151` even notes Drive `/preview` ignores `startAtSeconds`, the
same class of limitation.)

---

## Guidance for Task 5

- **Do not** attempt iframe-src slide next/prev for Slides embeds. The stored/rendered URL
  is `/preview`, which has no slide-index contract; appending a param won't navigate, and
  `convertToEmbedUrl` strips params at render time anyway.
- **Ship spotlight/swap only** for Slides decks, per the plan's FAIL branch.
- **If slide control is ever revisited** it would require a different architecture, not a
  param tweak:
  1. Detect Slides URLs in `convertToEmbedUrl` / `tryParseEmbedWidget` and convert to the
     **publish-to-web** form. This requires the _published_ doc id (`/d/e/<pubId>/`), which
     is **not derivable from the editing id** — the teacher must publish the deck to web
     first, so this can't be done transparently from a normal share link.
  2. Add a `slideIndex` field to `EmbedConfig` (`types.ts:1142`).
  3. Thread it through as a post-`convertToEmbedUrl` appender (mirror `applyAutoplay` at
     `Widget.tsx:215-218`) so the render-time `convertToEmbedUrl` pass doesn't strip it.
  4. Update `utils/smartPaste.test.ts:11-26`, which currently locks in the `/preview`
     contract.
     This is materially larger than a remote-control wiring task and is gated on teachers
     publishing decks — out of scope for Task 5.

## Confidence / uncertainty

- **High confidence** on the code path: the stored URL is `/preview`, evidenced by
  `smartPaste.ts:197` → `urlHelpers.ts:151-167` and the passing test
  `smartPaste.test.ts:11-26`.
- The claim that Google's `/preview` viewer ignores `slide=` (vs. published `pubembed`
  honoring it) is based on Google Slides embed behavior, not on SpartBoard code. It does
  not change the verdict: even if `/preview` _did_ honor a param, SpartBoard's render-time
  `convertToEmbedUrl` strips `search`/`hash`, so src-based control is still broken without
  code changes. Either way the verdict is FAIL for the current pipeline.
