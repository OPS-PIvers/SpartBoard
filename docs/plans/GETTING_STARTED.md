# Getting Started: replace new-teacher onboarding with Live tours

Grilled and settled with Paul on 2026-11-06. P0 is done (results below, D19 revised, D31 added); nothing else is built. Six PRs to `dev-paul` behind `getting-started` (P1-P6), the tours written as data on dev (P7), a prod test on Paul's account, and a final PR that deletes the old flow once the flag is open (P8).

Terms (Live tour, Getting Started, Essentials, Next steps, Sparty, Team) are defined in [GLOSSARY.md](../../GLOSSARY.md).

## Goal

A new teacher is walked through real setup by Sparty on the real app instead of a wizard and a checklist widget: buildings, Drive, classes, and how a widget works, in about 8 minutes. Everything else waits on a Getting Started page they can return to at any time, and an admin can send any tour, or the whole page, to a teacher with a question.

## Current-state facts the design builds on

Read from the code on 2026-11-06 unless marked otherwise. P0 tested the wizard, the board's color and the Drive flow live; see its results.

- **Wizard.** `App.tsx:765` shows `NewUserSetup` once `activeDashboard` exists. Its steps are buildings, style and dock (`components/auth/NewUserSetup.tsx:163`), with 12 default dock tools (`:51`). Finishing writes `dockItems`, `dockInitialized` and `setupCompleted` (`:217`).
- **Why it "never works" (reload path reproduced in P0).** `context/DashboardContext.tsx:2796` creates "My First Board" for an account with no boards. The returning-user probe treats any dashboard as proof of setup and silently writes `setupCompleted: true` (`context/AuthContext.tsx:2158-2181`), and a test locks in that rule (`tests/context/AuthContext.setupCompleted.test.tsx:273`). A profile doc lacking the field (`:1958`) and an existing Drive app folder (`:2230`) also count as complete.
- **Checklist widget.** `components/layout/DashboardView.tsx:450-472` adds type `onboarding` when every board is empty and `localStorage.spart_onboarding_shown` is unset, so it is tracked per device. Config is only `{completedTasks: []}`.
- **Default background.** `DEFAULT_BOARD_BACKGROUND` (`config/backgrounds.ts:2`) has been near-white `bg-brand-gray-lightest` since #3559 (2026-09-28), on `main` too. It is copied to `functions/src/mcp/boardBackgrounds.gen.ts` and assigned at `DashboardContext.tsx:2799` and `:4791`, `CreateFromTemplateModal.tsx:99` and `boardWrite.ts:1196`, `:1303`. `admin_backgrounds` holds presets with access level and `buildingIds`; no admin-set default exists.
- **Why the board looks dark.** A `bg-black/10` overlay covers every background (`components/layout/DashboardView.tsx:1763`), so `#f3f3f3` renders as about `#dbdbdb`.
- **Live tours.**
  - A tour is a Guided Learning set with `mode: 'tour'`, published to `building_guided_learning_tours/{setId}` (`components/tours/publishedTours.ts`).
  - `requestStartTour` (`tourState.ts:16`) starts one, and `/help/{itemId}` auto-runs it.
  - Step actions are `click`, `observe`, `toggle`, `select` and `type` (`types.ts:8665`). A click on the anchor advances immediately.
  - The runner plays on the real board and hides the teacher's widgets unless `useTeacherBoard` is set (`LiveTourRunner.tsx:881`). Tour widgets are unsaved `transient` ones. Switching boards ends the tour unless it follows a step click (`:1444`).
  - `runs/{uid}` is write-only for teachers (`firestore.rules:1440`), and resume is `sessionStorage` only (`tourResume.ts`).
  - `useCanRunLiveTour.ts` blocks phone widths.
