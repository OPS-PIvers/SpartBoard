# Sparty, the SpartBoard mascot

Status: planned (design settled 2026-10-02). Next step: the art concept round (§8, step 1).

## 1. Intent

Sparty is a small pixel-art Spartan who guides teachers at moments the app already has (tours, first-time setup, help) and adds a little delight to them. He is quiet and shows up only occasionally: he never interrupts work, never makes a sound, and turning him off leaves the UI exactly as it is today.

Non-goals for v1: student-facing placements (phase 2, §9), an AI "Ask Sparty" helper, a placeable Sparty widget, sound, and admin-editable dialogue.

## 2. Decisions (from the design interview)

| #   | Decision         | Choice                                                                                                        |
| --- | ---------------- | ------------------------------------------------------------------------------------------------------------- |
| 1   | Core job         | Guide + delight at existing moments                                                                           |
| 2   | Audience         | Teachers first; students in phase 2                                                                           |
| 3   | Presence         | Quiet and occasional; short lines; never interrupts                                                           |
| 4   | Art source       | Code-defined pixel grids in TypeScript                                                                        |
| 5   | Grid             | 32×32                                                                                                         |
| 6   | Body             | Chibi full body: big helmet head (~half the height), small body, shield and spear                             |
| 7   | Poses (v1)       | `idle` (breathe + blink), `wave`, `point`, `cheer`, `think`, `oops`                                           |
| 8   | Speech           | Plain-text speech bubble in the app font (Lexend), not the pixel font                                         |
| 9   | Palette          | Brand-locked, about 8 colors (§3)                                                                             |
| 10  | v1 placements    | Live tours, first-time setup, Help Center, chunk-load error (§5)                                              |
| 11  | Animation        | SVG frames from the grids, switched by CSS `steps()` keyframes; no JS timers, no new dependency (§4)          |
| 12  | Opt-out          | Both: a `sparty` global feature flag (admin control) and a per-teacher "Show Sparty" toggle                   |
| 13  | Tour role        | Intro and outro only: wave on step 1, cheer on the completion screen                                          |
| 14  | Help Center      | Greeter header; `think` while results load, `oops` when nothing matches                                       |
| 15  | Dialogue         | One file, `config/spartyLines.ts`, keyed by moment                                                            |
| 16  | Art review       | Private claude.ai HTML pages while iterating (Paul reviews on mobile); a dev gallery page ships with code     |
| 17  | Tour scope       | Every live tour, including Guided Learning live tours, through the shared tour components; authors do nothing |
| 18  | First-time setup | Sparty hosts every `NewUserSetup` step with a line per step and cheers on Done                                |
| 19  | Students         | Phase 2 behind its own flag                                                                                   |
| 20  | Sound            | None                                                                                                          |
| 21  | Pronouns         | He/him                                                                                                        |
| 22  | `think` / `oops` | Help Center search states and `LazyChunkErrorBoundary`                                                        |
| 23  | Tone             | Neutral helper: friendly, plain product copy; personality comes from the art                                  |
| 24  | Teacher toggle   | Defaults on once the flag grants access                                                                       |

## 3. Art

- 32×32 grid, transparent background, one-pixel dark outline so he reads on white panels, frosted glass and dark tour overlays.
- Palette tokens (final hex values are set in the concept round):
  - `outline` near-black navy (`#1d2a5d` family)
  - `armor` brand navy `#2d3f89`, `armorLight` `#4356a0`
  - `crest` brand red `#ad2122`, `crestDark` `#7a1718` (crest and cape)
  - `bronze` helmet trim, shield rim and spear tip
  - `skin`
  - `highlight` near-white for eye glints and the armor shine
- Rendered sizes are integer multiples of 32 (64, 96, 128 px) so pixels stay square.

## 4. Rendering and animation

