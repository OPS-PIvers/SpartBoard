# FormattingToolbar Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the TextWidget's FormattingToolbar into a single-row, grouped, responsive toolbar with ResizeObserver-driven overflow.

**Architecture:** The existing 2-row, 26-control FormattingToolbar is replaced by a single-row toolbar with 7 groups. Related controls (alignment, colors) are collapsed behind popout trigger buttons. A ResizeObserver measures available width and hides lower-priority groups into a `...` overflow menu when space is tight. The toolbar's z-index is bumped to sit just below the DraggableWindow toolbar.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, Lucide icons, `createPortal`, `ResizeObserver`

---

## File Structure

| File                                                       | Action  | Responsibility                                                             |
| ---------------------------------------------------------- | ------- | -------------------------------------------------------------------------- |
| `components/widgets/TextWidget/FormattingToolbar.tsx`      | Rewrite | Single-row grouped toolbar with popouts, ResizeObserver overflow           |
| `components/widgets/TextWidget/Widget.tsx`                 | Modify  | Update portal positioning, z-index, pass `bgColor`/`onBgColorChange` props |
| `components/widgets/TextWidget/FormattingToolbar.test.tsx` | Rewrite | Tests for new grouped layout, overflow, popouts                            |

---

### Task 1: Update Widget.tsx — Portal Positioning and New Props

**Files:**

- Modify: `components/widgets/TextWidget/Widget.tsx`

- [ ] **Step 1: Update portal z-index and positioning**

In `Widget.tsx`, find the portal wrapper div (around line 191). Change:

1. `className` from `"z-dropdown"` to use inline `style` with `zIndex: 11000` (just below `Z_INDEX.toolMenu` at 12000)
2. Remove `transform: 'translateY(-100%)'` — the toolbar now overlaps the widget top edge, not above it
3. Pass `bgColor` and `onBgColorChange` to FormattingToolbar

Replace the portal section:

```tsx
{
  isSelected &&
    toolbarPos &&
    createPortal(
      <div
        data-click-outside-ignore="true"
        style={{
          position: 'fixed',
          top: toolbarPos.top,
          left: toolbarPos.left,
          width: toolbarPos.width,
          zIndex: 11000,
          pointerEvents: 'auto',
        }}
      >
        <FormattingToolbar
          editorRef={editorRef}
          verticalAlign={verticalAlign}
          onVerticalAlignChange={(value) =>
            updateWidget(widget.id, {
              config: {
                ...config,
                verticalAlign: value,
              } as TextConfig,
            })
          }
          suppressInputRef={suppressInputRef}
          onContentChange={saveEditorContent}
          bgColor={bgColor}
          onBgColorChange={(color) =>
            updateWidget(widget.id, {
              config: {
                ...config,
                bgColor: color,
              } as TextConfig,
            })
          }
        />
      </div>,
      document.body
    );
}
```

- [ ] **Step 2: Verify types compile**

Run: `pnpm tsc --noEmit 2>&1 | head -30`

Expected: Errors about missing `bgColor`/`onBgColorChange` in `FormattingToolbarProps` (these will be fixed in Task 2). No other new errors.

- [ ] **Step 3: Commit**

```bash
git add components/widgets/TextWidget/Widget.tsx
git commit -m "feat(text-widget): update portal positioning and add bgColor props for toolbar redesign"
```

---

### Task 2: Rewrite FormattingToolbar — Core Structure and Button Groups

**Files:**

- Rewrite: `components/widgets/TextWidget/FormattingToolbar.tsx`

This is the largest task. We rewrite the toolbar from scratch with the new single-row grouped layout.

- [ ] **Step 1: Update FormattingToolbarProps interface**

Add the new props to the interface at the top of the file:

```tsx
interface FormattingToolbarProps {
  editorRef: React.RefObject<HTMLDivElement | null>;
  verticalAlign: 'top' | 'center' | 'bottom';
  onVerticalAlignChange: (value: 'top' | 'center' | 'bottom') => void;
  suppressInputRef: React.MutableRefObject<boolean>;
  onContentChange: () => void;
  bgColor: string;
  onBgColorChange: (color: string) => void;
}
```

- [ ] **Step 2: Keep existing helper code, rewrite the JSX**

Keep these existing pieces unchanged:

- `TOOLBAR_FONTS` array
- `MenuButton` component (reused for Font Family dropdown and new popouts)
- All hooks inside `FormattingToolbar`: `detectFontSize`, `useEffect` for selectionchange, `restoreSelection`, `exec`, `applyFontSize`, `handleLink`, click-outside `useEffect`

Destructure the new props:

```tsx
export const FormattingToolbar: React.FC<FormattingToolbarProps> = ({
  editorRef,
  verticalAlign,
  onVerticalAlignChange,
  suppressInputRef,
  onContentChange,
  bgColor,
  onBgColorChange,
}) => {
```