- **Engine gaps.** Nothing today covers waiting on a result, per-step skip or permission conditions, tour chaining, teacher-readable progress, drag steps or resize anchors.
- **Sparty.** Code-defined 32x32 pixel grids with six poses (`idle`, `wave`, `point`, `cheer`, `think`, `oops`, `components/sparty/spartyFrames.ts:27`). He appears in tour dialogs but not tips (`LiveTourRunner.tsx:2082`). `useShowSparty` needs `spartyEnabled` and the `sparty` flag, which is admin-level (`config/featureDefaults.ts:988`, PT-25).
- **Drive.** Google sign-in requests `drive.file` (`config/firebase.ts:97`), so a new teacher has a Drive access token right after signing in, with no refresh token. `connectGoogleDrive` (`AuthContext.tsx:900`) tries silent GIS first, which never yields a refresh token. `captureOfflineGrant` (`:925`) runs the code flow, and only `DriveOfflineGrantCard` calls it. `hasRefreshToken: false` means Google withheld the refresh leg. The check that shows the card runs once per tab session and its result isn't saved (`:984`), and the card can't render under the wizard, so it misses a new teacher's first session. `DriveDisconnectBanner` is the alert teachers see (`App.tsx:797-798`). Rosters are saved as files in the teacher's Drive (`hooks/useRosters.ts`).
- **Help Center.** A `getting-started` category exists (`helpCenter.ts:16`) and `HelpCopyLinkButton` makes `/r/` short links to `/help/{id}`. 21 tours exist on the connector project checked, including reusable "Import ClassLink Rosters", "Adjust your SpartBoard user settings", "Find help in SpartBoard" and "Class Rosters & Groups".
- **Dev limits.** ClassLink and Schoology secrets are placeholders on `spartboard-dev`, so the Classes tour's live import and link can only be fully proven on prod.

## Decisions

### First run

- **D1.** A new teacher lands on their board with a short **Sparty welcome** offering Start and Later. Start runs the first tour at once, and each Essentials tour offers the next.
- **D2.** The **setup wizard is retired** completely. New teachers get the current 12 default dock tools, and its style step has no replacement. Picking a building later doesn't change the dock.
- **D3.** "Brand new" means the app created this account's first board, recorded by a new profile marker. It doesn't depend on `setupCompleted`.
- **D4.** Only brand-new accounts see the welcome. Existing teachers get one What's New note when the flag opens and are never interrupted.
- **D5.** After Later, or a tour closed partway, the welcome **never pops up again**. The sidebar item shows a dot and progress ("2 of 4") until Essentials are done, and the page has Resume.
- **D6.** On a phone-width first sign-in there is no welcome; it appears at the first sign-in on a bigger screen. On a phone the page shows progress and one short line saying tours need a bigger screen.
- **D7.** **Quiet start.** What's New, first-use tour offers and Drive alerts hold until Essentials are done or a limit passes (see Set at build). The teacher's first What's New starts from today, so there is no backlog. A widget that needs Drive still shows its own in-place message.

### Tours

- **D8.** Two tiers. **Essentials** are chained; **Next steps** are taken in any order.
- **D9.** Essentials order is **Profile, Connect Drive, Classes, Widgets**. Drive comes before classes because rosters are saved in Drive; this reverses Paul's first list on purpose.
- **D10.** A doing step **watches for the real result** and moves on by itself, with a Sparty cheer. "Skip for now" is always available; a skipped item shows as not done on the page. Tours never trap anyone.
- **D11.** Tours act on the **real board and really clean up**. The widget tour's last step closes its Timer, so nothing stays. The board tour creates a real board and collection and offers Keep or Remove at the end. This has to stay safe when a veteran replays a tour.
- **D12.** Tours and steps that can't apply are **hidden silently**, and progress counts only what the teacher can do. One tour per topic, with optional steps skipped, not a separate tour per setup.
- **D13.** **Checkmarks.** Setup tours (Profile, Drive, Classes) check off when the real thing is done, however it was done. Learning tours check off on finishing. Progress is per teacher across devices, and any tour can be replayed.
- **D14.** The Quick Access tour's reason: keep the Dock tucked away so students see your board, with your two most-used tools still one tap away.
- **D15.** Tour wording says **Team**, with PLC as one kind of Team. The `My PLCs` strings left over in the Quiz and Video Activity hints, `locales/en.json` and anchor labels get cleaned up.