- `components/sparty/spartyFrames.ts`: each pose is a list of frames; each frame is 32 strings of 32 palette characters (`.` transparent). Poses list per-frame durations.
- `components/sparty/Sparty.tsx`: `<Sparty pose="wave" size={64} label?="…" />`. Converts each frame to merged horizontal-run `<rect>`s (memoized per pose at module scope), stacks the frames as `<g>`s in one `<svg shape-rendering="crispEdges">`, and shows one at a time with a generated CSS `steps()` keyframe.
- Accessibility: one `role="img"` with an `aria-label` (default "Sparty"); purely decorative uses pass `aria-hidden`.
- Reduced motion: frame 1 only. Add the Sparty animation class to the reduced-motion plugin list in `tailwind.config.js`.
- `components/sparty/SpartyBubble.tsx`: Sparty plus a speech bubble; text is real DOM text.
- No framer-motion, lottie, canvas or image files.

## 5. Placements (v1)

| Spot             | File(s)                                                    | Behaviour                                                      |
| ---------------- | ---------------------------------------------------------- | -------------------------------------------------------------- |
| Live tour intro  | `components/tours/TourDialog.tsx` / `TourTip.tsx` (step 1) | `wave` beside the existing intro text                          |
| Live tour outro  | tour completion screen in `components/tours/`              | `cheer`                                                        |
| First-time setup | `components/auth/NewUserSetup.tsx`                         | small Sparty in the header, one line per step, `cheer` on Done |
| Help Center      | `components/help/HelpCenterModal.tsx`                      | `wave` greeter; `think` while searching; `oops` on no results  |
| Chunk-load error | `components/common/LazyChunkErrorBoundary.tsx`             | `oops` beside the existing refresh message                     |

Every spot goes through one hook, `useShowSparty()`, which is true only when `canAccessFeature('sparty')` and the profile toggle is on. When false, each spot renders exactly what it renders today. `LazyChunkErrorBoundary` can render outside the dashboard providers, so the hook must not require `DashboardProvider` there.

## 6. Dialogue

`config/spartyLines.ts` holds every line, keyed by moment (`setup.welcome`, `setup.step.<id>`, `setup.done`, `help.greeting`, `help.searching`, `help.noResults`, `chunkError`, `tour.done`). Tours keep their own intro text; Sparty only adds the pose. Lines are short (one sentence), first person, neutral, and never name a flag or an internal mechanism.

## 7. Rollout and settings

- New `GlobalFeature` id `sparty` in `types.ts`, with a `FEATURE_DEFAULTS` entry in `config/featureDefaults.ts`: `defaultAccessLevel: 'admin'`, `defaultEnabled: true`, `missingDocPublic: false`, `stage: 'preview'`, `afterLaunch: 'keep'`, a label, an icon and a description. Add the id to `functions/src/featureMissingDoc.ts`.
- On for Paul and the other `/admins` first. To open it: Admin Settings > Access > Previews > Sparty > Public.
- Per-teacher toggle: new optional `UserProfile` boolean `spartyHidden` (absent means shown), surfaced in `components/settingsModal/sections/AppearanceSection.tsx` as "Show Sparty" and shown only to users who pass the flag.
- The `public/changelog.json` entry is written when the flag opens to everyone, not at merge.

## 8. Build order (one PR into `dev-paul`)

1. **Art concept round.** Draw the palette and all poses as grids; publish them as a private claude.ai HTML page (animated, phone-sized) for Paul to review; iterate until approved.
2. **Component.** `spartyFrames.ts`, `Sparty.tsx`, `SpartyBubble.tsx`, unit tests (grid shape is 32×32, every character is in the palette, run merging is correct), reduced-motion handling.
3. **Dev gallery.** A dev-only route showing every pose at 1×/2×/4× on light and dark backgrounds, with motion on and off.
4. **Flag and toggle.** §7.
5. **Placements.** §5, each with a test that the spot is unchanged when `useShowSparty()` is false.

## 9. Phase 2 (separate flag, separate plan)

Student placements: the quiz and video activity finish screens and the student lobby. Student routes don't load the teacher profile, so the teacher toggle doesn't apply there; this needs its own flag and its own decision on an opt-out.