Add new state for the grouped menus (replace separate `showColorMenu`/`showHighlightMenu` with a single `showColorMenu` that contains all three swatches):

```tsx
const [showFontMenu, setShowFontMenu] = useState(false);
const [showColorMenu, setShowColorMenu] = useState(false);
const [showAlignMenu, setShowAlignMenu] = useState(false);
```

Add a helper to close all menus:

```tsx
const closeAllMenus = useCallback(() => {
  setShowFontMenu(false);
  setShowColorMenu(false);
  setShowAlignMenu(false);
}, []);
```

Update the click-outside effect to use `closeAllMenus`:

```tsx
useEffect(() => {
  const handleClickOutside = () => closeAllMenus();
  window.addEventListener('click', handleClickOutside);
  return () => window.removeEventListener('click', handleClickOutside);
}, [closeAllMenus]);
```

- [ ] **Step 3: Build the Text Style segmented control (B/I/U)**

Create a small inline component for the segmented B/I/U buttons:

```tsx
const TextStyleGroup = (
  <div className="flex items-center">
    <button
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => exec('bold')}
      className="flex items-center justify-center w-7 h-7 hover:bg-slate-100 transition-colors rounded-l border border-r-0 border-slate-200"
      title="Bold"
      aria-label="Bold"
    >
      <Bold className="w-3.5 h-3.5 text-slate-600" />
    </button>
    <button
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => exec('italic')}
      className="flex items-center justify-center w-7 h-7 hover:bg-slate-100 transition-colors border border-r-0 border-slate-200"
      title="Italic"
      aria-label="Italic"
    >
      <Italic className="w-3.5 h-3.5 text-slate-600" />
    </button>
    <button
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => exec('underline')}
      className="flex items-center justify-center w-7 h-7 hover:bg-slate-100 transition-colors rounded-r border border-slate-200"
      title="Underline"
      aria-label="Underline"
    >
      <Underline className="w-3.5 h-3.5 text-slate-600" />
    </button>
  </div>
);
```

- [ ] **Step 4: Build the Alignment popout**

Create the Alignment group as a `MenuButton` with a popout containing 4 sections:

```tsx
const AlignmentGroup = (
  <MenuButton
    icon={<AlignLeft className="w-3.5 h-3.5 text-slate-600" />}
    label="Alignment & Layout"
    isOpen={showAlignMenu}
    onClick={() => {
      setShowAlignMenu(!showAlignMenu);
      setShowFontMenu(false);
      setShowColorMenu(false);
    }}
  >
    <div className="w-40 p-1.5 space-y-1.5">
      {/* Justify */}
      <div>
        <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wider px-1 mb-0.5">
          Justify
        </div>
        <div className="flex gap-0.5">
          {[
            { icon: AlignLeft, cmd: 'justifyLeft', label: 'Align Left' },
            { icon: AlignCenter, cmd: 'justifyCenter', label: 'Align Center' },
            { icon: AlignRight, cmd: 'justifyRight', label: 'Align Right' },
          ].map((item) => (
            <button
              key={item.cmd}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => exec(item.cmd)}
              className="flex items-center justify-center w-8 h-8 rounded hover:bg-slate-100 transition-colors"
              title={item.label}
              aria-label={item.label}
            >
              <item.icon className="w-3.5 h-3.5 text-slate-600" />
            </button>
          ))}
        </div>
      </div>
      <div className="h-px bg-slate-100" />
      {/* Vertical */}
      <div>
        <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wider px-1 mb-0.5">
          Vertical
        </div>
        <div className="flex gap-0.5">
          {[
            {
              icon: AlignVerticalJustifyStart,
              value: 'top' as const,
              label: 'Align Top',
            },
            {
              icon: AlignVerticalJustifyCenter,
              value: 'center' as const,
              label: 'Align Middle',
            },
            {
              icon: AlignVerticalJustifyEnd,
              value: 'bottom' as const,
              label: 'Align Bottom',
            },
          ].map((item) => (
            <button
              key={item.value}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onVerticalAlignChange(item.value)}
              className={`flex items-center justify-center w-8 h-8 rounded transition-colors ${
                verticalAlign === item.value
                  ? 'bg-blue-100 text-blue-600'
                  : 'hover:bg-slate-100 text-slate-600'
              }`}
              title={item.label}
              aria-label={item.label}
            >
              <item.icon className="w-3.5 h-3.5" />
            </button>
          ))}
        </div>
      </div>
      <div className="h-px bg-slate-100" />
      {/* Indent */}
      <div>
        <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wider px-1 mb-0.5">
          Indent
        </div>
        <div className="flex gap-0.5">
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec('outdent')}
            className="flex items-center justify-center w-8 h-8 rounded hover:bg-slate-100 transition-colors"
            title="Decrease Indent"
            aria-label="Decrease Indent"
          >
            <Outdent className="w-3.5 h-3.5 text-slate-600" />
          </button>
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec('indent')}
            className="flex items-center justify-center w-8 h-8 rounded hover:bg-slate-100 transition-colors"
            title="Increase Indent"
            aria-label="Increase Indent"
          >
            <Indent className="w-3.5 h-3.5 text-slate-600" />
          </button>
        </div>
      </div>
      <div className="h-px bg-slate-100" />
      {/* Lists */}
      <div>
        <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wider px-1 mb-0.5">
          Lists
        </div>
        <div className="flex gap-0.5">
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec('insertUnorderedList')}
            className="flex items-center justify-center w-8 h-8 rounded hover:bg-slate-100 transition-colors"
            title="Bulleted List"
            aria-label="Bulleted List"
          >
            <List className="w-3.5 h-3.5 text-slate-600" />
          </button>
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec('insertOrderedList')}
            className="flex items-center justify-center w-8 h-8 rounded hover:bg-slate-100 transition-colors"
            title="Numbered List"
            aria-label="Numbered List"
          >
            <ListOrdered className="w-3.5 h-3.5 text-slate-600" />
          </button>
        </div>
      </div>
    </div>
  </MenuButton>
);
```

