# 012 — Make Dock popovers rise from their icon instead of sliding in sideways

- **Status**: TODO
- **Commit**: c4edf53
- **Severity**: HIGH
- **Category**: Physicality & origin
- **Estimated scope**: 3 files, 5 inline-style lines and 3 class strings

## Problem

Three Dock popovers are centred on their icon with an inline `transform: 'translateX(-50%)'` (or `translateY(-50%)` for side docks), and enter with `tailwindcss-animate`'s `animate-in slide-in-from-*-2`.

The plugin's `enter` keyframe animates the `transform` property and defines only a `from` frame:

```js
// node_modules/tailwindcss-animate/index.js:170-175 — context only, do not edit
enter: {
	from: {
		opacity: "var(--tw-enter-opacity, 1)",
		transform:
			"translate3d(var(--tw-enter-translate-x, 0), var(--tw-enter-translate-y, 0), 0) scale3d(...) rotate(...)",
```

During the animation the keyframe's `transform` replaces the inline one. So the popover starts at `translate3d(0, 0.5rem, 0)`, which is not centred, and interpolates to `translateX(-50%)`. A 224px-wide popover therefore starts 112px to the right of where it belongs and slides diagonally into place, instead of rising 8px from its icon. This was derived from the code and has not been confirmed in a browser: step 1 confirms it.

```tsx
// components/layout/dock/ToolDockItem.tsx:166-177 — current ("Restorable" popover)
<GlassCard
  globalStyle={globalStyle}
  ref={popoverRef}
  style={{
    position: 'fixed',
    left: popoverPos.left,
    bottom: popoverPos.bottom,
    transform: 'translateX(-50%)',
    zIndex: Z_INDEX.popover,
  }}
  className="w-56 overflow-hidden animate-in slide-in-from-bottom-2 duration-200"
>
```

```tsx
// components/layout/Dock.tsx:1627-1638 — current (live session popover)
<GlassCard
  globalStyle={globalStyle}
  ref={livePopoverRef}
  style={{
    position: 'fixed',
    left: livePopoverPos.left,
    bottom: livePopoverPos.bottom,
    transform: 'translateX(-50%)',
    zIndex: Z_INDEX.popover,
  }}
  className="w-64 overflow-hidden animate-in slide-in-from-bottom-2 duration-200"
>
```

```tsx
// components/layout/dock/FolderItem.tsx:182-229 — current (folder popover, three dock positions)
<GlassCard
  globalStyle={globalStyle}
  ref={popoverRef}
  style={
    dockPosition === 'left'
      ? {
          position: 'fixed',
          left: anchorRect.right + 12,
          top: Math.max(12, Math.min(anchorRect.top + anchorRect.height / 2, window.innerHeight - 12)),
          transform: 'translateY(-50%)',
          zIndex: Z_INDEX.popover,
        }
      : dockPosition === 'right'
        ? {
            position: 'fixed',
            right: window.innerWidth - anchorRect.left + 12,
            top: Math.max(12, Math.min(anchorRect.top + anchorRect.height / 2, window.innerHeight - 12)),
            transform: 'translateY(-50%)',
            zIndex: Z_INDEX.popover,
          }
        : {
            position: 'fixed',
            left: anchorRect.left + anchorRect.width / 2,
            bottom: window.innerHeight - anchorRect.top + 12,
            transform: 'translateX(-50%)',
            zIndex: Z_INDEX.popover,
          }
  }
  className={`w-64 p-4 animate-in duration-200 ${
    dockPosition === 'left'
      ? 'slide-in-from-left-2'
      : dockPosition === 'right'
        ? 'slide-in-from-right-2'
        : 'slide-in-from-bottom-2'
  }`}
>
```

(The `top:` expressions are wrapped over several lines in the file; they are shown on one line here. Do not reformat them.)

These popovers also have no fade, so they appear at full opacity on their first frame.

## Target

Centre each popover with the individual CSS `translate` property instead of `transform`. `translate` and `transform` are separate properties that the browser composes, so the keyframe's `transform` no longer overrides the centring. The popover then moves only the 8px (`0.5rem`) the slide class asks for. Add `fade-in` so it also fades from opacity 0.

Exact replacements:

