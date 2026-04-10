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
  Highlighter,
  Link as LinkIcon,
  ChevronDown,
  Minus,
  Plus,
} from 'lucide-react';
import { IconButton } from '@/components/common/IconButton';
import { FONT_COLORS } from '@/config/fonts';
import { PASTEL_PALETTE } from '@/config/colors';
import { useDialog } from '@/context/useDialog';

interface FormattingToolbarProps {
  editorRef: React.RefObject<HTMLDivElement | null>;
  verticalAlign: 'top' | 'center' | 'bottom';
  onVerticalAlignChange: (value: 'top' | 'center' | 'bottom') => void;
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
  verticalAlign,
  onVerticalAlignChange,
}) => {
  const { showPrompt } = useDialog();
  const [showFontMenu, setShowFontMenu] = useState(false);
  const [showColorMenu, setShowColorMenu] = useState(false);
  const [showHighlightMenu, setShowHighlightMenu] = useState(false);
  const [currentFontSize, setCurrentFontSize] = useState(16);
  const [fontSizeInput, setFontSizeInput] = useState('16');
  const savedRangeRef = useRef<Range | null>(null);

  /** Read the computed font-size of the current selection anchor */
  const detectFontSize = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !editorRef.current) return;
    const node =
      sel.anchorNode?.nodeType === Node.TEXT_NODE
        ? sel.anchorNode.parentElement
        : (sel.anchorNode as HTMLElement | null);
    if (!node || !editorRef.current.contains(node)) return;
    const computed = window.getComputedStyle(node).fontSize;
    const px = Math.round(parseFloat(computed));
    if (!Number.isNaN(px) && px > 0) {
      setCurrentFontSize(px);
      setFontSizeInput(String(px));
    }
  }, [editorRef]);

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

  const restoreSelection = () => {
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
  };

  const exec = (command: string, value: string = '') => {
    restoreSelection();
    document.execCommand('styleWithCSS', false, 'true');
    document.execCommand(command, false, value);
    editorRef.current?.focus();
  };

  /** Apply an arbitrary pixel font size using the marker-replacement technique */
  const applyFontSize = useCallback(
    (size: number) => {
      const clamped = Math.max(8, Math.min(96, Math.round(size)));
      setCurrentFontSize(clamped);
      setFontSizeInput(String(clamped));

      restoreSelection();
      document.execCommand('styleWithCSS', false, 'true');
      document.execCommand('fontSize', false, '7');

      // Replace <font size="7"> markers with styled spans
      const editor = editorRef.current;
      if (editor) {
        const fontElements = editor.querySelectorAll('font[size="7"]');
        fontElements.forEach((el) => {
          const span = document.createElement('span');
          span.style.fontSize = `${clamped}px`;
          span.innerHTML = el.innerHTML;
          el.replaceWith(span);
        });
      }
      editor?.focus();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editorRef]
  );

  const handleLink = async () => {
    const url = await showPrompt('Enter the URL for the link:', {
      placeholder: 'https://example.com',
    });
    if (url) {
      exec('createLink', url);
    }
  };

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      setShowFontMenu(false);
      setShowColorMenu(false);
      setShowHighlightMenu(false);
    };
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  return (
    <div
      className="flex flex-col gap-0.5 p-1 bg-white/95 backdrop-blur-sm border-b border-slate-200 shadow-sm rounded-t-lg"
      onMouseDown={(e) => e.preventDefault()}
    >
      {/* Row 1: Text formatting */}
      <div className="flex items-center gap-0.5">
        {/* Typeface */}
        <MenuButton
          icon={<Type className="w-3.5 h-3.5 text-slate-600" />}
          label="Font Family"
          isOpen={showFontMenu}
          onClick={() => {
            const wasOpen = showFontMenu;
            setShowFontMenu(!wasOpen);
            setShowColorMenu(false);
            setShowHighlightMenu(false);
          }}
        >
          <div className="flex flex-col gap-0.5 max-h-64 overflow-y-auto custom-scrollbar">
            {TOOLBAR_FONTS.map((f) => (
              <button
                key={f.id}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  exec('fontName', f.id === 'global' ? 'sans-serif' : f.family);
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

        {/* Font Size - Numeric Stepper */}
        <div className="flex items-center gap-0 rounded border border-slate-200 mx-0.5">
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyFontSize(currentFontSize - 1)}
            className="flex items-center justify-center w-5 h-6 hover:bg-slate-100 transition-colors rounded-l"
            title="Decrease font size"
          >
            <Minus className="w-2.5 h-2.5 text-slate-500" />
          </button>
          <input
            type="text"
            value={fontSizeInput}
            onMouseDown={(e) => e.preventDefault()}
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
          >
            <Plus className="w-2.5 h-2.5 text-slate-500" />
          </button>
        </div>

        <div className="w-px h-4 bg-slate-200 mx-1" />

        {/* Basic Formatting */}
        <IconButton
          icon={<Bold className="w-3.5 h-3.5" />}
          label="Bold"
          onClick={() => exec('bold')}
          size="sm"
          variant="ghost"
          onMouseDown={(e) => e.preventDefault()}
        />
        <IconButton
          icon={<Italic className="w-3.5 h-3.5" />}
          label="Italic"
          onClick={() => exec('italic')}
          size="sm"
          variant="ghost"
          onMouseDown={(e) => e.preventDefault()}
        />
        <IconButton
          icon={<Underline className="w-3.5 h-3.5" />}
          label="Underline"
          onClick={() => exec('underline')}
          size="sm"
          variant="ghost"
          onMouseDown={(e) => e.preventDefault()}
        />

        <div className="w-px h-4 bg-slate-200 mx-1" />

        {/* Colors */}
        <MenuButton
          icon={<Palette className="w-3.5 h-3.5" />}
          label="Font Color"
          isOpen={showColorMenu}
          onClick={() => {
            const wasOpen = showColorMenu;
            setShowColorMenu(!wasOpen);
            setShowFontMenu(false);
            setShowHighlightMenu(false);
          }}
        >
          <div className="grid grid-cols-4 gap-1 p-1">
            {FONT_COLORS.map((c) => (
              <button
                key={c}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  exec('foreColor', c);
                  setShowColorMenu(false);
                }}
                className="w-6 h-6 rounded-full border border-slate-200 hover:scale-110 transition-transform"
                style={{ backgroundColor: c }}
                title={c}
              />
            ))}
          </div>
        </MenuButton>

        <MenuButton
          icon={<Highlighter className="w-3.5 h-3.5" />}
          label="Highlight"
          isOpen={showHighlightMenu}
          onClick={() => {
            const wasOpen = showHighlightMenu;
            setShowHighlightMenu(!wasOpen);
            setShowFontMenu(false);
            setShowColorMenu(false);
          }}
        >
          <div className="grid grid-cols-4 gap-1 p-1">
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                exec('hiliteColor', 'transparent');
                setShowHighlightMenu(false);
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
                  exec('hiliteColor', c);
                  setShowHighlightMenu(false);
                }}
                className="w-6 h-6 rounded-full border border-slate-200 hover:scale-110 transition-transform"
                style={{ backgroundColor: c }}
                title={c}
              />
            ))}
          </div>
        </MenuButton>

        <div className="w-px h-4 bg-slate-200 mx-1" />

        {/* Link */}
        <IconButton
          icon={<LinkIcon className="w-3.5 h-3.5" />}
          label="Hyperlink (Ctrl+K)"
          onClick={() => void handleLink()}
          size="sm"
          variant="ghost"
          onMouseDown={(e) => e.preventDefault()}
        />
      </div>

      {/* Row 2: Layout formatting */}
      <div className="flex items-center gap-0.5">
        {/* Alignment */}
        <IconButton
          icon={<AlignLeft className="w-3.5 h-3.5" />}
          label="Align Left"
          onClick={() => exec('justifyLeft')}
          size="sm"
          variant="ghost"
          onMouseDown={(e) => e.preventDefault()}
        />
        <IconButton
          icon={<AlignCenter className="w-3.5 h-3.5" />}
          label="Align Center"
          onClick={() => exec('justifyCenter')}
          size="sm"
          variant="ghost"
          onMouseDown={(e) => e.preventDefault()}
        />
        <IconButton
          icon={<AlignRight className="w-3.5 h-3.5" />}
          label="Align Right"
          onClick={() => exec('justifyRight')}
          size="sm"
          variant="ghost"
          onMouseDown={(e) => e.preventDefault()}
        />

        <div className="w-px h-4 bg-slate-200 mx-1" />

        <IconButton
          icon={<AlignVerticalJustifyStart className="w-3.5 h-3.5" />}
          label="Align Top"
          onClick={() => onVerticalAlignChange('top')}
          active={verticalAlign === 'top'}
          size="sm"
          variant="ghost"
          onMouseDown={(e) => e.preventDefault()}
        />
        <IconButton
          icon={<AlignVerticalJustifyCenter className="w-3.5 h-3.5" />}
          label="Align Middle"
          onClick={() => onVerticalAlignChange('center')}
          active={verticalAlign === 'center'}
          size="sm"
          variant="ghost"
          onMouseDown={(e) => e.preventDefault()}
        />
        <IconButton
          icon={<AlignVerticalJustifyEnd className="w-3.5 h-3.5" />}
          label="Align Bottom"
          onClick={() => onVerticalAlignChange('bottom')}
          active={verticalAlign === 'bottom'}
          size="sm"
          variant="ghost"
          onMouseDown={(e) => e.preventDefault()}
        />

        <div className="w-px h-4 bg-slate-200 mx-1" />

        {/* Lists */}
        <IconButton
          icon={<List className="w-3.5 h-3.5" />}
          label="Bulleted List"
          onClick={() => exec('insertUnorderedList')}
          size="sm"
          variant="ghost"
          onMouseDown={(e) => e.preventDefault()}
        />
        <IconButton
          icon={<ListOrdered className="w-3.5 h-3.5" />}
          label="Numbered List"
          onClick={() => exec('insertOrderedList')}
          size="sm"
          variant="ghost"
          onMouseDown={(e) => e.preventDefault()}
        />

        <div className="w-px h-4 bg-slate-200 mx-1" />

        {/* Indentation */}
        <IconButton
          icon={<Outdent className="w-3.5 h-3.5" />}
          label="Decrease Indent"
          onClick={() => exec('outdent')}
          size="sm"
          variant="ghost"
          onMouseDown={(e) => e.preventDefault()}
        />
        <IconButton
          icon={<Indent className="w-3.5 h-3.5" />}
          label="Increase Indent"
          onClick={() => exec('indent')}
          size="sm"
          variant="ghost"
          onMouseDown={(e) => e.preventDefault()}
        />
      </div>
    </div>
  );
};
