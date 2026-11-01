# Light chrome for live tours and Guided Learning

Live tour chrome (the tip, the tour bar, the dialogs and the editor panel) is dark, translucent slate glass sitting over a dark dim. It blends into the dimmed board, and inside the editor panel every region reads as one dark slab. This plan moves tour chrome and Guided Learning UI to solid light surfaces, makes the spotlight ring strong enough to compete with a white card, and gives Guided Learning callouts depth.

Scope was settled in a design interview with Paul on 2026-10-07, using the prototype at https://claude.ai/artifact/6AcoWCcNZRm6B9CA96Be81 (open it with "White card", "Light" and "Bold, breathing" selected for the agreed look). This document is the contract. Each PR is self-contained.

**Code references** were taken at `dev-paul` commit `976c5ead3`. Symbol names are authoritative and line numbers are hints; if a line number is off, grep for the symbol.

**Release:** no flag. This is a styling change with no behaviour change (CLAUDE.md exempts styling). Add one teacher-facing `public/changelog.json` note at the `main` release that includes PR 2, for example: "Tour tips and Guided Learning players are easier to read on any background."

Out of scope: tour behaviour, tip placement logic, the dim's geometry, and Guided Learning Studio layout. The Studio is already light; only its few dark chips are touched.

## Why

- **Tour chrome vanishes on the dim.** `TourTip` (`components/tours/TourTip.tsx:95`), `TourBar` (`components/tours/TourBar.tsx:54`) and the editor panel `shell` (`components/tours/editor/TourEditorPanel.tsx:195`) all use `bg-slate-900/90 … backdrop-blur-xl` over the spotlight dim `fill-slate-950/55` (`TourSpotlight.tsx`). The surface is translucent and close in brightness to what is behind it.
- **The editor panel has no hierarchy.** The header, tabs, step rows, expanded step and footer differ only by `white/10` hairlines and `white/[0.07]` tints, and "No control picked" is plain `text-slate-300`.
- **The target ring is thin.** The spotlight is a 2px white stroke with a one-shot 700ms `tour-pulse`. Once the tip turns white, the ring needs more weight.
- **Guided Learning repeats the same pattern.** The `dark` callout tone in `CALLOUT_TONE_STYLES` (`components/widgets/GuidedLearning/utils/calloutStyle.ts:199`) is the same translucent glass, and the player, Results, recorder and stage cards hardcode dark slate classes with no shared module.

## Product decisions (settled, do not re-litigate)

| #   | Decision            | Answer                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L1  | Tip surface         | **Solid white card.** Slate-900 title, slate-600 body, brand-blue-primary (`#2d3f89`) text buttons for Show me / Autopilot, a solid brand-blue "Next", and a white arrow. A layered shadow (tight contact shadow plus a large soft one) gives depth. No translucency and no backdrop blur.                                                                                                                                                                                      |
| L2  | Tour bar            | **Matches the tip** (white, same shadow, brand-blue actions).                                                                                                                                                                                                                                                                                                                                                                                                                   |
| L3  | Flag                | **None.** Styling only.                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| L4  | Editor panel        | **Light.** White body, a brand-blue-dark (`#1d2a5d`) header with white title and `#c3cae6` icons and "Saved" status (green dot), a slate-50 tab strip with a white raised active tab, white inputs with slate-300 borders, a slate-50 add-step row and a white footer with a solid brand-blue "Next". The collapsed rail is light too.                                                                                                                                          |
| L5  | Target ring         | **3px white ring with a soft white glow** (a 4px `white/22` spread plus a 24px glow) on every step. On steps the teacher finishes by clicking the target, the ring also **breathes**: a second ring scales out and fades on a ~2.2s loop. Show-only steps keep the one-shot pulse. `prefers-reduced-motion` gets the static bold ring.                                                                                                                                          |
| L6  | Dim                 | **Unchanged** at `slate-950/55`.                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| L7  | Step status         | The selected step and its expanded detail sit on brand-blue-lighter (`#eaecf5`) with a 3px inset brand-blue-primary left edge. Untitled steps show an **amber chip** (`amber-100` fill, `amber-800` text, alert icon) reading "No control picked". The existing red missing-anchor status stays red on light.                                                                                                                                                                   |
| L8  | Other tour surfaces | `TourDialog` becomes a white card like the tip. The Record-from-here bar and the anchor-picker top bar become white like the panel, and the record dot stays red. The picker's **hover label** (the chip that follows the hovered control) stays dark but becomes **solid** `slate-900`, because it sits on arbitrary UI.                                                                                                                                                       |
| L9  | Tip counter         | **None.** The tour bar and the panel footer already show position.                                                                                                                                                                                                                                                                                                                                                                                                              |
| L10 | GL scope            | **All GL UI.** Callout tones, player, stage cards, Results, recorder, capture modal and Studio's dark chips.                                                                                                                                                                                                                                                                                                                                                                    |
| L11 | GL tone defaults    | Restyle the tones in place: `dark` becomes solid with a stronger border and the L1 shadow, `light` matches the tour card exactly, and `accent` gets the same shadow. **Existing steps keep the tone they render today.** New steps from Studio, the AI generator and the recorder are created with `calloutTone: 'light'` written explicitly. An absent tone still means `dark` everywhere (`calloutToneOf`), so choosing Dark keeps deleting the field (`regionEdits.ts:339`). |
| L12 | GL imports          | A `.gl.json` step with no tone stays **Dark** (it is existing content). The `gl-author` skill starts writing `calloutTone: "light"` on callout steps.                                                                                                                                                                                                                                                                                                                           |
| L13 | GL image framing    | **Stays dark:** the spotlight mask, the `SlideBackdrop` blurred letterbox, `DeviceFrame`, the Studio and library thumbnail letterboxes, the video interaction player, the screen-capture preview and the white-on-image hotspot markers. Only UI _around_ the image goes light.                                                                                                                                                                                                 |
| L14 | GL player bars      | **Solid white header and footer** with a `slate-200` hairline, attached above and below the stage (not floating pills).                                                                                                                                                                                                                                                                                                                                                         |
| L15 | Delivery            | **Two stacked PRs** to `dev-paul`. PR 1 waits for #3948 (tour editor fix touching `TourEditorPanel.tsx`) to merge, then branches from `dev-paul`.                                                                                                                                                                                                                                                                                                                               |

