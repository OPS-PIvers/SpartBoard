# Import: any Source into SpartBoard

Status: planned 2026-10-29 (grill with Paul). Not built. Terms are defined in `GLOSSARY.md`; the
extension-side reading decision is `docs/adr/0001-platform-readers-run-in-the-extension.md`.

## Goal

A teacher has something (a web page, a PDF, a slide deck, a photo of a worksheet, a Schoology item,
a Google Form, a Quizlet set) and wants it in SpartBoard. One **Import** takes any **Source** and
offers what it can become: a **Library item** by **Conversion**, or **Reference material** on a
board. Schoology is one Source among many. This picks up the out-of-scope list of
`docs/plans/shipped/SCHOOLOGY_QUIZ_IMPORT.md` (pages, files, links, discussions, rubrics).

## What we have today (facts, 2026-10-29)

- The shared `ImportWizard` (`components/common/library/importer/`) has per-widget adapters:
  - Quiz: Sheet, CSV, PDF, DOCX, ODT, RTF, Google Doc, ExamView `.tst`, `.imscc`, photos. Parsers first, AI fallback through `quiz-document-import`.
  - Question banks: `.imscc`.
  - Flashcards: CSV, Sheet, two pasted columns.
  - Guided Learning: `.gl.json`. AI from images.
  - Mini App: `.html`.
  - Video activity: timestamped CSV. AI from YouTube.
  - Notebooks: `.notebook`, `.olf`, `.spartnb`.
  - Rubrics: CSV.
- No file importer exists for Activity Walls, boards, projects or live tours; only the Claude connector creates them.
- Embed takes URLs and rewrites YouTube, Drive and Slides links. The PDF widget stores uploads in Drive (or Storage). Links holds url, title and an image.
- The extension has `<all_urls>` host permission and injects scripts on demand. Only the web-tour recorder and the Schoology readers read pages.
- `functions/src/linkPreview.ts` already fetches any public URL server-side behind SSRF guards (`ssrfGuard.ts`).

## Decisions

### Shape

- **D1 One Import.** It starts from the library sidebar, or by dropping a file, URL or text anywhere on a board. Each widget's own Import button becomes a shortcut into it with the target preset.
- **D2 Teacher picks the target.** Import lists every target the Source can feasibly become, with a cheap guess preselected that costs no AI. For example, numbered questions suggest Quiz, a two-column table suggests Flashcards, and a slide deck suggests Notebook. AI runs only after the teacher picks.
- **D3 Parser first, AI fallback, always review.** Use a deterministic reader where the Source has structure, and AI through `generateAi` otherwise. Every result lands in that widget's review screen before it saves.
- **D4 Landing.** Every Conversion saves a Library item. When the import started from a drop on a board, or the result is Reference material, the matching widget is also placed on that board.
- **D5 Copy or link.**
  - Reference material stays a link or embed.
  - Anything converted is copied in.
  - Exception: the teacher's own files (from Schoology or Drive) are copied to their Drive, because Schoology links need a Schoology sign-in and break when a course is archived.
- **D6 Embed refused.** When a site blocks framing, Import says so and offers a Conversion instead of placing a blank Embed.
- **D7 Attribution, teacher only.** It shows as one line in the library preview pane (`LibraryPreviewPane.tsx`) and under the editor title, for example "Imported from Quizlet · <title>", linked to the Source. Students never see it.

### Version 1 Conversions

- **D8 Flashcards** from any document or page.
- **D9 Notebook or Guided Learning** from slides (PPTX, Google Slides, Canva) and PDFs.
  - Each page becomes a pixel-exact image plus its extracted text, used for search, read-aloud and step text.
  - PPTX is converted through the teacher's Drive, then rendered.
- **D10 Activity Wall** from a discussion prompt, and never from student posts.
- **D11 Board** from a web page or document, through the AI boards engine.
- **D12 Embeds** of slides, documents and websites as Reference material.
- **D13 Photos** become a quiz or flashcards through OCR, or go on the board as a sticker.

### Extension

- **D14 One Send to SpartBoard button.**
  - It recognises the page. A **Platform reader** handles a known site, and the generic read handles everything else. The Schoology button becomes this button.
  - The generic read takes the main content (article-style extraction) with image URLs, title and URL. When the teacher has text selected, it takes only the selection.
  - It reads only on a click, and it never sends form field values.
- **D15 Hiding the button.**
  - The floating button collapses to a tab on the page edge that expands on hover.
  - The side panel has "Hide on this site" and a global "Show Send button on pages" switch.
  - The toolbar icon and the right-click "Send to SpartBoard" menu item always work.
- **D16 Send block list.**
  - Admins curate it for the whole district in Admin Settings, as URL patterns.
  - It starts with the student information system and Schoology's gradebook, submissions, members and attendance pages.
  - Every Send is refused on those pages, Platform readers included, and the button is hidden there.
  - The server fetch of a pasted URL obeys the list too.
