# Paper markup editor

A teacher marks up a handwritten paper answer in the Quiz grader with highlights, boxes, circles, stamps and pinned comments. Saved comments drop a pin in one click, and marks made on an earlier scan show a notice.

## Sub-features

- `markup-tools` draws a highlight, box, circle, stamp or pin on the handwriting and undoes it.
- `markup-saved-comments` saves a comment for reuse and drops it as a pin from the pin menu.
- `markup-earlier-scan` shows the "made on an earlier scan" notice and its two actions.
- `markup-toolbar-wrap` shows the toolbar wrapping in groups at a narrow width.

## How to get to it (user POV)

- Quiz results, Grade Free Response, on a handwritten paper answer. The `paper-image-markup` preview flag must be on for the teacher.
- Verification path: the `/paper-markup-dev` harness, which mounts the real grader over canned paper answers. `?student=` picks the answer (`ada` ungraded, `priya` marked, `noor` marked on an earlier scan, `mika` and `theo` worst cases, `olive` an older stack with no markup). `?saved=N` seeds N saved comments (0 to 30, default 3).

## Driving it with the browser pane

Preconditions:

- Baseline from `README.md`, with the server on port 56320. Set the flag, then reload: `localStorage.authBypassFeatureOverrides = '{"paper-image-markup": true}'`. Without it the grader shows the plain image and no toolbar.
- Resize the tab to 1280x800.

- **Open.** `navigate` to `http://localhost:56320/paper-markup-dev?student=ada&saved=6`. The grader opens. `find "Markup tools"` returns the toolbar (`[data-tour="quiz-grading.markup-toolbar"]`) and the image has `[data-tour="quiz-grading.markup-canvas"]`.
- **Draw.** Click the `Box` button, then drag across the handwriting. A red box appears and the `Undo` button enables.
- **Saved comments.** Click `Choose a saved comment` (`quiz-grading.markup-pin-menu`). A menu lists 6 comments. Click one. The line under the toolbar reads `Click the image to add: <comment>`. Click the image twice. Two numbered pins appear and the comments are listed under the image.
- **Disarm.** Focus the image and press Escape. The line under the toolbar clears.
- **Save one.** Click `Comment pin`, click the image, type, then click `Save for reuse` (`quiz-grading.markup-save-comment`). The button turns into `Saved`.
- **Remove one.** Open the menu, click `Remove saved comment: <text>`. The row goes and `Comment removed.` with `Undo` appears.
- **Earlier scan.** `navigate` to `?student=noor`. A notice reads `These marks were made on an earlier scan.` (`quiz-grading.markup-earlier-scan`). Click `Looks right` to dismiss it, or `Clear marks` to remove the marks (then `Undo` brings them and the notice back).
- **Narrow toolbar.** `resize_window { width: 900, height: 800 }`. The toolbar wraps into two rows: the tools, then colour with undo, redo and delete. No button sits alone.
- **Proof.** `evidence.mjs new paper-markup-editor paper-markup-dev`; screenshot the open menu, an armed state, the notice and the 900 px toolbar, and `note` the visible strings.

## Gotchas

- The harness keeps saved comments and grades in the page only. A reload resets them. Whether saved comments survive a reload needs the real profile on `vite-dev`, and has not been checked there.
- Edits in a worktree need a server restart first: the watcher ignores `.claude/worktrees`.
- Markup disables itself when the stack has no sheet layout (`?student=olive`). The toolbar shows and its tools are off.
- Not yet proven end to end on a real backend; the harness proves rendering and wiring only.