## Shared styles

PR 1 adds `components/common/lightChrome.ts`, a set of exported class strings that both tours and GL import. Nothing in a component should re-spell these.

- `chromeSurface`: `bg-white text-slate-900 border border-slate-900/[0.08]` plus the L1 shadow as an arbitrary `shadow-[…]` value: `0 1px 2px rgba(2,6,23,.2), 0 12px 24px -6px rgba(2,6,23,.45), 0 32px 64px -16px rgba(2,6,23,.55)`. If the shadow is wanted elsewhere, add it to `tailwind.config.js` `boxShadow` as `chrome` instead.
- `chromeBody` (`text-slate-600`), `chromeMuted` (`text-slate-500`; use only for secondary text, since it passes AA on white).
- `primaryBtn`: `bg-brand-blue-primary text-white hover:bg-brand-blue-dark`, focus ring `ring-brand-blue-primary/50`.
- `secondaryBtn`: `text-brand-blue-primary hover:bg-brand-blue-lighter`.
- `iconBtn`: `text-slate-500 hover:bg-slate-100 hover:text-slate-900`.
- `headerBar` (panel header): `bg-brand-blue-dark text-white`, with `headerIconBtn`: `text-[#c3cae6] hover:bg-white/10 hover:text-white`.
- `inputLight`: `bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-brand-blue-primary`, with `[color-scheme:light]`.
- `warnChip`: `bg-amber-100 text-amber-800 rounded-full px-2`.

`components/tours/tourButtons.ts` re-exports the light buttons so its current importers (`TourTip`, `TourBar`, `LiveTourRunner`, `TourEditorPanel`, `TourEditorSettings`, `TourAnchorPicker`, `TourHelpVisibility`) keep their import path. Delete the old dark strings once nothing uses them.

## PRs

### PR 1: tour chrome

Files: `components/common/lightChrome.ts` (new), `components/tours/tourButtons.ts`, `TourTip.tsx`, `TourBar.tsx`, `TourDialog.tsx`, `TourSpotlight.tsx`, `LiveTourRunner.tsx` (spotlight prop only), `editor/TourEditorPanel.tsx`, `editor/TourEditorSettings.tsx`, `editor/TourHelpVisibility.tsx`, `editor/TourAnchorList.tsx`, `editor/RecordFromHere.tsx`, `editor/TourAnchorPicker.tsx`, `tailwind.config.js` (keyframe), and the affected tests.

