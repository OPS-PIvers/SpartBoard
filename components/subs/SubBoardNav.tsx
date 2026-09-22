/**
 * SubBoardNav — moving between the boards of a shared Collection.
 *
 * The teacher's own `BoardNavFab` is not reusable here: it is wired to
 * `useDashboard()`'s editing actions (create, rename, move, reorder) and opens
 * the Boards modal, none of which a sub may do. This is the same cluster in
 * the same place, sharing its visual primitives, with nothing that writes.
 *
 * Renders nothing for a share with one board, where there is nowhere to go.
 */

import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, LayoutGrid } from 'lucide-react';
import { useClickOutside } from '@/hooks/useClickOutside';
import { FAB_BASE } from '@/components/layout/fabClasses';
import {
  MENU_HEADER_CLASS,
  MENU_PANEL_CLASS,
} from '@/components/layout/boardNavMenu';
import type { SubShareNav } from './subShareNav';

interface SubBoardNavProps {
  nav: SubShareNav;
  currentBoardId: string;
  onPickBoard: (boardId: string) => void;
}

/** True when the key belongs to whatever the sub is typing in, not to us. */
function typingInto(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable
  );
}

export const SubBoardNav: React.FC<SubBoardNavProps> = ({
  nav,
  currentBoardId,
  onPickBoard,
}) => {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  const closeMenu = useCallback(() => setMenuOpen(false), []);
  useClickOutside(containerRef, closeMenu);

  const index = nav.order.indexOf(currentBoardId);
  const prevId = index > 0 ? nav.order[index - 1] : undefined;
  const nextId =
    index >= 0 && index < nav.order.length - 1
      ? nav.order[index + 1]
      : undefined;

  const closeAndRefocus = useCallback(() => {
    setMenuOpen(false);
    triggerRef.current?.focus();
  }, []);

  // Arrow keys page through the boards, as they do on the teacher's own FAB.
  // Bound to the document because the sub's focus is usually inside a widget.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || typingInto(event.target)) return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
        return;
      }
      if (event.key === 'Escape') {
        if (menuOpen) closeAndRefocus();
        return;
      }
      if (menuOpen) return;
      const target =
        event.key === 'ArrowLeft'
          ? prevId
          : event.key === 'ArrowRight'
            ? nextId
            : undefined;
      if (!target) return;
      event.preventDefault();
      onPickBoard(target);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [menuOpen, prevId, nextId, onPickBoard, closeAndRefocus]);

  if (nav.order.length < 2) return null;

  const currentName =
    nav.sections.flatMap((s) => s.boards).find((b) => b.id === currentBoardId)
      ?.name ?? '';
  const position = t('subShare.nav.position', {
    defaultValue: '{{current}} of {{total}}',
    current: index >= 0 ? index + 1 : 1,
    total: nav.order.length,
  });
  const selectLabel = t('subShare.nav.menuLabel', {
    defaultValue: "This teacher's boards",
  });

  return (
    <div
      ref={containerRef}
      data-screenshot="exclude"
      className="fixed bottom-6 left-4 z-dock"
    >
      {menuOpen && (
        <div
          id={menuId}
          role="menu"
          aria-label={selectLabel}
          className={MENU_PANEL_CLASS}
        >
          {nav.sections.map((section) => (
            <div key={section.id || 'ungrouped'}>
              {section.name && (
                <div className={MENU_HEADER_CLASS}>{section.name}</div>
              )}
              {section.boards.map((board) => {
                const current = board.id === currentBoardId;
                return (
                  <button
                    key={board.id}
                    type="button"
                    role="menuitem"
                    aria-current={current ? 'true' : undefined}
                    onClick={() => {
                      setMenuOpen(false);
                      if (!current) onPickBoard(board.id);
                    }}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/50 ${
                      current
                        ? 'font-bold text-white bg-white/10'
                        : 'text-slate-200 hover:bg-white/10'
                    }`}
                  >
                    <span className="truncate">{board.name}</span>
                    {current && (
                      <span className="shrink-0 text-xxs font-bold uppercase tracking-wider text-slate-300">
                        {t('subShare.nav.currentTag', { defaultValue: 'Open' })}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {!menuOpen && (
        <div className="absolute bottom-full left-0 mb-1.5 flex max-w-[16rem] items-center gap-1.5 rounded-full bg-slate-900/70 backdrop-blur-sm border border-white/15 px-2.5 py-1 text-xs text-slate-200">
          {currentName && <span className="truncate">{currentName}</span>}
          <span className="shrink-0 text-slate-300">{position}</span>
        </div>
      )}

      <div className="flex items-center gap-1">
        <button
          type="button"
          className={FAB_BASE}
          disabled={!prevId}
          onClick={() => prevId && onPickBoard(prevId)}
          aria-label={t('subShare.nav.previous', {
            defaultValue: 'Previous board',
          })}
          title={t('subShare.nav.previous', { defaultValue: 'Previous board' })}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-controls={menuOpen ? menuId : undefined}
          aria-label={selectLabel}
          title={currentName || selectLabel}
          className={FAB_BASE}
        >
          <LayoutGrid className="w-4 h-4" />
        </button>
        <button
          type="button"
          className={FAB_BASE}
          disabled={!nextId}
          onClick={() => nextId && onPickBoard(nextId)}
          aria-label={t('subShare.nav.next', { defaultValue: 'Next board' })}
          title={t('subShare.nav.next', { defaultValue: 'Next board' })}
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