- [ ] **Step 5: Build the Color popout**

Create the Color group as a `MenuButton` with three sections (font color, highlight, background):

```tsx
const ColorGroup = (
  <MenuButton
    icon={<Palette className="w-3.5 h-3.5 text-slate-600" />}
    label="Colors"
    isOpen={showColorMenu}
    onClick={() => {
      setShowColorMenu(!showColorMenu);
      setShowFontMenu(false);
      setShowAlignMenu(false);
    }}
  >
    <div className="w-44 p-1.5 space-y-1.5">
      {/* Font Color */}
      <div>
        <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wider px-1 mb-0.5">
          Font Color
        </div>
        <div className="grid grid-cols-4 gap-1 p-1">
          {FONT_COLORS.map((c) => (
            <button
              key={`fc-${c}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => exec('foreColor', c)}
              className="w-6 h-6 rounded-full border border-slate-200 hover:scale-110 transition-transform"
              style={{ backgroundColor: c }}
              title={c}
            />
          ))}
        </div>
      </div>
      <div className="h-px bg-slate-100" />
      {/* Highlight */}
      <div>
        <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wider px-1 mb-0.5">
          Highlight
        </div>
        <div className="grid grid-cols-4 gap-1 p-1">
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec('hiliteColor', 'transparent')}
            className="w-6 h-6 rounded-full border border-slate-200 flex items-center justify-center hover:scale-110 transition-transform"
            title="None"
          >
            <div className="w-px h-4 bg-red-500 rotate-45" />
          </button>
          {PASTEL_PALETTE.map((c) => (
            <button
              key={`hl-${c}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => exec('hiliteColor', c)}
              className="w-6 h-6 rounded-full border border-slate-200 hover:scale-110 transition-transform"
              style={{ backgroundColor: c }}
              title={c}
            />
          ))}
        </div>
      </div>
      <div className="h-px bg-slate-100" />
      {/* Background Color */}
      <div>
        <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wider px-1 mb-0.5">
          Background
        </div>
        <div className="flex gap-1.5 p-1">
          {Object.values(STICKY_NOTE_COLORS).map((c) => (
            <button
              key={`bg-${c}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onBgColorChange(c)}
              className={`w-6 h-6 rounded-full border-2 hover:scale-110 transition-transform ${
                bgColor === c ? 'border-blue-500 scale-110' : 'border-slate-200'
              }`}
              style={{ backgroundColor: c }}
              title={c}
            />
          ))}
        </div>
      </div>
    </div>
  </MenuButton>
);
```

- [ ] **Step 6: Assemble the single-row toolbar JSX**

Replace the entire `return` statement. The toolbar is now a single `flex` row with dividers between groups:

```tsx
return (
  <div
    ref={toolbarRef}
    className="flex items-center gap-0.5 p-1 bg-white/95 backdrop-blur-sm border border-slate-200 shadow-md rounded-lg"
    onMouseDown={(e) => {
      if ((e.target as HTMLElement).tagName !== 'INPUT') {
        e.preventDefault();
      }
    }}
  >
    {/* Group 1: Font Family (Tier 1) */}
    <MenuButton
      icon={<Type className="w-3.5 h-3.5 text-slate-600" />}
      label="Font Family"
      isOpen={showFontMenu}
      onClick={() => {
        setShowFontMenu(!showFontMenu);
        setShowColorMenu(false);
        setShowAlignMenu(false);
      }}
    >
      <div className="flex flex-col gap-0.5 max-h-64 overflow-y-auto custom-scrollbar">
        {TOOLBAR_FONTS.map((f) => (
          <button
            key={f.id}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              const family =
                f.id === 'global'
                  ? window.getComputedStyle(editorRef.current ?? document.body)
                      .fontFamily
                  : f.family;
              exec('fontName', family);
              setShowFontMenu(false);
            }}
            className="text-left px-3 py-1.5 hover:bg-slate-50 rounded text-xs text-slate-700 whitespace-nowrap"
            style={{ fontFamily: f.family }}
          >
            {f.label}
          </button>
        ))}
      </div>
    </MenuButton>

    {/* Group 2: Font Size (Tier 1) */}
    <div className="flex items-center gap-0 rounded border border-slate-200 mx-0.5">
      <button
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => applyFontSize(currentFontSize - 1)}
        className="flex items-center justify-center w-5 h-6 hover:bg-slate-100 transition-colors rounded-l"
        title="Decrease font size"
        aria-label="Decrease font size"
      >
        <Minus className="w-2.5 h-2.5 text-slate-500" />
      </button>
      <input
        type="text"
        value={fontSizeInput}
        onFocus={(e) => e.target.select()}
        onChange={(e) => setFontSizeInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            const val = parseInt(fontSizeInput, 10);
            if (!Number.isNaN(val)) applyFontSize(val);
            e.preventDefault();
          }
        }}
        onBlur={() => {
          const val = parseInt(fontSizeInput, 10);
          if (!Number.isNaN(val)) {
            applyFontSize(val);
          } else {
            setFontSizeInput(String(currentFontSize));
          }
        }}
        className="w-7 h-6 text-center text-[10px] font-mono text-slate-600 border-x border-slate-200 bg-transparent outline-none"
        aria-label="Font size"
      />
      <button
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => applyFontSize(currentFontSize + 1)}
        className="flex items-center justify-center w-5 h-6 hover:bg-slate-100 transition-colors rounded-r"
        title="Increase font size"
        aria-label="Increase font size"
      >
        <Plus className="w-2.5 h-2.5 text-slate-500" />
      </button>
    </div>

    <div className="w-px h-4 bg-slate-200 mx-0.5" />

    {/* Group 3: Text Style B/I/U (Tier 1) */}
    {TextStyleGroup}

    <div className="w-px h-4 bg-slate-200 mx-0.5" />

    {/* Group 4: Alignment (Tier 2) */}
    {AlignmentGroup}

    <div className="w-px h-4 bg-slate-200 mx-0.5" />

    {/* Group 5: Color (Tier 2) */}
    {ColorGroup}

    <div className="w-px h-4 bg-slate-200 mx-0.5" />

    {/* Group 6: Link (Tier 2) */}
    <IconButton
      icon={<LinkIcon className="w-3.5 h-3.5" />}
      label="Hyperlink (Ctrl+K)"
      onClick={() => void handleLink()}
      size="sm"
      variant="ghost"
      onMouseDown={(e) => e.preventDefault()}
    />
  </div>
);
```

- [ ] **Step 7: Add the STICKY_NOTE_COLORS import**

At the top of the file, update the colors import:

```tsx
import { PASTEL_PALETTE, STICKY_NOTE_COLORS } from '@/config/colors';
```

- [ ] **Step 8: Add toolbarRef**

Add a ref for the toolbar container (used by ResizeObserver in Task 3):

```tsx
const toolbarRef = useRef<HTMLDivElement>(null);
```

- [ ] **Step 9: Verify types compile**

Run: `pnpm tsc --noEmit 2>&1 | head -30`

Expected: Clean compile (no errors).

- [ ] **Step 10: Commit**

```bash
git add components/widgets/TextWidget/FormattingToolbar.tsx
git commit -m "feat(text-widget): rewrite FormattingToolbar as single-row grouped layout with popouts"
```

---

### Task 3: Add ResizeObserver Overflow Logic

**Files:**

- Modify: `components/widgets/TextWidget/FormattingToolbar.tsx`

- [ ] **Step 1: Add overflow state and the MoreHorizontal icon import**

Add to the lucide-react import:

```tsx
import { ..., MoreHorizontal } from 'lucide-react';
```

Inside `FormattingToolbar`, add:

```tsx
const [showOverflowMenu, setShowOverflowMenu] = useState(false);
const groupRefs = useRef<(HTMLDivElement | null)[]>([]);
// 6 groups total: Font Family, Font Size, Text Style, Alignment, Color, Link
const [visibleCount, setVisibleCount] = useState(6);
```

Update `closeAllMenus`:

```tsx
const closeAllMenus = useCallback(() => {
  setShowFontMenu(false);
  setShowColorMenu(false);
  setShowAlignMenu(false);
  setShowOverflowMenu(false);
}, []);
```

- [ ] **Step 2: Add the ResizeObserver effect**

```tsx
useEffect(() => {
  const container = toolbarRef.current;
  if (!container) return;

  const overflowBtnWidth = 36;
  const hysteresis = 8;

  const measure = () => {
    const containerWidth = container.offsetWidth;
    const padding = 8; // p-1 = 4px each side
    const available = containerWidth - padding;
    let total = 0;
    let count = 0;

    for (let i = 0; i < 6; i++) {
      const el = groupRefs.current[i];
      if (!el) continue;
      const groupWidth = el.offsetWidth;
      const wouldNeedOverflow = i < 5; // last group doesn't need overflow btn
      const needed =
        total + groupWidth + (wouldNeedOverflow ? overflowBtnWidth : 0);

      if (needed <= available + hysteresis) {
        total += groupWidth;
        count = i + 1;
      } else {
        break;
      }
    }

    setVisibleCount((prev) => {
      const next = Math.max(1, count);
      return next === prev ? prev : next;
    });
  };

  const ro = new ResizeObserver(measure);
  ro.observe(container);
  requestAnimationFrame(measure);

  return () => ro.disconnect();
}, []);
```

- [ ] **Step 3: Wrap each group in a measured div and conditionally render**

Create a helper for setting group refs:

```tsx
const setGroupRef = useCallback(
  (index: number) => (el: HTMLDivElement | null) => {
    groupRefs.current[index] = el;
  },
  []
);
```

Update the JSX so each group is wrapped:

```tsx
{
  /* Group 1: Font Family (Tier 1) */
}
<div
  ref={setGroupRef(0)}
  className="flex items-center"
  style={
    visibleCount < 1
      ? { position: 'absolute', visibility: 'hidden' }
      : undefined
  }
