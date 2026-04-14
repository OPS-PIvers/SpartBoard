import React, {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
} from 'react';
import { createPortal } from 'react-dom';
import {
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignVerticalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  List,
  ListOrdered,
  Indent,
  Outdent,
  Type,
  Palette,
  Link as LinkIcon,
  ChevronDown,
  Minus,
  Plus,
  MoreHorizontal,
} from 'lucide-react';
import { IconButton } from '@/components/common/IconButton';
import { FONT_COLORS } from '@/config/fonts';
import { PASTEL_PALETTE, STICKY_NOTE_COLORS } from '@/config/colors';
import { useDialog } from '@/context/useDialog';

interface FormattingToolbarProps {
  editorRef: React.RefObject<HTMLDivElement | null>;
  configFontSize: number;
  verticalAlign: 'top' | 'center' | 'bottom';
  onVerticalAlignChange: (value: 'top' | 'center' | 'bottom') => void;
  suppressInputRef: React.MutableRefObject<boolean>;
  onContentChange: () => void;
  bgColor: string;
  onBgColorChange: (color: string) => void;
}

const TOOLBAR_FONTS = [
  { id: 'global', label: 'Default', family: 'inherit' },
  { id: 'font-sans', label: 'Lexend', family: 'Lexend, sans-serif' },
  { id: 'font-serif', label: 'Merriweather', family: 'Merriweather, serif' },
  {
    id: 'font-mono',
    label: 'Roboto Mono',
    family: 'Roboto Mono, monospace',
  },
  {
    id: 'font-handwritten',
    label: 'Patrick Hand',
    family: 'Patrick Hand, cursive',
  },
  { id: 'font-comic', label: 'Comic Neue', family: 'Comic Neue, cursive' },
  {
    id: 'font-rounded',
    label: 'Varela Round',
    family: 'Varela Round, sans-serif',
  },
  { id: 'font-fun', label: 'Fredoka', family: 'Fredoka, sans-serif' },
  { id: 'font-slab', label: 'Roboto Slab', family: 'Roboto Slab, serif' },
  { id: 'font-retro', label: 'VT323', family: 'VT323, monospace' },
  {
    id: 'font-marker',
    label: 'Permanent Marker',
    family: 'Permanent Marker, cursive',
  },
  {
    id: 'font-cursive',
    label: 'Dancing Script',
    family: 'Dancing Script, cursive',
  },
];

const MenuButton: React.FC<{
  icon: React.ReactNode;
  label: string;
  onClick: (e: React.MouseEvent) => void;
  isOpen: boolean;
  children: React.ReactNode;
}> = ({ icon, label, onClick, isOpen, children }) => {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({
    top: 0,
    left: 0,
  });

  useLayoutEffect(() => {
    if (!isOpen || !buttonRef.current) {
      return;
    }

    const updatePosition = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }

      setMenuStyle({
        position: 'fixed',
        top: rect.bottom + 4,
        left: rect.left,
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen]);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          e.stopPropagation();
          onClick(e);
        }}
        className={`flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-100 transition-colors ${isOpen ? 'bg-slate-100' : ''}`}
        title={label}
      >
        {icon}
        <ChevronDown className="w-2.5 h-2.5 text-slate-400" />
      </button>
      {isOpen &&
        createPortal(
          <div
            className="p-1 bg-white border border-slate-200 rounded-lg shadow-xl z-dropdown min-w-[120px] animate-in fade-in zoom-in-95 duration-100"
            data-click-outside-ignore="true"
            style={menuStyle}
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => e.stopPropagation()}
          >
            {children}
          </div>,
          document.body
        )}
    </div>
  );
};