1. **Tip (L1, L9).** In `TourTip`, replace the dialog's classes with `chromeSurface`. Change the arrow to `fill-white stroke-slate-900/[0.08]`, the title to `text-slate-900`, and the "looking" text to `chromeMuted`. Status pill: `turn` becomes `bg-brand-blue-primary text-white`, and the autopilot kind becomes `bg-brand-blue-lighter text-brand-blue-dark`. The confirm prompt text becomes `text-slate-900`. Focus rings move from `ring-white/60` to `ring-brand-blue-primary/50`. Keep the layout and widths unchanged so `tipPlacement` is unaffected.
2. **Bar (L2).** `TourBar` uses `chromeSurface` and the light buttons. Its toggle at `TourBar.tsx:124` (knob `bg-slate-900` on a white track) needs the colours inverted: knob white, track brand-blue when on and slate-300 when off.
3. **Dialog (L8).** `TourDialog` card: `chromeSurface`, keeping its `bg-slate-950/55` scrim.
4. **Ring (L5).** In `TourSpotlight`, make the ring stroke 3px and add the glow as an SVG `filter` (a `feGaussianBlur` of the stroke) or a second wider stroke at `white/22`. Add a `breathe?: boolean` prop. When true, render the pulse ring with a new `tour-breathe` animation (`tailwind.config.js`: scale 1 to 1.14 and opacity .85 to 0 over 70% of 2.2s, infinite), `motion-safe` only. `LiveTourRunner` passes `breathe` when the current step is finished by clicking the target. Reuse the condition behind its `acted` flag near `showTipNext` (`LiveTourRunner.tsx:1700`). Keep `pulse` (the one-shot) for show-only steps.
5. **Editor panel (L4, L7).**
   - `shell` becomes `chromeSurface` without `backdrop-blur`.
   - Header uses `headerBar`. The "Saved" text gets a green dot (`bg-green-400`). Undo, redo, mute, side, collapse and close use `headerIconBtn`.
   - Tab strip: `bg-slate-50 border-b border-slate-200`. Active tab: `bg-white text-brand-blue-dark shadow-sm`. Inactive: `text-slate-500`.
   - Step rows get `divide-slate-100` dividers and `hover:bg-slate-50`. Number column: `text-slate-400`, or `text-brand-blue-primary` when selected.
   - Selected row and its detail block: `bg-brand-blue-lighter shadow-[inset_3px_0_0_#2d3f89]`, with the detail closed by a `border-b border-[#d5daec]`.
   - Untitled or unbound subtitle: `warnChip` with the existing alert icon. Spinner and red-error subtitles keep their icons, with red switched to `text-brand-red-primary`.
   - Thumbnail border: `border-[#d5daec]`. The Retake button becomes white with `text-slate-700 shadow`.
   - Labels use `text-slate-600` and inputs use `inputLight`.
   - The select and checkbox move to `[color-scheme:light]`, with `accent-brand-blue-primary` on the checkbox.
   - "Pick" uses `secondaryBtn`. "Delete step" uses `text-brand-red-primary`.
   - Add-step row: `bg-slate-50 border-t border-slate-200`.
   - Footer: white, `border-t border-slate-200`, progress text in `chromeMuted`, with "Next" as `primaryBtn`.
   - The drag grip uses `text-slate-400 hover:bg-slate-100`.
   - The collapsed rail gets the same surface, with the progress text in `text-slate-600`.
6. **Settings tab and anchor list.** Apply the same input, label and button treatment in `TourEditorSettings`, `TourHelpVisibility` and `TourAnchorList`. Grep each for `white/`, `slate-100`, `slate-200`, `slate-300` and `text-white`. On light surfaces, `text-slate-400` and `text-slate-500` are fine for secondary text (`components/CLAUDE.md`).
7. **Record and picker bars (L8).** The `RecordFromHere` bar (`:139`) and the `TourAnchorPicker` top bar (`:183`) use `chromeSurface` and the light buttons. The record dot stays `text-brand-red-primary` / `bg-brand-red-primary`. The picker hover label (`:169`) becomes `bg-slate-900` (solid, no `/90`) with `text-white`.
8. **Tests.** Update assertions on old classes, such as the status pill `bg-white` (grep `LiveTourRunner.test.tsx`, `TourBar.test.tsx`, `TourSpotlight.test.tsx` and `editor/*.test.tsx` for `slate-900`, `bg-white` and `white/`). Add a `TourSpotlight` test that `breathe` renders the looping ring and that the ring stays static under reduced motion (the existing tests show how `usePrefersReducedMotion` is mocked). Run `pnpm exec vitest related --run` on the changed files.
9. **Verify.** On `/live-tour-views-dev` (`components/dev/LiveTourViewsDevHarness.tsx`), served by `vite-harness`, screenshot the tip, the bar, a dialog and the editor panel over a dark, a photo and a light board background. Also check a real tour in `vite-dev` signed in on `spartboard-dev`. Compare against the prototype. Send Paul the screenshots.

### PR 2: Guided Learning (stacked on PR 1)

Imports from `components/common/lightChrome.ts`. Files and line hints come from the 2026-10-07 inventory, so grep to confirm each one.

1. **Callout tones (L11).** In `CALLOUT_TONE_STYLES`:
   - `dark.tooltipCard` and `dark.popoverCard` become `bg-slate-900 text-white border border-white/40` plus the L1 shadow, with no `/90`, `/95` or blur.
   - `light` uses the `chromeSurface` border and shadow, with `body: 'text-slate-600'`.
   - `accent` gains the shadow.
   - Swatches stay as they are. The connector `line` and `halo` values stay unless the screenshots show a problem.