>
  {/* ...font family MenuButton... */}
</div>;

{
  /* Group 2: Font Size (Tier 1) */
}
<div
  ref={setGroupRef(1)}
  className="flex items-center"
  style={
    visibleCount < 2
      ? { position: 'absolute', visibility: 'hidden' }
      : undefined
  }
>
  {/* ...font size stepper... */}
</div>;

{
  visibleCount >= 3 && <div className="w-px h-4 bg-slate-200 mx-0.5" />;
}

{
  /* Group 3: Text Style (Tier 1) */
}
<div
  ref={setGroupRef(2)}
  className="flex items-center"
  style={
    visibleCount < 3
      ? { position: 'absolute', visibility: 'hidden' }
      : undefined
  }
>
  {TextStyleGroup}
</div>;

{
  visibleCount >= 4 && <div className="w-px h-4 bg-slate-200 mx-0.5" />;
}

{
  /* Group 4: Alignment (Tier 2) */
}
<div
  ref={setGroupRef(3)}
  className="flex items-center"
  style={
    visibleCount < 4
      ? { position: 'absolute', visibility: 'hidden' }
      : undefined
  }
>
  {AlignmentGroup}
</div>;

{
  visibleCount >= 5 && <div className="w-px h-4 bg-slate-200 mx-0.5" />;
}