| File                                                        | Current inline style line        | Target inline style line |
| ----------------------------------------------------------- | -------------------------------- | ------------------------ |
| `components/layout/dock/ToolDockItem.tsx:173`               | `transform: 'translateX(-50%)',` | `translate: '-50% 0',`   |
| `components/layout/Dock.tsx:1634`                           | `transform: 'translateX(-50%)',` | `translate: '-50% 0',`   |
| `components/layout/dock/FolderItem.tsx` (dock left branch)  | `transform: 'translateY(-50%)',` | `translate: '0 -50%',`   |
| `components/layout/dock/FolderItem.tsx` (dock right branch) | `transform: 'translateY(-50%)',` | `translate: '0 -50%',`   |
| `components/layout/dock/FolderItem.tsx` (bottom branch)     | `transform: 'translateX(-50%)',` | `translate: '-50% 0',`   |

Class strings:

```tsx
// components/layout/dock/ToolDockItem.tsx — target
className="w-56 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200"

// components/layout/Dock.tsx — target
className="w-64 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200"

// components/layout/dock/FolderItem.tsx — target (only `fade-in` added)
className={`w-64 p-4 animate-in fade-in duration-200 ${
```

Duration stays `200ms`. The curve comes from plan 010's global rule if it is merged (`cubic-bezier(0.23, 1, 0.32, 1)`); this plan does not depend on it and must not add an `ease-*` class.

## Repo conventions to follow

- Popovers are rendered through `createPortal` inside a `GlassCard`; `components/common/GlassCard.tsx:67-80` spreads the caller's `style` last, so an inline `translate` reaches the element unchanged.
- React's `CSSProperties` type accepts `translate` as a string. No cast is needed; never add `as`.
- Exemplar of a popover that already fades and slides: `components/layout/BoardActionsFab.tsx:138` (`animate-in fade-in slide-in-from-bottom-2 duration-150`).
- Comments are one short line at most.

## Steps

1. Reproduce first. Start `vite-dev` (port 3000), sign in, open a board, add a widget and minimize it so its Dock icon shows a badge. In the DevTools Animations panel set playback to 10%, then click that Dock icon. Watch whether the "Restorable" popover starts off to the right and travels sideways. If it rises straight up with no sideways travel, the problem does not reproduce: STOP and report, changing nothing.
2. In `components/layout/dock/ToolDockItem.tsx`, change line 173 and the class string on line 176 as shown in Target.
3. In `components/layout/Dock.tsx`, change line 1634 and the class string on line 1637 as shown in Target.
4. In `components/layout/dock/FolderItem.tsx`, change the three `transform:` lines inside the style ternary (lines 182-221) and add `fade-in` to the class string that starts on line 222, as shown in Target.
5. Change nothing else.

## Boundaries

- Do NOT change how `popoverPos`, `livePopoverPos` or `anchorRect` are measured, and do NOT change `left`, `right`, `top`, `bottom` or `zIndex`.
- Do NOT touch `const style = { transform: CSS.Translate.toString(transform), ... }` in `ToolDockItem.tsx` (around line 146). That is the drag-and-drop transform of the Dock item itself, not the popover.
- Do NOT change durations or add `zoom-in-*`, `origin-*` or `ease-*` classes.
- Do NOT touch the Dock expand and collapse transition (plan 011) or press feedback (plan 014).
- Do NOT add new dependencies, a feature flag or a changelog entry: this is a bug fix in styling.
- If any excerpt does not match the code you find, STOP and report instead of improvising.

## Verification

- **Mechanical**: run `pnpm exec vitest related --run components/layout/dock/ToolDockItem.tsx components/layout/dock/FolderItem.tsx components/layout/Dock.tsx` and expect it to pass. Commit; the pre-commit hook is the lint gate. Do not run full lint, full tests, `tsc` or `pnpm run validate`.
- **Feel check**, with Animations playback at 10%:
  - Click a Dock icon that has minimized widgets. The popover must appear horizontally centred over the icon from its first frame, rise 8px and fade in. There must be no sideways travel.
  - Click a Dock folder: same check.
  - Start a live session and click the red Live icon in the Dock: same check.
  - Move the Dock to the left edge, then the right edge (Settings > Dock > Position, `components/settingsModal/sections/DockSection.tsx`), and open a folder each time. The popover must be vertically centred on the icon from its first frame and slide 8px away from the Dock edge.
  - Compare the resting position of each popover with a screenshot taken before the change: it must be identical once the animation ends.
  - Toggle `prefers-reduced-motion: reduce`: the popovers still appear (entrances are kept under reduced motion in this repo) and are correctly positioned.
- **Done when**: all three popovers are centred on their trigger for the whole animation at 10% playback, in all three Dock positions, and their resting positions are unchanged.
