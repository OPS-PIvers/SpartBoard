import React, { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ChevronDown,
  Circle,
  Highlighter,
  MessageSquarePlus,
  MousePointer2,
  Redo2,
  Square,
  Trash2,
  Undo2,
  type LucideIcon,
} from 'lucide-react';
import {
  PAPER_MARKUP_MAX_ITEMS,
  type PaperMarkupColor,
  type PaperMarkupStamp,
} from '@/types';
import { tourTypeAttr } from '@/config/tourAnchors';
import { MARKUP_COLORS, inkOf, washOf, STAMP_ORDER } from './markupStyle';
import { StampGlyph } from './MarkupShape';
import type { PaperMarkupEditor } from './usePaperMarkupEditor';
import type { MarkupTool } from './types';

const BTN =
  'inline-flex h-8 min-w-8 items-center justify-center rounded-md text-slate-600 transition-colors hover:bg-slate-100 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-blue-primary disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:min-w-11 [-webkit-tap-highlight-color:transparent]';
const PRESSED =
  'bg-brand-blue-primary/10 text-brand-blue-dark ring-1 ring-inset ring-brand-blue-primary/40 hover:bg-brand-blue-primary/15';
const MENU =
  'absolute left-0 top-full z-popover mt-1 flex min-w-40 flex-col rounded-xl border border-slate-200 bg-white p-1 shadow-xl';
const MENU_ITEM =
  'flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-semibold text-slate-700 hover:bg-slate-100 focus-visible:bg-slate-100 focus-visible:outline-hidden [@media(pointer:coarse)]:py-2.5';

const MENU_ON =
  'bg-brand-blue-primary/10 text-brand-blue-dark hover:bg-brand-blue-primary/15';

const TOOLS: {
  tool: Exclude<MarkupTool, 'stamp' | 'pin'>;
  Icon: LucideIcon;
  tour: ReturnType<typeof tourTypeAttr>;
}[] = [
  {
    tool: 'select',
    Icon: MousePointer2,
    tour: tourTypeAttr('quiz-grading.markup-select', 'quiz'),
  },
  {
    tool: 'highlight',
    Icon: Highlighter,
    tour: tourTypeAttr('quiz-grading.markup-highlight', 'quiz'),
  },
  {
    tool: 'rect',
    Icon: Square,
    tour: tourTypeAttr('quiz-grading.markup-box', 'quiz'),
  },
  {
    tool: 'ellipse',
    Icon: Circle,
    tour: tourTypeAttr('quiz-grading.markup-circle', 'quiz'),
  },
];

/** A stamp drawn with the same glyph the sheet gets, sized for a button. */
export const StampIcon: React.FC<{ symbol: PaperMarkupStamp }> = ({
  symbol,
}) => (
  <svg aria-hidden viewBox="-4 -4 8 8" className="h-4 w-4">
    <StampGlyph symbol={symbol} color="currentColor" x={0} y={0} />
  </svg>
);

const Swatch: React.FC<{ color: PaperMarkupColor; highlight: boolean }> = ({
  color,
  highlight,
}) => (
  <span
    aria-hidden
    className="inline-block h-3.5 w-3.5 rounded-full ring-1 ring-inset ring-slate-900/20"
    style={{
      background: highlight ? washOf(color) : inkOf(color),
    }}
  />
);

type MenuName = 'stamp' | 'color';

/** Arrow keys walk a menu's items; Escape closes it and returns focus to its button. */
function useMenu(close: () => void) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    el?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
    const onDown = (e: PointerEvent) => {
      if (el && !el.parentElement?.contains(e.target as Node)) close();
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [close]);
  const onKeyDown = (e: React.KeyboardEvent) => {
    const items = Array.from(
      ref.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? []
    );
    const at = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      items[(at + step + items.length) % items.length]?.focus();
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
      }
      close();
    }
  };
  return { ref, onKeyDown };
}

const Menu: React.FC<{
  label: string;
  close: () => void;
  children: React.ReactNode;
}> = ({ label, close, children }) => {
  const { ref, onKeyDown } = useMenu(close);
  return (
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={MENU}
    >
      {children}
    </div>
  );
};

