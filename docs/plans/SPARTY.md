# Sparty, the SpartBoard mascot

Status: planned (design settled 2026-10-02; art locked 2026-10-02 after six concept rounds). Next step: the component (§8, step 2).

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
| 6   | Body             | Chibi full body, facing front: big gold helmet (~half the height), navy tunic, red cape, shield and spear     |
| 7   | Poses (v1)       | `idle` (breathe + blink), `wave`, `point`, `cheer`, `think`, `oops`                                           |
| 8   | Speech           | Plain-text speech bubble in the app font (Lexend), not the pixel font                                         |
| 9   | Palette          | 14 colors from the Orono Spartans logos (§3)                                                                  |
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

Locked after six concept rounds reviewed on mobile. The source of truth for the grids until step 2 is the concept page's final state.

- 32×32 grid, transparent background, facing front, one-pixel near-black outline so he reads on white panels, frosted glass and dark tour overlays.
- **Helmet:** gold Corinthian helmet with a T-shaped face opening, a gold nose guard, and two dark 2×3 eyes with a white glint. The look comes from the Orono Spartan head logo.
- **Crest:** a red horsehair brush that runs front to back. From the front it shows as a narrow plume fanning into a fringed top, with horsehair hanging behind the helmet on both sides. Rejected along the way: a crest fanned across the helmet (reads as sideways), a short end-on block (reads as a siren), and a crest swept to one side.
- **Shield:** the varsity O from the Orono O logo: a red O with a thin brand blue border, on a white field, held at his right side. A spear stands upright behind it, so his free hand can wave, point and cheer.
- **Body:** navy tunic, red cape, gold belt and skirt strips, sandals.
- **Rejected:** a side profile with the logo's face (round 2–3), white helmet wings (round 4), a gold shield, gold armor and a sword.
- **Palette** (palette character, then hex):

  | Char | Role                                 | Hex       |
  | ---- | ------------------------------------ | --------- |
  | `o`  | Outline, eyes                        | `#1c1c24` |
  | `Y`  | Gold light (helmet shine, spear tip) | `#f8dc86` |
  | `y`  | Gold                                 | `#ecbb3f` |
  | `b`  | Gold shade                           | `#b98420` |
  | `r`  | Crest and cape red                   | `#cf3a32` |
  | `R`  | Red light                            | `#e8665a` |
  | `d`  | Red shadow                           | `#8e211c` |
  | `s`  | Skin                                 | `#f3d6b3` |
  | `k`  | Skin shade                           | `#dcab7e` |
  | `w`  | White (eye glint, shield field)      | `#ffffff` |
  | `n`  | Navy (tunic)                         | `#1f2e63` |
  | `B`  | Brand blue (border around the O)     | `#2d3f89` |
  | `N`  | Navy light                           | `#3a4e93` |
  | `t`  | Spear shaft                          | `#6b4423` |

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

1. **Art concept round.** Done: six rounds on a private claude.ai page; locked 2026-10-02 (§3).
2. **Component.** `spartyFrames.ts`, `Sparty.tsx`, `SpartyBubble.tsx`, unit tests (grid shape is 32×32, every character is in the palette, run merging is correct), reduced-motion handling.
3. **Dev gallery.** A dev-only route showing every pose at 1×/2×/4× on light and dark backgrounds, with motion on and off.
4. **Flag and toggle.** §7.
5. **Placements.** §5, each with a test that the spot is unchanged when `useShowSparty()` is false.

## 9. Phase 2 (separate flag, separate plan)

Student placements: the quiz and video activity finish screens and the student lobby. Student routes don't load the teacher profile, so the teacher toggle doesn't apply there; this needs its own flag and its own decision on an opt-out.