| Tier       | Tour                 | Covers                                                                                     | Skipped when                                       | Checks off on                               |
| ---------- | -------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------- | ------------------------------------------- |
| Essentials | Profile              | Profile & Settings > Profile: buildings, grades, content areas                             | Buildings step: org has no buildings               | A building saved                            |
| Essentials | Connect Drive        | Approve staying connected to Drive (D19)                                                   | Whole tour: external users                         | Drive connected with a stored refresh token |
| Essentials | Classes              | My Classes > Import from ClassLink, then link to Schoology                                 | ClassLink off for building; Schoology step per D12 | At least one class imported                 |
| Essentials | Widgets              | Add a Timer, resize, drag, settings, behavior and style settings, minimize, restore, close | Nothing                                            | Tour finished                               |
| Next steps | Behavior             | Close warnings, alignment guides, spell check, remote control, Sparty                      | Spell check and Sparty steps by their flags        | Tour finished                               |
| Next steps | Dock                 | Edit the dock, Widget Library                                                              | Nothing                                            | Tour finished                               |
| Next steps | Board navigation     | Create and switch boards, create and switch collections                                    | Nothing                                            | Tour finished                               |
| Next steps | Backgrounds          | Change your background                                                                     | Nothing                                            | Tour finished                               |
| Next steps | Teams                | Create or join a Team under My Teams                                                       | External users                                     | Tour finished                               |
| Next steps | Boards & Collections | The Boards & Collections page                                                              | Nothing                                            | Tour finished                               |
| Next steps | Quick Access         | Set Quick Access tools, and why (D14)                                                      | Nothing                                            | Tour finished                               |
| Next steps | Find help            | Help Center; revise the existing tour                                                      | Nothing                                            | Tour finished                               |

### Getting Started page

- **D16.** A sidebar item directly **below What's New** opens its **own page** with Essentials, Next steps, per-teacher checks and Resume. It stays visible after the welcome is dismissed.
- **D17.** **Admins curate** the tours, order and tier in Admin Settings, with no deploy. A broken tour can be pulled in seconds.
- **D18.** **Sharing.** Each tour keeps its copy-link button, the page gets one link of its own, and the tours also list in Help Center's `getting-started` category.

### Drive

- **D19 (revised after P0).** Sign-in already connects Drive, so the Connect Drive tour teaches **Approve on "Stay connected to Drive"**, which stores the refresh token. That makes two Google popups across sign-in and the tour, the second from a deliberate click. A teacher who skips the tour still gets the card. `DriveDisconnectBanner` stays as the fallback. A single sign-in that does both is a separate investigation, not part of this project. The original D19 assumed a first-time Connect that doesn't happen.

### Sparty

- **D20.** Sparty appears on **every step of every Live tour**, about 64px at a whole-number scale, **perched on the tip's top-left corner**, with a pose that fits the step: `point` on click steps, `think` on reading steps, `cheer` at the end.
- **D21.** Tip wording never depends on him. Turning him off removes him and nothing else.
- **D22.** This project covers the welcome, tour tips and the Getting Started page, and opens his flag to teachers with this launch. Empty states, Help and widget celebrations become a follow-up list.

### Backgrounds and the checklist

- **D23.** New boards start on the existing **Snowy** gradient (`bg-gradient-to-br from-blue-100 via-white to-blue-50`). Older boards don't change.
- **D24.** **Admins can set a default** per building or district. A template's own background still wins.
- **D25.** When a teacher saves their first building, a first board still on the default switches to that building's default. A background they chose is never overwritten. With several buildings, the first listed wins.
- **D26.** The checklist widget is **removed entirely**: no more seeding, gone from the Widget Library, copies stripped from existing boards, code deleted.
- **D31 (added after P0).** The `bg-black/10` overlay is **removed everywhere**, so every background shows its true color. Existing boards get slightly brighter, which is why it's checked on a dark board and a photo before merging. It ships without a flag, as a styling change.