- **D17 A pasted public URL** uses the server fetch (the `linkPreview` guards). When a site blocks Google Cloud or needs a sign-in, Import says to use the extension.
- **D18 Reader breaks.** When a Platform reader can't find what it expects, Send falls back to the generic read with AI Conversion (still reviewed) and logs the failure for admins.

### Schoology leftovers

- **D19 Both routes.** The deterministic `.imscc` reader is extended to pages, files, links and discussion prompts. The Send button covers single items and rubrics, which are not in cartridges.
- **D20 Pages** are handled like any web page (D2).
- **D21 Files** are copied to the teacher's Drive and filed in the PDF library.
- **D22 Rubrics** come in through Send and become Rubric Library items. Media albums are out of scope.
- **D23 Bulk folders.**
  - A cartridge or Materials checklist mirrors Schoology's folders as library folders under one folder named after the course.
  - Each row has a target dropdown with the guess preselected.
  - Parser-only rows save immediately. AI rows queue, and each one lands in review after the teacher confirms the list.
- **D24 Links in bulk.** The finish screen lists the links, with one button: "Put these links on a new board". That board holds a Links widget and is filed in the matching folder. Nothing is placed unless the teacher clicks.

### Platform readers

- **D25 Readers to build.** All are exact and use no AI.

| Platform                                                               | Becomes                                                             |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Google Forms, Microsoft Forms                                          | Quiz                                                                |
| Kahoot, Quizizz, Blooket, Formative, Socrative                         | Quiz                                                                |
| Canvas and QTI export files (file route, reusing the cartridge reader) | Quiz, question bank                                                 |
| Newsela, CommonLit, ReadWorks                                          | Quiz with a text passage                                            |
| Quizlet, Gimkit, Wordwall, Blooket sets, Boom Cards, Deck.Toys         | Flashcards                                                          |
| Edpuzzle                                                               | Video activity                                                      |
| YouTube                                                                | Video activity or Embed                                             |
| Padlet, Flip                                                           | Activity Wall prompt (the teacher's own prompt and seed posts only) |
| Pear Deck, Nearpod, Canva                                              | Notebook or Guided Learning                                         |
| Mentimeter, Slido                                                      | Poll widget                                                         |
| Google Classroom                                                       | Quiz and links                                                      |

- **D26 Non-YouTube video (revised 2026-10-31 by D31).** An Edpuzzle whose video Edpuzzle hosts itself (a teacher upload or a partner clip) is refused with a plain message; nothing imports.
- **D27 Fixtures.** Before each reader PR, Paul sends one sample link to an item he owns or can view. The agent probes it read-only in Chrome and saves a fixture with student data removed, and the reader is tested against it. Edpuzzle exception: D36.

### Video imports (grill with Paul, 2026-10-31)

- **D30 Edpuzzle Sources.** Any Edpuzzle lesson the teacher can open (their own, a colleague's, Edpuzzle's library) imports, with the D7 attribution line.
- **D31 YouTube only.** The reader takes the YouTube id from the lesson's own data. Edpuzzle-hosted videos are refused (D26).
- **D32 Question mapping, exact and at the same timestamps.**
  - Multiple choice stays MC; multiple choice with more than one correct answer becomes MA.
  - Open-ended becomes a new **short-answer** Video Activity type: counted as answered, marked by the teacher in results, and left out of the auto score until marked (as Quiz does).
  - Notes become a new **note stop**: the video pauses on text (and images) with no response.
  - Images in prompts carry over. Audio or video in notes and voiceovers come in as text only, with a warning in review.
- **D33 Clip range.** Edpuzzle start/end trims become a new optional start/end on the activity, honoured by the student player and editable in the editor. Timestamps stay absolute.
- **D34 YouTube entry.** The Send button on YouTube watch pages and youtu.be links offers Video activity or Embed. Video activity opens the Video Activity editor prefilled with title, link and length; nothing saves until the teacher saves (D3). Shorts and the right-click menu are out of scope. The block list (D16) applies.
- **D35 Flags.**
  - Edpuzzle and YouTube Send ride `universal-import` (D29).
  - A new preview flag `video-activity-stops` gates short answer, note stops and the clip range in the editor and player.
  - A new admin-only flag `video-import-ai` shows "Generate questions with AI" on a YouTube import, using the existing `generateVideoActivity` with its existing `video-activity-ai` permission and daily caps.
- **D36 Edpuzzle fixture (revised 2026-10-31).** Two public lessons were probed read-only on 2026-10-31. Send fetches `edpuzzle.com/api/v3/media/<id>` from the lesson page with the teacher's own Edpuzzle sign-in.
  - **Video:** `source` is `youtube` with `videoId` the YouTube id, or `edpuzzle` for a video Edpuzzle hosts (refused, D26).
  - **Trim:** `sections[]` are back-to-back kept pieces; the first start and last end against `originalVideoDuration` give the clip, and a cut in the middle plays through.
  - **Content:** `questions[]` (`multiple-choice` with `choices[].isCorrect`, `open-ended`) and `notes[]` carry a `time` in seconds and HTML bodies, read as plain text. The first https `<img>` in a question or note prompt is copied through `fetchImportImage` into the teacher's Drive (`Assets/QuizStimuli`, shared by link like quiz stimuli) and shown with the stop; pictures in choices are left out. No real lesson with a picture has been probed yet, so the `<img>` source shape is unconfirmed.
  - **Video only:** a YouTube lesson with no questions or notes imports as a watch-only activity, where `video-import-ai` can add questions.
  - **Keys:** public data marks every choice `isCorrect: false`. A question with no marked choice imports with `needsKey`; it saves, and Assign stays blocked until the teacher marks it.
  - **Fixture:** `extension/src/edpuzzle/fixtures/youtubeLesson.json` is a public YouTube lesson with its owner removed. One Send of a lesson Paul owns on the dev extension confirms whether owner data includes the key, before the release that opens it.
- **D37 Build order.** (1) Video Activity short answer, note stops, clip range; (2) YouTube Send route and `video-import-ai`; (3) Edpuzzle reader.

### Guards and release

- **D28 AI cost.**
  - Each import queues at most 25 AI Conversions at once; the rest wait for the teacher to continue.
  - An `admin_settings` kill switch for AI Conversion has its own toggle in the admin panel and ships off on dev until it is tested.
  - Parser routes are never limited.
- **D29 One preview flag**, `universal-import` (admin, `stage: 'preview'`, `afterLaunch: 'retire'`). It gates Import, drop-to-import and the any-page Send. Existing per-widget imports are untouched.
  - To open it: Admin Settings > Access > Previews > set to Public.

## Feasibility map

How each Source becomes each target. "Parser" means exact and needs no AI; "AI" means Conversion with review; "—" means not offered.

| Source                     | Quiz                 | Flashcards   | Notebook / GL        | Activity Wall        | Board                | Reference                                  |
| -------------------------- | -------------------- | ------------ | -------------------- | -------------------- | -------------------- | ------------------------------------------ |
| PDF, DOCX, Google Doc      | Parser → AI (exists) | AI           | Parser (page images) | AI (prompt)          | AI                   | PDF widget / Embed                         |
| PPTX, Google Slides, Canva | AI                   | AI           | Parser (page images) | —                    | AI                   | Embed                                      |
| Photo or screenshot        | OCR → AI (exists)    | OCR → AI     | —                    | —                    | —                    | Sticker                                    |
| Generic web page           | AI                   | AI           | AI                   | AI (prompt)          | AI                   | Embed, or Conversion if framing is blocked |
| `.imscc`, QTI              | Parser (exists)      | —            | Parser (pages)       | Parser (discussions) | —                    | Links, files                               |
| Schoology item via Send    | Parser (exists)      | —            | via the generic read | Parser (discussion)  | via the generic read | Links, files                               |
| Platform reader sites      | Parser (D25)         | Parser (D25) | Parser (D25)         | Parser (D25)         | —                    | Embed                                      |

Not feasible or out of scope:

- Managed Assessments (AMP) and media albums.
- Student data or responses from any site.
- Videos that aren't on YouTube (refused, D26).
- Sites with no readable content: Desmos, Khan Academy, IXL, DRM ebooks.

## Build order

### Wave 1: core

1. The flag, the Import entry point and drop-to-import. Source detection and target guessing route into the existing adapters' review screens. Attribution is stored and shown.
2. The Flashcards, Notebook/GL, Activity Wall and Board Conversions (D8–D11), plus Embeds with the framing check (D6, D12) and photo stickers (D13).
3. Extension: the one button with the generic read, the edge tab and hiding (D14, D15), the Send block list in Admin Settings (D16), and the reader fallback with logging (D18). The pasted-URL server fetch (D17).
4. Schoology leftovers: the cartridge reader extended to pages, files, links and discussions; Send for rubrics and discussions; bulk folders and per-row targets (D19–D24); the AI cap and kill switch (D28).

### Wave 2: most-used readers

Google Forms, Quizlet, Edpuzzle, YouTube, and Canvas/QTI files.

### Wave 3: the rest

Paul ranks the remaining readers by how many district teachers use each, before the wave starts.

Each wave needs an extension store release when it touches the extension; the server side has to
reach `main` before the store item is published.

## Out of scope

- Writing back to any site.
- Student posts, responses, grades or rosters from any Source.
- Two-way sync or keeping an import updated when its Source changes.
- Schoology Managed Assessments and media albums.