export const PaperMarkupToolbar: React.FC<{
  editor: PaperMarkupEditor;
  /** False until the image and its sheet position are known. */
  ready: boolean;
  /** Why the tools are off, when they are. */
  disabledReason?: string;
  needsScore?: boolean;
}> = ({ editor, ready, disabledReason, needsScore }) => {
  const { t } = useTranslation();
  const tm = (key: string, params?: Record<string, unknown>) =>
    t(`quizMediaResponse.grading.paper.markup.${key}`, params);
  const [menu, setMenu] = useState<MenuName | null>(null);
  const stampBtn = useRef<HTMLButtonElement | null>(null);
  const colorBtn = useRef<HTMLButtonElement | null>(null);
  const statusId = useId();
  const closeMenu = React.useCallback(() => setMenu(null), []);
  const closeMenuAndFocus = (name: MenuName) => {
    setMenu(null);
    (name === 'stamp' ? stampBtn : colorBtn).current?.focus();
  };

  const capped = editor.atCap;
  const drawOff = !ready || capped;
  const capText = tm('cap', { max: PAPER_MARKUP_MAX_ITEMS });
  const drawTitle = (label: string) =>
    !ready ? (disabledReason ?? label) : capped ? capText : label;
  const status =
    !ready && disabledReason
      ? disabledReason
      : capped && ready
        ? capText
        : needsScore
          ? tm('needsScore')
          : null;
  const highlightColor =
    editor.selected?.kind === 'highlight' ||
    (!editor.selected && editor.tool === 'highlight');

  return (
    <div className="flex flex-col gap-1">
      <div
        role="toolbar"
        aria-label={tm('toolbar')}
        aria-describedby={status ? statusId : undefined}
        {...tourTypeAttr('quiz-grading.markup-toolbar', 'quiz')}
        className="flex w-fit max-w-full flex-wrap items-center gap-0.5 rounded-lg border border-slate-200 bg-slate-50 p-0.5"
      >
        {TOOLS.map(({ tool, Icon, tour }) => {
          const label = tm(`tools.${tool}`);
          const off = tool === 'select' ? !ready : drawOff;
          const on = editor.tool === tool && !off;
          return (
            <button
              key={tool}
              type="button"
              onClick={() => editor.setTool(tool)}
              disabled={off}
              aria-pressed={on}
              aria-label={label}
              title={tool === 'select' ? label : drawTitle(label)}
              {...tour}
              className={`${BTN} ${on ? PRESSED : ''}`}
            >
              <Icon aria-hidden className="h-4 w-4" />
            </button>
          );
        })}
        <span className="relative inline-flex">
          <button
            type="button"
            onClick={() => editor.setTool('stamp')}
            disabled={drawOff}
            aria-pressed={editor.tool === 'stamp' && !drawOff}
            aria-label={tm('tools.stampOf', {
              stamp: tm(`stamps.${editor.stamp}`),
            })}
            title={drawTitle(
              tm('tools.stampOf', { stamp: tm(`stamps.${editor.stamp}`) })
            )}
            {...tourTypeAttr('quiz-grading.markup-stamp', 'quiz')}
            className={`${BTN} rounded-r-none ${
              editor.tool === 'stamp' && !drawOff ? PRESSED : ''
            }`}
          >
            <StampIcon symbol={editor.stamp} />
          </button>
          <button
            ref={stampBtn}
            type="button"
            onClick={() => setMenu(menu === 'stamp' ? null : 'stamp')}
            disabled={drawOff}
            aria-haspopup="menu"
            aria-expanded={menu === 'stamp'}
            aria-label={tm('chooseStamp')}
            title={drawOff ? drawTitle(tm('chooseStamp')) : tm('chooseStamp')}
            {...tourTypeAttr('quiz-grading.markup-stamp-menu', 'quiz')}
            className={`${BTN} min-w-5! rounded-l-none px-0.5 [@media(pointer:coarse)]:min-w-8! ${
              editor.tool === 'stamp' && !drawOff ? PRESSED : ''
            }`}
          >
            <ChevronDown aria-hidden className="h-3 w-3" />
          </button>
          {menu === 'stamp' && (
            <Menu label={tm('chooseStamp')} close={closeMenu}>
              {STAMP_ORDER.map((s) => (
                // no-tour-anchor: stamp choice inside the menu; tours point at the menu button
                <button
                  key={s}
                  type="button"
                  role="menuitemradio"
                  aria-checked={editor.stamp === s}
                  tabIndex={editor.stamp === s ? 0 : -1}
                  onClick={() => {
                    editor.setStamp(s);
                    closeMenuAndFocus('stamp');
                  }}
                  className={`${MENU_ITEM} ${editor.stamp === s ? MENU_ON : ''}`}
                >
                  <span className="text-brand-red-primary">
                    <StampIcon symbol={s} />
                  </span>
                  <span className="flex-1">{tm(`stamps.${s}`)}</span>
                </button>
              ))}
            </Menu>
          )}
        </span>
        <button
          type="button"
          onClick={() => editor.setTool('pin')}
          disabled={drawOff}
          aria-pressed={editor.tool === 'pin' && !drawOff}
          aria-label={tm('tools.pin')}
          title={drawTitle(tm('tools.pin'))}
          {...tourTypeAttr('quiz-grading.markup-pin', 'quiz')}
          className={`${BTN} ${editor.tool === 'pin' && !drawOff ? PRESSED : ''}`}
        >
          <MessageSquarePlus aria-hidden className="h-4 w-4" />
        </button>
        <span aria-hidden className="mx-0.5 h-5 w-px bg-slate-200" />
        <span className="relative inline-flex">
          <button
            ref={colorBtn}
            type="button"
            onClick={() => setMenu(menu === 'color' ? null : 'color')}
            disabled={!ready}
            aria-haspopup="menu"
            aria-expanded={menu === 'color'}
            aria-label={tm('colorOf', { color: tm(`colors.${editor.color}`) })}
            title={tm('colorOf', { color: tm(`colors.${editor.color}`) })}
            {...tourTypeAttr('quiz-grading.markup-color', 'quiz')}
            className={`${BTN} gap-1 px-1.5`}
          >
            <Swatch color={editor.color} highlight={highlightColor} />
            <ChevronDown aria-hidden className="h-3 w-3" />
          </button>
          {menu === 'color' && (
            <Menu label={tm('color')} close={closeMenu}>
              {MARKUP_COLORS.map((c) => (
                // no-tour-anchor: color choice inside the menu; tours point at the menu button
                <button
                  key={c}
                  type="button"
                  role="menuitemradio"
                  aria-checked={editor.color === c}
                  tabIndex={editor.color === c ? 0 : -1}
                  onClick={() => {
                    editor.setColor(c);
                    closeMenuAndFocus('color');
                  }}
                  className={`${MENU_ITEM} ${editor.color === c ? MENU_ON : ''}`}
                >
                  <Swatch color={c} highlight={highlightColor} />
                  <span className="flex-1">{tm(`colors.${c}`)}</span>
                </button>
              ))}
            </Menu>
          )}
        </span>
        <span aria-hidden className="mx-0.5 h-5 w-px bg-slate-200" />
        <button
          type="button"
          onClick={editor.history.undo}
          disabled={!ready || !editor.history.canUndo}
          aria-label={tm('undo')}
          title={tm('undoKeys')}
          {...tourTypeAttr('quiz-grading.markup-undo', 'quiz')}
          className={BTN}
        >
          <Undo2 aria-hidden className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={editor.history.redo}
          disabled={!ready || !editor.history.canRedo}
          aria-label={tm('redo')}
          title={tm('redoKeys')}
          {...tourTypeAttr('quiz-grading.markup-redo', 'quiz')}
          className={BTN}
        >
          <Redo2 aria-hidden className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={editor.deleteSelected}
          disabled={!ready || !editor.selectedId}
          aria-label={tm('delete')}
          title={tm('deleteKeys')}
          {...tourTypeAttr('quiz-grading.markup-delete', 'quiz')}
          className={`${BTN} hover:text-brand-red-dark`}
        >
          <Trash2 aria-hidden className="h-4 w-4" />
        </button>
      </div>
      <p
        id={statusId}
        role="status"
        title={status ?? undefined}
        className={`h-4 truncate text-xs leading-4 ${
          capped && ready ? 'font-semibold text-amber-700' : 'text-slate-500'
        }`}
      >
        {status}
      </p>
    </div>
  );
};