{
  /* Group 5: Color (Tier 2) */
}
<div
  ref={setGroupRef(4)}
  className="flex items-center"
  style={
    visibleCount < 5
      ? { position: 'absolute', visibility: 'hidden' }
      : undefined
  }
>
  {ColorGroup}
</div>;

{
  visibleCount >= 6 && <div className="w-px h-4 bg-slate-200 mx-0.5" />;
}

{
  /* Group 6: Link (Tier 2) */
}
<div
  ref={setGroupRef(5)}
  className="flex items-center"
  style={
    visibleCount < 6
      ? { position: 'absolute', visibility: 'hidden' }
      : undefined
  }
>
  <IconButton
    icon={<LinkIcon className="w-3.5 h-3.5" />}
    label="Hyperlink (Ctrl+K)"
    onClick={() => void handleLink()}
    size="sm"
    variant="ghost"
    onMouseDown={(e) => e.preventDefault()}
  />
</div>;
```

Note: We use `visibility: hidden` + `position: absolute` instead of removing from DOM so the ResizeObserver can still measure group widths for re-expansion.

- [ ] **Step 4: Add the overflow `...` button and popout**

At the end of the toolbar row, after the last group:

```tsx
{
  visibleCount < 6 && (
    <MenuButton
      icon={<MoreHorizontal className="w-3.5 h-3.5 text-slate-600" />}
      label="More options"
      isOpen={showOverflowMenu}
      onClick={() => {
        setShowOverflowMenu(!showOverflowMenu);
        setShowFontMenu(false);
        setShowColorMenu(false);
        setShowAlignMenu(false);
      }}
    >
      <div className="w-48 p-1.5 space-y-1.5">
        {visibleCount <= 2 && (
          <div>
            <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wider px-1 mb-0.5">
              Text Style
            </div>
            <div className="flex gap-0.5 p-1">
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => exec('bold')}
                className="flex items-center justify-center w-8 h-8 rounded hover:bg-slate-100 transition-colors"
                title="Bold"
                aria-label="Bold"
              >
                <Bold className="w-3.5 h-3.5 text-slate-600" />
              </button>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => exec('italic')}
                className="flex items-center justify-center w-8 h-8 rounded hover:bg-slate-100 transition-colors"
                title="Italic"
                aria-label="Italic"
              >
                <Italic className="w-3.5 h-3.5 text-slate-600" />
              </button>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => exec('underline')}
                className="flex items-center justify-center w-8 h-8 rounded hover:bg-slate-100 transition-colors"
                title="Underline"
                aria-label="Underline"
              >
                <Underline className="w-3.5 h-3.5 text-slate-600" />
              </button>
            </div>
          </div>
        )}
        {visibleCount <= 3 && (
          <div>
            <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wider px-1 mb-0.5">
              Alignment
            </div>
            <div className="flex flex-wrap gap-0.5 p-1">
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => exec('justifyLeft')}
                className="flex items-center justify-center w-8 h-8 rounded hover:bg-slate-100 transition-colors"
                title="Align Left"
                aria-label="Align Left"
              >
                <AlignLeft className="w-3.5 h-3.5 text-slate-600" />
              </button>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => exec('justifyCenter')}
                className="flex items-center justify-center w-8 h-8 rounded hover:bg-slate-100 transition-colors"
                title="Align Center"
                aria-label="Align Center"
              >
                <AlignCenter className="w-3.5 h-3.5 text-slate-600" />
              </button>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => exec('justifyRight')}
                className="flex items-center justify-center w-8 h-8 rounded hover:bg-slate-100 transition-colors"
                title="Align Right"
                aria-label="Align Right"
              >
                <AlignRight className="w-3.5 h-3.5 text-slate-600" />
              </button>
            </div>
            <div className="flex flex-wrap gap-0.5 p-1">
              {[
                {
                  icon: AlignVerticalJustifyStart,
                  value: 'top' as const,
                  label: 'Align Top',
                },
                {
                  icon: AlignVerticalJustifyCenter,
                  value: 'center' as const,
                  label: 'Align Middle',
                },
                {
                  icon: AlignVerticalJustifyEnd,
                  value: 'bottom' as const,
                  label: 'Align Bottom',
                },
              ].map((item) => (
                <button
                  key={item.value}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onVerticalAlignChange(item.value)}
                  className={`flex items-center justify-center w-8 h-8 rounded transition-colors ${
                    verticalAlign === item.value
                      ? 'bg-blue-100 text-blue-600'
                      : 'hover:bg-slate-100 text-slate-600'
                  }`}
                  title={item.label}
                  aria-label={item.label}
                >
                  <item.icon className="w-3.5 h-3.5" />
                </button>
              ))}
            </div>
            <div className="flex gap-0.5 p-1">
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => exec('outdent')}
                className="flex items-center justify-center w-8 h-8 rounded hover:bg-slate-100 transition-colors"
                title="Decrease Indent"
                aria-label="Decrease Indent"
              >
                <Outdent className="w-3.5 h-3.5 text-slate-600" />
              </button>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => exec('indent')}
                className="flex items-center justify-center w-8 h-8 rounded hover:bg-slate-100 transition-colors"
                title="Increase Indent"
                aria-label="Increase Indent"
              >
                <Indent className="w-3.5 h-3.5 text-slate-600" />
              </button>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => exec('insertUnorderedList')}
                className="flex items-center justify-center w-8 h-8 rounded hover:bg-slate-100 transition-colors"
                title="Bulleted List"
                aria-label="Bulleted List"
              >
                <List className="w-3.5 h-3.5 text-slate-600" />
              </button>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => exec('insertOrderedList')}
                className="flex items-center justify-center w-8 h-8 rounded hover:bg-slate-100 transition-colors"
                title="Numbered List"
                aria-label="Numbered List"
              >
                <ListOrdered className="w-3.5 h-3.5 text-slate-600" />
              </button>
            </div>
          </div>
        )}
        {visibleCount <= 4 && (
          <div>
            <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wider px-1 mb-0.5">
              Colors
            </div>
            <div className="grid grid-cols-4 gap-1 p-1">
              {FONT_COLORS.map((c) => (
                <button
                  key={`ofc-${c}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => exec('foreColor', c)}
                  className="w-6 h-6 rounded-full border border-slate-200 hover:scale-110 transition-transform"
                  style={{ backgroundColor: c }}
                  title={c}
                />
              ))}
            </div>
            <div className="grid grid-cols-4 gap-1 p-1">
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => exec('hiliteColor', 'transparent')}
                className="w-6 h-6 rounded-full border border-slate-200 flex items-center justify-center hover:scale-110 transition-transform"
                title="None"
              >
                <div className="w-px h-4 bg-red-500 rotate-45" />
              </button>
              {PASTEL_PALETTE.map((c) => (
                <button
                  key={`ohl-${c}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => exec('hiliteColor', c)}
                  className="w-6 h-6 rounded-full border border-slate-200 hover:scale-110 transition-transform"
                  style={{ backgroundColor: c }}
                  title={c}
                />
              ))}
            </div>
            <div className="flex gap-1.5 p-1">
              {Object.values(STICKY_NOTE_COLORS).map((c) => (
                <button
                  key={`obg-${c}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onBgColorChange(c)}
                  className={`w-6 h-6 rounded-full border-2 hover:scale-110 transition-transform ${
                    bgColor === c
                      ? 'border-blue-500 scale-110'
                      : 'border-slate-200'
                  }`}
                  style={{ backgroundColor: c }}
                  title={c}
                />
              ))}
            </div>
          </div>
        )}
        {visibleCount <= 5 && (
          <div>
            <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wider px-1 mb-0.5">
              Link
            </div>
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => void handleLink()}
              className="flex items-center gap-2 px-2 py-1.5 w-full hover:bg-slate-50 rounded text-xs text-slate-700"
            >
              <LinkIcon className="w-3.5 h-3.5" /> Insert Link
            </button>
          </div>
        )}
      </div>
    </MenuButton>
  );
}
```

- [ ] **Step 5: Verify types compile**

Run: `pnpm tsc --noEmit 2>&1 | head -30`

Expected: Clean compile.

- [ ] **Step 6: Commit**

```bash
git add components/widgets/TextWidget/FormattingToolbar.tsx
git commit -m "feat(text-widget): add ResizeObserver overflow with priority-based group collapsing"
```

---

### Task 4: Update Tests

**Files:**

- Rewrite: `components/widgets/TextWidget/FormattingToolbar.test.tsx`

- [ ] **Step 1: Write the new test file**

```tsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FormattingToolbar } from './FormattingToolbar';

const mockShowPrompt = vi.fn();
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({
    showPrompt: mockShowPrompt,
  }),
}));

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

describe('FormattingToolbar', () => {
  const mockEditorRef = {
    current: document.createElement('div'),
  } as React.RefObject<HTMLDivElement>;
  const mockVerticalAlignChange = vi.fn();
  const mockSuppressInputRef = { current: false };
  const mockOnContentChange = vi.fn();
  const mockOnBgColorChange = vi.fn();
  let execCommandMock: ReturnType<typeof vi.fn>;

  const renderToolbar = (
    props?: Partial<React.ComponentProps<typeof FormattingToolbar>>
  ) =>
    render(
      <FormattingToolbar
        editorRef={mockEditorRef}
        verticalAlign="top"
        onVerticalAlignChange={mockVerticalAlignChange}
        suppressInputRef={mockSuppressInputRef}
        onContentChange={mockOnContentChange}
        bgColor="#fef9c3"
        onBgColorChange={mockOnBgColorChange}
        {...props}
      />
    );

  beforeEach(() => {
    vi.clearAllMocks();
    mockSuppressInputRef.current = false;
    execCommandMock = vi.fn(() => true);
    document.execCommand = execCommandMock;
  });

  it('renders tier 1 controls: font family, font size, B/I/U', () => {
    renderToolbar();
    expect(screen.getByTitle('Font Family')).toBeInTheDocument();
    expect(screen.getByTitle('Decrease font size')).toBeInTheDocument();
    expect(screen.getByTitle('Increase font size')).toBeInTheDocument();
    expect(screen.getByTitle('Bold')).toBeInTheDocument();
    expect(screen.getByTitle('Italic')).toBeInTheDocument();
    expect(screen.getByTitle('Underline')).toBeInTheDocument();
  });

  it('renders tier 2 controls: alignment, colors, link', () => {
    renderToolbar();
    expect(screen.getByTitle('Alignment & Layout')).toBeInTheDocument();
    expect(screen.getByTitle('Colors')).toBeInTheDocument();
    expect(screen.getByTitle('Hyperlink (Ctrl+K)')).toBeInTheDocument();
  });

  it('calls execCommand when bold button is clicked', () => {
    renderToolbar();
    fireEvent.click(screen.getByTitle('Bold'));
    expect(execCommandMock).toHaveBeenCalledWith('bold', false, '');
  });

  it('calls execCommand when italic button is clicked', () => {
    renderToolbar();
    fireEvent.click(screen.getByTitle('Italic'));
    expect(execCommandMock).toHaveBeenCalledWith('italic', false, '');
  });

  it('calls execCommand when underline button is clicked', () => {
    renderToolbar();
    fireEvent.click(screen.getByTitle('Underline'));
    expect(execCommandMock).toHaveBeenCalledWith('underline', false, '');
  });

  it('opens font family menu and selects a font', () => {
    renderToolbar();
    fireEvent.click(screen.getByTitle('Font Family'));
    const lexendFont = screen.getByText('Lexend');
    fireEvent.click(lexendFont);
    expect(execCommandMock).toHaveBeenCalledWith(
      'fontName',
      false,
      'Lexend, sans-serif'
    );
  });

  it('increments font size via stepper button', () => {
    renderToolbar();
    fireEvent.click(screen.getByTitle('Increase font size'));
    expect(execCommandMock).toHaveBeenCalledWith('fontSize', false, '7');
  });

  it('opens alignment popout with sections', () => {
    renderToolbar();
    fireEvent.click(screen.getByTitle('Alignment & Layout'));
    expect(screen.getByText('Justify')).toBeInTheDocument();
    expect(screen.getByText('Vertical')).toBeInTheDocument();
    expect(screen.getByText('Indent')).toBeInTheDocument();
    expect(screen.getByText('Lists')).toBeInTheDocument();
  });

  it('calls onVerticalAlignChange from alignment popout', () => {
    renderToolbar();
    fireEvent.click(screen.getByTitle('Alignment & Layout'));
    fireEvent.click(screen.getByTitle('Align Bottom'));
    expect(mockVerticalAlignChange).toHaveBeenCalledWith('bottom');
  });

  it('executes justifyCenter from alignment popout', () => {
    renderToolbar();
    fireEvent.click(screen.getByTitle('Alignment & Layout'));
    fireEvent.click(screen.getByTitle('Align Center'));
    expect(execCommandMock).toHaveBeenCalledWith('justifyCenter', false, '');
  });

  it('opens color popout with three sections', () => {
    renderToolbar();
    fireEvent.click(screen.getByTitle('Colors'));
    expect(screen.getByText('Font Color')).toBeInTheDocument();
    expect(screen.getByText('Highlight')).toBeInTheDocument();
    expect(screen.getByText('Background')).toBeInTheDocument();
  });

  it('calls onBgColorChange when background color swatch is clicked', () => {
    renderToolbar();
    fireEvent.click(screen.getByTitle('Colors'));
    const bgSwatches = screen.getAllByTitle('#fef9c3');
    // Click the last match which is the background swatch
    fireEvent.click(bgSwatches[bgSwatches.length - 1]);
    expect(mockOnBgColorChange).toHaveBeenCalledWith('#fef9c3');
  });

  it('calls showPrompt when link button is clicked', async () => {
    mockShowPrompt.mockResolvedValue('https://google.com');
    renderToolbar();
    fireEvent.mouseDown(screen.getByTitle('Hyperlink (Ctrl+K)'));
    fireEvent.click(screen.getByTitle('Hyperlink (Ctrl+K)'));
    expect(mockShowPrompt).toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(execCommandMock).toHaveBeenCalledWith(
        'createLink',
        false,
        'https://google.com'
      );
    });
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `pnpm vitest run components/widgets/TextWidget/FormattingToolbar.test.tsx 2>&1`

Expected: All tests pass.

- [ ] **Step 3: Fix any failing tests and re-run**

Common fixes:

- If ResizeObserver is not mocked, add the global mock (already in the test file above)
- If titles don't match, update to match actual rendered titles
- If portal elements aren't found, ensure jsdom supports `createPortal`

- [ ] **Step 4: Commit**

```bash
git add components/widgets/TextWidget/FormattingToolbar.test.tsx
git commit -m "test(text-widget): rewrite FormattingToolbar tests for grouped single-row layout"
```

---

### Task 5: Lint, Type-Check, and Format

**Files:**

- All modified files

- [ ] **Step 1: Run type-check**

Run: `pnpm tsc --noEmit 2>&1 | head -50`

Expected: No errors.

- [ ] **Step 2: Run lint**

Run: `pnpm run lint 2>&1 | tail -30`

Expected: No errors or warnings.

- [ ] **Step 3: Run format**

Run: `pnpm run format 2>&1 | tail -10`

Then check: `pnpm run format:check 2>&1 | tail -10`

Expected: All files formatted.

- [ ] **Step 4: Run all TextWidget tests**

Run: `pnpm vitest run components/widgets/TextWidget/ 2>&1`

Expected: All tests pass.

- [ ] **Step 5: Fix any issues found and re-run**

If lint/type/format issues exist, fix them and re-run the failing checks.

- [ ] **Step 6: Commit (only if fixes were needed)**

```bash
git add components/widgets/TextWidget/
git commit -m "chore(text-widget): fix lint, format, and type-check issues"
```