2. **New-step default (L11).** Every place that creates a brand-new step sets `calloutTone: 'light'`:
   - The Studio add-step paths and `useGuidedLearningEditorState.ts`.
   - `GuidedLearningAIGenerator.tsx`, and `generatedStep.ts:94`, which currently copies only non-dark tones. Keep that, and have the generator default to `'light'` when the model gives no tone.
   - The recorder's step builder.
   - Grep `crypto.randomUUID()` / `interactionType:` construction sites under `components/widgets/GuidedLearning`.

   Do **not** change `calloutToneOf`, the import path in `glTransfer.ts`, or the `regionEdits.ts` delete-on-dark rule. Absent stays dark. If a step is created without a callout, the tone field is harmless, so set it only where `stepHasCallout` can become true, or set it unconditionally if that's simpler and the normalizer keeps it. Add unit tests for each creation path.

3. **gl-author (L12).** In `.claude/skills/gl-author/SKILL.md`, change the guidance at `:345` (and the version note at `:242` / `:415`) so new callout steps write `"calloutTone": "light"`. Update `scripts/validate_gl_json.mjs` only if it rejects that.
4. **Player (L14).**
   - `PlayerShell.tsx`: the frame (`:36`) stays dark only where it is the letterbox behind the stage. The header (`:46`) and footer (`:66`) become solid white with `border-slate-200` and slate text, with no blur. Pills and chips (`:126`, `:162`, `:182`) move to `bg-slate-100 text-slate-700 border-slate-200`.
   - Make the same change in `StepOutline.tsx` (`:64`, `:85`, `:141`), `FooterOverflow.tsx` (`:38`, `:60`), `SpeedControl.tsx` (`:24`–`37`), `WatchScrubber.tsx` (`:83`, track `bg-slate-200` with a brand-blue fill) and the `playerV2` footer buttons and progress tracks in `GuidedLearningPlayer.tsx` (`:724`, `:763`, `:858`, `:874`). Leave the non-V2 path's classes alone unless they are shared.
   - `ResumePrompt.tsx` card (`:31`) gets `chromeSurface` and keeps its scrim.
   - `SlideBackdrop` is unchanged (L13).
5. **Stage cards.** `QuestionInteraction.tsx` (`:157` and inner `:182`, `:238`, `:386`, `:468`, `:478`) and `AudioInteraction.tsx` (`:77`) become `chromeSurface` with light inner controls (solid fills, no `white/5`). The reset-zoom button (`GuidedLearningStage.tsx:1335`) becomes a white chip with a shadow. `VideoInteraction`, the spotlight mask, the load-error and loading states, and the hotspot markers stay dark (L13). `BannerInteraction` is author-toned, so leave it.
6. **Results.** `GuidedLearningResults.tsx` (`:443`–`:882`), `results/EngagementView.tsx:57`, `MisclickHeatmap.tsx:34` and `StepFunnel.tsx:31` move to white cards on `slate-50`, with slate text and `border-slate-200`. The heatmap overlays a screenshot, so it keeps a dark frame around the image if it has one.
7. **Recorder and capture.** The `recorder/TourRecorder.tsx` bar (`:42`, `:86`, `:100`) matches the PR 1 record bar. In `recorder/FrameReview.tsx`, light UI keeps its `bg-slate-950/80` scrim and the image redaction highlight. The `:360` button becomes `secondaryBtn` or `primaryBtn`. Also check `RecordingSession.tsx:254`. In `ScreenCaptureModal.tsx`, the `:413` button goes light, and the preview (`:325`) and recording pill (`:337`) stay dark (L13).
8. **Studio chips.** `StudioCanvas.tsx:416` hint pill and `StudioPlayMode.tsx:59` exit button become white chips with a shadow. `StudioEditLayer.tsx:1163` and `:1253` handle and label chips sit on the image, so leave them dark. Thumbnail letterboxes and `DeviceFrame` are unchanged.
9. **Tests and verify.** Update class assertions (for example `TooltipInteraction.test.tsx`). Screenshot the GL player (V2), a question card over a spotlight, Results, and FrameReview, and Studio with a new step showing a Light callout and an old step still Dark. Check that an exported-and-reimported activity keeps its tones.

## Accessibility notes

- On white, body text uses `slate-600` or darker, and `slate-500` only for secondary text. Brand-blue-primary on white is about 9:1.
- Focus rings move to `brand-blue-primary/50` on light surfaces and stay `white/60` on the dark header bar.
- The breathing ring is decoration; nothing depends on seeing the motion. It is `motion-safe` only.
