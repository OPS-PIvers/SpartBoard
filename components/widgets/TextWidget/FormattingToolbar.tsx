import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
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
} from 'lucide-react';
import { IconButton } from '@/components/common/IconButton';
import { FONT_COLORS, FONTS } from '@/config/fonts';
import { PASTEL_PALETTE } from '@/config/colors';
import { useDialog } from '@/context/useDialog';

interface FormattingToolbarProps {
  editorRef: React.RefObject<HTMLDivElement | null>;
  verticalAlign: 'top' | 'center' | 'bottom';
  onVerticalAlignChange: (value: 'top' | 'center' | 'bottom') => void;
}

const FONT_SIZES = [
  { label: 'Small', value: '1' },
  { label: 'Normal', value: '3' },
  { label: 'Medium', value: '4' },
  { label: 'Large', value: '5' },
  { label: 'Huge', value: '6' },
  { label: 'Giant', value: '7' },
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
  const [showSizeMenu, setShowSizeMenu] = useState(false);
  const [showColorMenu, setShowColorMenu] = useState(false);
  const [showHighlightMenu, setShowHighlightMenu] = useState(false);
  const savedRangeRef = useRef<Range | null>(null);

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
    };

    document.addEventListener('selectionchange', captureSelection);
    return () => {
      document.removeEventListener('selectionchange', captureSelection);
    };
  }, [editorRef]);

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
      setShowSizeMenu(false);
      setShowColorMenu(false);
      setShowHighlightMenu(false);
    };
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  return (
    <div
      className="flex items-center gap-0.5 p-1 bg-white border-b border-slate-200 overflow-x-auto no-scrollbar"
      onMouseDown={(e) => e.preventDefault()}
    >
      {/* Typeface */}
      <MenuButton
        icon={<Type className="w-3.5 h-3.5 text-slate-600" />}
        label="Font Family"
        isOpen={showFontMenu}
        onClick={() => {
          const wasOpen = showFontMenu;
          setShowFontMenu(!wasOpen);
          setShowSizeMenu(false);
          setShowColorMenu(false);
          setShowHighlightMenu(false);
        }}
      >
        <div className="flex flex-col gap-0.5">
          {FONTS.map((f) => (
            <button
              key={f.id}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                // Map Tailwind font classes to approximate font-family names for execCommand
                const fontFamilyMap: Record<string, string> = {
                  'font-sans': 'Lexend, sans-serif',
                  'font-serif': 'Merriweather, serif',
                  'font-mono': 'Roboto Mono, monospace',
                  'font-handwritten': 'Patrick Hand, cursive',
                  'font-rounded': 'Varela Round, sans-serif',
                  'font-fun': 'Fredoka, sans-serif',
                  'font-comic': 'Comic Neue, cursive',
                  'font-slab': 'Roboto Slab, serif',
                  'font-retro': 'VT323, monospace',
                  'font-marker': 'Permanent Marker, cursive',
                  'font-cursive': 'Dancing Script, cursive',
                };
                exec('fontName', fontFamilyMap[f.id] || 'sans-serif');
                setShowFontMenu(false);
              }}
              className="text-left px-3 py-1.5 hover:bg-slate-50 rounded text-xs text-slate-700 whitespace-nowrap"
              style={{ fontFamily: f.id === 'global' ? 'inherit' : f.id }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </MenuButton>

      {/* Font Size */}
      <MenuButton
        icon={<span className="text-[10px] font-bold text-slate-600">Aa</span>}
        label="Font Size"
        isOpen={showSizeMenu}
        onClick={() => {
          const wasOpen = showSizeMenu;
          setShowSizeMenu(!wasOpen);
          setShowFontMenu(false);
          setShowColorMenu(false);
          setShowHighlightMenu(false);
        }}
      >
        <div className="flex flex-col gap-0.5">
          {FONT_SIZES.map((s) => (
            <button
              key={s.value}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                exec('fontSize', s.value);
                setShowSizeMenu(false);
              }}
              className="text-left px-3 py-1.5 hover:bg-slate-50 rounded text-xs text-slate-700"
            >
              {s.label}
            </button>
          ))}
        </div>
      </MenuButton>

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
          setShowSizeMenu(false);
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
          setShowSizeMenu(false);
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
  );
};