### Rollout and authoring

- **D27.** A `getting-started` preview flag (`defaultAccessLevel: 'admin'`, `stage: 'preview'`, `afterLaunch: 'retire'`) controls the new flow. Teachers keep the old wizard and checklist until Paul opens it. Admins always pass this gate, so "on for Paul" means Paul plus the other `/admins`.
- **D28.** A **separate Admin Settings switch** shows or hides the sidebar item, so hiding it later leaves the welcome working.
- **D29.** Admins get **Restart Getting Started** on the page, so Paul can test the welcome on his real account.
- **D30.** An **agent writes** each tour through the connector and dry-runs it on dev, where Paul reviews it. After the code reaches `main`, the agent recreates them on prod for Paul to test behind the flag. No dev-to-prod copy tool.

## Set at build

Paul can overrule these, and they're cheap to change.

- **Quiet-start limit (D7):** 7 days from the first sign-in.
- **Language:** tour text is English only for now.
- **Essentials finish:** a Sparty `cheer` with no confetti, per the purposeful-restraint rule, then the offer to look at Next steps.

## Non-goals

- Translating tours.
- Sparty anywhere beyond D22, new Sparty artwork, or any Sparty AI or sound.
- Popups or reminders after Later.
- Renaming student teams.
- A dev-to-prod tour copy tool.

## Build order

Each PR targets `dev-paul`. P1, P2 and P5 touch separate code; P4 needs P1, and P6 and P7 need the rest.

### P0. Probe, no PR (done 2026-11-06)

Run on `spartboard-dev` with `spartan.teacher@orono.k12.mn.us`, a Google account never used on dev, in the Browser pane on `localhost:3000`, once, from branch `student-list-retry`. The account isn't an org member on dev, so the wizard had no buildings step.

- **Wizard: reload path reproduced.** First sign-in showed the wizard, with "My First Board" saved and no profile. Reloading without finishing removed the wizard for good, wrote `setupCompleted: true`, and added the checklist widget. **D3 stands.**
- **First-session race: not reproduced.** This one run didn't lose it. It stays a reading of the code.
- **Checklist.** Its task titles are close to invisible, white on a white card.
- **Background.** Computed `#f3f3f3`, rendered about `#dbdbdb` through the overlay. **D31 added.**
- **Drive.** The access token was stored right after sign-in. The card didn't appear after the reload until the once-per-session flag was cleared by hand. Approve then stored `private/googleAuth` with a refresh token. **D19 revised.**
- **Not tested.** Google withholding the token after an earlier authorization. Whether this account had authorized the shared OAuth client before wasn't checked, and it did get a token.

Prod counts, read-only, accounts created since 2026-08-01 with a Google profile: 12 of 52 Orono org members are setup-complete with no building, though the wizard requires one for members. That fits the wizard being skipped, but some may have joined the org after first sign-in or cleared their building later.

### P1. Flag, progress and the page

- `getting-started` in `GlobalFeature`, `config/featureDefaults.ts` and `functions/src/featureMissingDoc.ts`.
- An `admin_settings` doc holding the curated list and the sidebar switch, with an Admin Settings UI (D17, D28); the switch goes in `config/rolloutSwitches.ts` if it fits.
- Per-teacher progress on the profile, readable by the client, since `runs/{uid}` is write-only (D13).
- The sidebar item and page, Resume, Restart, and the page's share link (D16, D18, D29), with tour anchors and a `config/tourSurfaces` entry.

### P2. Tour engine

All opt-in per step, so existing tours don't change.