export const FormattingToolbar: React.FC<FormattingToolbarProps> = ({
  editorRef,
  configFontSize,
  verticalAlign,
  onVerticalAlignChange,
  suppressInputRef,
  onContentChange,
  bgColor,
  onBgColorChange,
}) => {
  const { showPrompt } = useDialog();
  const [showFontMenu, setShowFontMenu] = useState(false);
  const [showColorMenu, setShowColorMenu] = useState(false);
  const [showAlignMenu, setShowAlignMenu] = useState(false);
  const [showOverflowMenu, setShowOverflowMenu] = useState(false);
  const [currentFontSize, setCurrentFontSize] = useState(configFontSize);
  const [fontSizeInput, setFontSizeInput] = useState(String(configFontSize));
  const [visibleCount, setVisibleCount] = useState(6);
  const savedRangeRef = useRef<Range | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const groupRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Sync font size state when configFontSize changes externally
  // (e.g. preset changes, remote widget updates).
  // Uses the "adjusting state while rendering" pattern with state (not ref).
  const [prevConfigFontSize, setPrevConfigFontSize] = useState(configFontSize);
  if (prevConfigFontSize !== configFontSize) {
    setPrevConfigFontSize(configFontSize);
    setCurrentFontSize(configFontSize);
    setFontSizeInput(String(configFontSize));
  }

  const closeAllMenus = useCallback(() => {
    setShowFontMenu(false);
    setShowColorMenu(false);
    setShowAlignMenu(false);
    setShowOverflowMenu(false);
  }, []);

  /** Read the font-size at the current selection anchor.
   *  Checks for an inline font-size style first (applied by the toolbar),
   *  then falls back to the widget's config font size. */
  const detectFontSize = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !editorRef.current) return;
    const node: HTMLElement | null =
      sel.anchorNode?.nodeType === Node.TEXT_NODE
        ? sel.anchorNode.parentElement
        : (sel.anchorNode as HTMLElement | null);
    if (!node || !editorRef.current.contains(node)) return;

    // Walk up from the selection anchor looking for an inline font-size style
    // (set by the toolbar's applyFontSize via <span style="font-size:Xpx">).
    let cursor: HTMLElement | null = node;
    while (cursor && cursor !== editorRef.current) {
      const inlineSize = cursor.style?.fontSize;
      if (inlineSize) {
        const px = Math.round(parseFloat(inlineSize));
        if (!Number.isNaN(px) && px > 0) {
          setCurrentFontSize(px);
          setFontSizeInput(String(px));
          return;
        }
      }
      cursor = cursor.parentElement;
    }

    // No inline style found — use the widget's config font size
    setCurrentFontSize(configFontSize);
    setFontSizeInput(String(configFontSize));
  }, [editorRef, configFontSize]);

  useEffect(() => {
    const captureSelection = () => {
      const editor = editorRef.current;
      const selection = window.getSelection();
      if (!editor || !selection || selection.rangeCount === 0) {
        return;
      }

      const range = selection.getRangeAt(0);
      const container =
        range.commonAncestorContainer.nodeType === Node.TEXT_NODE
          ? range.commonAncestorContainer.parentNode
          : range.commonAncestorContainer;

      if (container instanceof Node && editor.contains(container)) {
        savedRangeRef.current = range.cloneRange();
      }

      detectFontSize();
    };

    document.addEventListener('selectionchange', captureSelection);
    return () => {
      document.removeEventListener('selectionchange', captureSelection);
    };
  }, [editorRef, detectFontSize]);

  const restoreSelection = useCallback(() => {
    const selection = window.getSelection();
    const editor = editorRef.current;
    if (!selection || !editor) {
      return;
    }

    editor.focus();

    if (savedRangeRef.current) {
      selection.removeAllRanges();
      selection.addRange(savedRangeRef.current);
    }
  }, [editorRef]);

  /** Run a document.execCommand with styleWithCSS enabled. */
  const runCommand = useCallback(
    (command: string, value: string = '') => {
      restoreSelection();
      document.execCommand('styleWithCSS', false, 'true');
      document.execCommand(command, false, value);
      editorRef.current?.focus();
    },
    [restoreSelection, editorRef]
  );

  /** Apply an arbitrary pixel font size to the current selection by wrapping it
   *  in <span style="font-size:Xpx">. Uses Range.extractContents/insertNode to
   *  handle selections that cross inline-element boundaries. Suppresses the
   *  parent's handleInput during the mutation, then explicitly persists. */
  const applyFontSize = useCallback(
    (size: number) => {
      const clamped = Math.max(8, Math.min(96, Math.round(size)));
      setCurrentFontSize(clamped);
      setFontSizeInput(String(clamped));

      const editor = editorRef.current;
      if (!editor) return;

      restoreSelection();

      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);

      // Act only on ranges inside this editor, and only for non-collapsed
      // selections (cursor-only is a no-op — better than the xx-large lock).
      if (!editor.contains(range.commonAncestorContainer) || range.collapsed) {
        editor.focus();
        return;
      }

      suppressInputRef.current = true;

      const span = document.createElement('span');
      span.style.fontSize = `${clamped}px`;
      span.appendChild(range.extractContents());
      range.insertNode(span);

      // Re-select the wrapped span so repeated +/- clicks keep targeting it.
      const newRange = document.createRange();
      newRange.selectNodeContents(span);
      sel.removeAllRanges();
      sel.addRange(newRange);
      savedRangeRef.current = newRange.cloneRange();

      suppressInputRef.current = false;
      onContentChange();
      editor.focus();
    },
    [editorRef, restoreSelection, suppressInputRef, onContentChange]
  );

  const handleLink = async () => {
    const url = await showPrompt('Enter the URL for the link:', {
      placeholder: 'https://example.com',
    });
    if (url) {
      runCommand('createLink', url);
    }
  };

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      closeAllMenus();
    };
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, [closeAllMenus]);

  // ResizeObserver: collapse lower-priority groups into overflow menu
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
        const needed = total + groupWidth + overflowBtnWidth;

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

  const setGroupRef = useCallback(
    (index: number) => (el: HTMLDivElement | null) => {
      groupRefs.current[index] = el;
    },
    []
  );

  const stickyColors = Object.values(STICKY_NOTE_COLORS);

  return (
    <div
      ref={toolbarRef}
      className="flex items-center gap-0.5 p-1 bg-white/95 backdrop-blur-sm border border-slate-200 shadow-md rounded-lg overflow-hidden"
      onMouseDown={(e) => {
        if ((e.target as HTMLElement).tagName !== 'INPUT') {
          e.preventDefault();
        }
      }}
    >
      {/* Group 0: Font Family */}
      <div
        ref={setGroupRef(0)}
        className="flex items-center"
        style={
          visibleCount <= 0
            ? { position: 'absolute', visibility: 'hidden' }
            : undefined
        }
      >
        <MenuButton
          icon={<Type className="w-3.5 h-3.5 text-slate-600" />}
          label="Font Family"
          isOpen={showFontMenu}
          onClick={() => {
            const wasOpen = showFontMenu;
            closeAllMenus();
            if (!wasOpen) setShowFontMenu(true);
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
                      ? window.getComputedStyle(
                          editorRef.current ?? document.body
                        ).fontFamily
                      : f.family;
                  runCommand('fontName', family);
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
      </div>

      {/* Group 1: Font Size - Numeric Stepper */}
      <div
        ref={setGroupRef(1)}
        className="flex items-center"
        style={
          visibleCount <= 1
            ? { position: 'absolute', visibility: 'hidden' }
            : undefined
        }
      >
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
      </div>

      {visibleCount >= 2 && <div className="w-px h-4 bg-slate-200 mx-0.5" />}

      {/* Group 2: Text Style — B / I / U as segmented control */}
      <div
        ref={setGroupRef(2)}
        className="flex items-center"
        style={
          visibleCount <= 2
            ? { position: 'absolute', visibility: 'hidden' }
            : undefined
        }
      >
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => runCommand('bold')}
          className="flex items-center justify-center w-7 h-7 rounded-l border border-r-0 border-slate-200 hover:bg-slate-100 transition-colors"
          title="Bold"
          aria-label="Bold"
        >
          <Bold className="w-3.5 h-3.5 text-slate-600" />
        </button>
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => runCommand('italic')}
          className="flex items-center justify-center w-7 h-7 border border-r-0 border-slate-200 hover:bg-slate-100 transition-colors"
          title="Italic"
          aria-label="Italic"
        >
          <Italic className="w-3.5 h-3.5 text-slate-600" />
        </button>
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => runCommand('underline')}
          className="flex items-center justify-center w-7 h-7 rounded-r border border-slate-200 hover:bg-slate-100 transition-colors"
          title="Underline"
          aria-label="Underline"
        >
          <Underline className="w-3.5 h-3.5 text-slate-600" />
        </button>
      </div>

      {visibleCount >= 3 && <div className="w-px h-4 bg-slate-200 mx-0.5" />}

      {/* Group 3: Alignment & Layout */}
      <div
        ref={setGroupRef(3)}
        className="flex items-center"
        style={
          visibleCount <= 3
            ? { position: 'absolute', visibility: 'hidden' }
            : undefined
        }
      >
        <MenuButton
          icon={<AlignLeft className="w-3.5 h-3.5 text-slate-600" />}
          label="Alignment & Layout"
          isOpen={showAlignMenu}
          onClick={() => {
            const wasOpen = showAlignMenu;
            closeAllMenus();
            if (!wasOpen) setShowAlignMenu(true);
          }}
        >
          <div className="w-40 p-1.5 space-y-1.5">
            {/* Justify */}
            <div>
              <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wider px-1 mb-0.5">
                Justify
              </div>
              <div className="flex gap-0.5">
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    runCommand('justifyLeft');
                    setShowAlignMenu(false);
                  }}
                  className="w-8 h-8 rounded hover:bg-slate-100 flex items-center justify-center"
                  title="Align Left"
                >
                  <AlignLeft className="w-3.5 h-3.5 text-slate-600" />
                </button>
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    runCommand('justifyCenter');
                    setShowAlignMenu(false);
                  }}
                  className="w-8 h-8 rounded hover:bg-slate-100 flex items-center justify-center"
                  title="Align Center"
                >
                  <AlignCenter className="w-3.5 h-3.5 text-slate-600" />
                </button>
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    runCommand('justifyRight');
                    setShowAlignMenu(false);
                  }}
                  className="w-8 h-8 rounded hover:bg-slate-100 flex items-center justify-center"
                  title="Align Right"
                >
                  <AlignRight className="w-3.5 h-3.5 text-slate-600" />
                </button>
              </div>
            </div>

            <div className="h-px bg-slate-100" />

            {/* Vertical */}
            <div>
              <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wider px-1 mb-0.5">
                Vertical
              </div>
              <div className="flex gap-0.5">
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onVerticalAlignChange('top');
                    setShowAlignMenu(false);
                  }}
                  className={`w-8 h-8 rounded hover:bg-slate-100 flex items-center justify-center transition-colors ${verticalAlign === 'top' ? 'bg-blue-100 text-blue-600' : ''}`}
                  title="Align Top"
                >
                  <AlignVerticalJustifyStart className="w-3.5 h-3.5" />
                </button>
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onVerticalAlignChange('center');
                    setShowAlignMenu(false);
                  }}
                  className={`w-8 h-8 rounded hover:bg-slate-100 flex items-center justify-center transition-colors ${verticalAlign === 'center' ? 'bg-blue-100 text-blue-600' : ''}`}
                  title="Align Middle"
                >
                  <AlignVerticalJustifyCenter className="w-3.5 h-3.5" />
                </button>
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onVerticalAlignChange('bottom');
                    setShowAlignMenu(false);
                  }}
                  className={`w-8 h-8 rounded hover:bg-slate-100 flex items-center justify-center transition-colors ${verticalAlign === 'bottom' ? 'bg-blue-100 text-blue-600' : ''}`}
                  title="Align Bottom"
                >
                  <AlignVerticalJustifyEnd className="w-3.5 h-3.5" />
                </button>
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
                  onClick={() => {
                    runCommand('outdent');
                    setShowAlignMenu(false);
                  }}
                  className="w-8 h-8 rounded hover:bg-slate-100 flex items-center justify-center"
                  title="Decrease Indent"
                >
                  <Outdent className="w-3.5 h-3.5 text-slate-600" />
                </button>
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    runCommand('indent');
                    setShowAlignMenu(false);
                  }}
                  className="w-8 h-8 rounded hover:bg-slate-100 flex items-center justify-center"
                  title="Increase Indent"
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
                  onClick={() => {
                    runCommand('insertUnorderedList');
                    setShowAlignMenu(false);
                  }}
                  className="w-8 h-8 rounded hover:bg-slate-100 flex items-center justify-center"
                  title="Bulleted List"
                >
                  <List className="w-3.5 h-3.5 text-slate-600" />
                </button>
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    runCommand('insertOrderedList');
                    setShowAlignMenu(false);
                  }}
                  className="w-8 h-8 rounded hover:bg-slate-100 flex items-center justify-center"
                  title="Numbered List"
                >
                  <ListOrdered className="w-3.5 h-3.5 text-slate-600" />
                </button>
              </div>
            </div>
          </div>
        </MenuButton>
      </div>

      {visibleCount >= 4 && <div className="w-px h-4 bg-slate-200 mx-0.5" />}

      {/* Group 4: Colors */}
      <div
        ref={setGroupRef(4)}
        className="flex items-center"
        style={
          visibleCount <= 4
            ? { position: 'absolute', visibility: 'hidden' }
            : undefined
        }
      >
        <MenuButton
          icon={<Palette className="w-3.5 h-3.5 text-slate-600" />}
          label="Colors"
          isOpen={showColorMenu}
          onClick={() => {
            const wasOpen = showColorMenu;
            closeAllMenus();
            if (!wasOpen) setShowColorMenu(true);
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
                    key={c}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      runCommand('foreColor', c);
                      setShowColorMenu(false);
                    }}
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
                  onClick={() => {
                    runCommand('hiliteColor', 'transparent');
                    setShowColorMenu(false);
                  }}
                  className="w-6 h-6 rounded-full border border-slate-200 flex items-center justify-center hover:scale-110 transition-transform"
                  title="None"
                >
                  <div className="w-px h-4 bg-red-500 rotate-45" />
                </button>
                {PASTEL_PALETTE.map((c) => (
                  <button
                    key={c}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      runCommand('hiliteColor', c);
                      setShowColorMenu(false);
                    }}
                    className="w-6 h-6 rounded-full border border-slate-200 hover:scale-110 transition-transform"
                    style={{ backgroundColor: c }}
                    title={c}
                  />
                ))}
              </div>
            </div>

            <div className="h-px bg-slate-100" />

            {/* Background */}
            <div>
              <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wider px-1 mb-0.5">
                Background
              </div>
              <div className="flex gap-1 p-1 flex-wrap">
                {stickyColors.map((c) => (
                  <button
                    key={c}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onBgColorChange(c);
                      setShowColorMenu(false);
                    }}
                    className={`w-6 h-6 rounded-full border transition-transform hover:scale-110 ${bgColor === c ? 'border-blue-500 scale-110' : 'border-slate-200'}`}
                    style={{ backgroundColor: c }}
                    title={c}
                  />
                ))}
              </div>
            </div>
          </div>
        </MenuButton>
      </div>

      {visibleCount >= 5 && <div className="w-px h-4 bg-slate-200 mx-0.5" />}

      {/* Group 5: Link */}
      <div
        ref={setGroupRef(5)}
        className="flex items-center"
        style={
          visibleCount <= 5
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
      </div>

      {/* Overflow "..." button — shown when some groups are hidden */}
      {visibleCount < 6 && (
        <MenuButton
          icon={<MoreHorizontal className="w-3.5 h-3.5 text-slate-600" />}
          label="More options"
          isOpen={showOverflowMenu}
          onClick={() => {
            const wasOpen = showOverflowMenu;
            closeAllMenus();
            if (!wasOpen) setShowOverflowMenu(true);
          }}
        >
          <div className="w-44 p-1.5 space-y-1.5">
            {/* Text Style section — shown when B/I/U group is hidden */}
            {visibleCount <= 2 && (
              <div>
                <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wider px-1 mb-0.5">
                  Text Style
                </div>
                <div className="flex gap-0.5">
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      runCommand('bold');
                      setShowOverflowMenu(false);
                    }}
                    className="flex items-center justify-center w-8 h-8 rounded hover:bg-slate-100"
                    title="Bold"
                    aria-label="Bold"
                  >
                    <Bold className="w-3.5 h-3.5 text-slate-600" />
                  </button>
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      runCommand('italic');
                      setShowOverflowMenu(false);
                    }}
                    className="flex items-center justify-center w-8 h-8 rounded hover:bg-slate-100"
                    title="Italic"
                    aria-label="Italic"
                  >
                    <Italic className="w-3.5 h-3.5 text-slate-600" />
                  </button>
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      runCommand('underline');
                      setShowOverflowMenu(false);
                    }}
                    className="flex items-center justify-center w-8 h-8 rounded hover:bg-slate-100"
                    title="Underline"
                    aria-label="Underline"
                  >
                    <Underline className="w-3.5 h-3.5 text-slate-600" />
                  </button>
                </div>
              </div>
            )}

            {/* Alignment section — shown when alignment group is hidden */}
            {visibleCount <= 3 && (
              <div>
                <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wider px-1 mb-0.5">
                  Alignment
                </div>
                <div className="flex gap-0.5 flex-wrap">
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      runCommand('justifyLeft');
                      setShowOverflowMenu(false);
                    }}
                    className="w-8 h-8 rounded hover:bg-slate-100 flex items-center justify-center"
                    title="Align Left"
                  >
                    <AlignLeft className="w-3.5 h-3.5 text-slate-600" />
                  </button>
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      runCommand('justifyCenter');
                      setShowOverflowMenu(false);
                    }}
                    className="w-8 h-8 rounded hover:bg-slate-100 flex items-center justify-center"
                    title="Align Center"
                  >
                    <AlignCenter className="w-3.5 h-3.5 text-slate-600" />
                  </button>
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      runCommand('justifyRight');
                      setShowOverflowMenu(false);
                    }}
                    className="w-8 h-8 rounded hover:bg-slate-100 flex items-center justify-center"
                    title="Align Right"
                  >
                    <AlignRight className="w-3.5 h-3.5 text-slate-600" />
                  </button>
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onVerticalAlignChange('top');
                      setShowOverflowMenu(false);
                    }}
                    className={`w-8 h-8 rounded hover:bg-slate-100 flex items-center justify-center transition-colors ${verticalAlign === 'top' ? 'bg-blue-100 text-blue-600' : ''}`}
                    title="Align Top"
                  >
                    <AlignVerticalJustifyStart className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onVerticalAlignChange('center');
                      setShowOverflowMenu(false);
                    }}
                    className={`w-8 h-8 rounded hover:bg-slate-100 flex items-center justify-center transition-colors ${verticalAlign === 'center' ? 'bg-blue-100 text-blue-600' : ''}`}
                    title="Align Middle"
                  >
                    <AlignVerticalJustifyCenter className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onVerticalAlignChange('bottom');
                      setShowOverflowMenu(false);
                    }}
                    className={`w-8 h-8 rounded hover:bg-slate-100 flex items-center justify-center transition-colors ${verticalAlign === 'bottom' ? 'bg-blue-100 text-blue-600' : ''}`}
                    title="Align Bottom"
                  >
                    <AlignVerticalJustifyEnd className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      runCommand('outdent');
                      setShowOverflowMenu(false);
                    }}
                    className="w-8 h-8 rounded hover:bg-slate-100 flex items-center justify-center"
                    title="Decrease Indent"
                  >
                    <Outdent className="w-3.5 h-3.5 text-slate-600" />
                  </button>
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      runCommand('indent');
                      setShowOverflowMenu(false);
                    }}
                    className="w-8 h-8 rounded hover:bg-slate-100 flex items-center justify-center"
                    title="Increase Indent"
                  >
                    <Indent className="w-3.5 h-3.5 text-slate-600" />
                  </button>
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      runCommand('insertUnorderedList');
                      setShowOverflowMenu(false);
                    }}
                    className="w-8 h-8 rounded hover:bg-slate-100 flex items-center justify-center"
                    title="Bulleted List"
                  >
                    <List className="w-3.5 h-3.5 text-slate-600" />
                  </button>
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      runCommand('insertOrderedList');
                      setShowOverflowMenu(false);
                    }}
                    className="w-8 h-8 rounded hover:bg-slate-100 flex items-center justify-center"
                    title="Numbered List"
                  >
                    <ListOrdered className="w-3.5 h-3.5 text-slate-600" />
                  </button>
                </div>
              </div>
            )}

            {/* Colors section — shown when colors group is hidden */}
            {visibleCount <= 4 && (
              <div>
                <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wider px-1 mb-0.5">
                  Colors
                </div>
                <div className="grid grid-cols-4 gap-1 p-1">
                  {FONT_COLORS.map((c) => (
                    <button
                      key={c}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        runCommand('foreColor', c);
                        setShowOverflowMenu(false);
                      }}
                      className="w-6 h-6 rounded-full border border-slate-200 hover:scale-110 transition-transform"
                      style={{ backgroundColor: c }}
                      title={c}
                    />
                  ))}
                </div>
                <div className="grid grid-cols-4 gap-1 p-1">
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      runCommand('hiliteColor', 'transparent');
                      setShowOverflowMenu(false);
                    }}
                    className="w-6 h-6 rounded-full border border-slate-200 flex items-center justify-center hover:scale-110 transition-transform"
                    title="No Highlight"
                  >
                    <div className="w-px h-4 bg-red-500 rotate-45" />
                  </button>
                  {PASTEL_PALETTE.map((c) => (
                    <button
                      key={c}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        runCommand('hiliteColor', c);
                        setShowOverflowMenu(false);
                      }}
                      className="w-6 h-6 rounded-full border border-slate-200 hover:scale-110 transition-transform"
                      style={{ backgroundColor: c }}
                      title={c}
                    />
                  ))}
                </div>
                <div className="flex gap-1 p-1 flex-wrap">
                  {stickyColors.map((c) => (
                    <button
                      key={c}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        onBgColorChange(c);
                        setShowOverflowMenu(false);
                      }}
                      className={`w-6 h-6 rounded-full border transition-transform hover:scale-110 ${bgColor === c ? 'border-blue-500 scale-110' : 'border-slate-200'}`}
                      style={{ backgroundColor: c }}
                      title={c}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Link section — shown when link group is hidden */}
            {visibleCount <= 5 && (
              <div>
                <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wider px-1 mb-0.5">
                  Link
                </div>
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setShowOverflowMenu(false);
                    void handleLink();
                  }}
                  className="flex items-center gap-1.5 w-full px-2 py-1.5 rounded hover:bg-slate-100 text-xs text-slate-700"
                  title="Insert Link"
                >
                  <LinkIcon className="w-3.5 h-3.5" />
                  Insert Link
                </button>
              </div>
            )}
          </div>
        </MenuButton>
      )}
    </div>
  );
};