- Done conditions a step waits on, with Skip always available (D10). Include the failure path: a declined Drive popup returns to the step with a retry.
- Show conditions per step and tour, covering flags, org setup and integrations (D12).
- Offer-next chaining between tours (D1, D8).
- A drag step and a resize step, with a resize anchor. Both need to work by finger on classroom panels.
- Keep tours running across a tour-driven board switch, and the Keep or Remove ending (D11).
- Real widgets instead of `transient` ones where a tour asks, with cleanup when a tour is abandoned.
- Connector schema, `dry_run` validation and `docs/live-tours/AUTHORING.md` updated together.

### P3. Sparty on tour tips

- `TourTip` renders Sparty per D20, using the existing `useShowSparty` gate, so teachers don't see him until `sparty` opens.
- Check the tether and viewport edges, since he overhangs the tip.
- Add the missing anchor on `BehaviorSection.tsx`'s Sparty toggle.

### P4. First run

- The first-board marker and welcome (D1, D3, D5), and phone wait (D6).
- Under the flag, skip `NewUserSetup` and the checklist seed.
- Quiet start (D7), which holds the Drive card except while the Connect Drive tour needs it.
- Keep the Drive check's result across a reload, so the card isn't lost for the rest of a session (D19). This fix isn't specific to new teachers, so it ships without the flag.
- A teacher's flag isn't known until role and permissions resolve, so the app must wait for that before it picks a flow. A brand-new teacher should never see the wizard flash.

### P5. Backgrounds

- Remove the overlay (D31), checking a dark board and a photo.
- Snowy as `DEFAULT_BOARD_BACKGROUND`, regenerating `boardBackgrounds.gen.ts`. It is a styling change, exempt from the flag.
- Admin defaults per building and district, and the first-building swap (D24, D25).

### P6. Anchors and copy cleanup

- Add the anchors the tours need that don't exist: Drive grant card and banner, Quick Access modal, background preset tile, and the Schoology paste box if missing.
- `My PLCs` cleanup (D15).

### P7. Tours on dev, data only

Run with the `spartboard` skill's live-tour guide, using the dev connector.

1. Write the 12 tours, reusing the existing ones listed above where they fit.
2. Dry-run each and fill the admin list on dev.
3. Paul reviews. The Classes tour's live import waits for prod (see Dev limits).

### Prod, then P8

1. Promote to `main` with `/promote`. The agent recreates the tours on prod and fills the admin list (D30).
2. Paul tests on his account with Restart, plus a true new account if he can spare one. Check Snowy on a classroom projector.
3. Paul opens `getting-started` and `sparty` to Public himself in Admin Settings > Access > Previews.
4. **P8:** after that, delete the wizard, the `setupCompleted` path and the checklist widget from every registration point (`types.ts`, `config/tools.ts`, `config/widgetDefaults.ts`, `config/widgetGradeLevels.ts`, `WidgetRegistry.ts`, analytics labels, the widget grader fixture and rubric scorecard, `locales/*`, the `functions/src/mcp` generated schemas). Strip saved `onboarding` widgets on load so a removed type never reaches the renderer (D26). Retire the flag's gate and add the `public/changelog.json` entry teachers read (D4).

## Risks

- **Tour engine size.** P2 is the largest piece and everything teachers feel depends on it. Build it against the Widgets and Board navigation tours, which are the hardest.
- **Real actions on replay.** A veteran replaying the board tour has real boards at stake, so Remove must only touch what that run created.
- **Google withholding the refresh token.** An earlier authorization can make Google skip the refresh leg, so a teacher who tried Drive before may not end up with a token even after Approve. P0 didn't test this case. The Connect Drive step needs an honest path for it, since its check-off depends on the token.
- **Firestore rules.** Rules are near their compiled size cap. Prefer existing profile paths, and run `node scripts/releaseFirestoreRules.mjs spartboard-dev` for any rules change.
- **Open tabs at release.** At the `main` release, rules and functions must tolerate a tab running the previous client.
- **Snowy on projectors.** Pale gradients can wash out; if it fails the classroom check, fall back to the flat brand tint (option B from the grill).
