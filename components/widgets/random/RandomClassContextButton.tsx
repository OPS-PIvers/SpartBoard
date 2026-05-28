import React, { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Target, ChevronDown, UserX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useDashboard } from '@/context/useDashboard';
import { Z_INDEX } from '@/config/zIndex';
import type { ClassRoster } from '@/types';
import { getLocalIsoDate } from '@/utils/localDate';

interface RandomClassContextButtonProps {
  /**
   * The roster the Randomizer is currently pointed at, or null/undefined when
   * no roster is active (e.g. custom-names mode). The component itself
   * renders nothing in that case — keeps the header right side empty rather
   * than showing a button with no class to represent.
   */
  roster: ClassRoster | null | undefined;
  /**
   * `'class'` enables the "Mark absent students" footer action inside the
   * popover. Any other value (e.g. `'custom'`) suppresses it so the
   * Randomizer never opens the absent modal against a roster it's ignoring.
   */
  rosterMode: 'class' | 'custom' | undefined;
  /**
   * Hoisted by RandomWidget so its empty-state branch can also open the
   * modal. The button does not render the modal itself.
   */
  onOpenAbsentModal: () => void;
}

/**
 * Randomizer-specific consolidation of `ActiveClassChip` + `AbsentButton`
 * into a single icon-only chip with a popover containing the class name,
 * the class switcher, and the absent-students action. Reduces header
 * pressure at narrow widget widths where four labelled chips would crowd
 * each other.
 *
 * Scope is intentionally Randomizer-only — Stations, SeatingChart, and
 * LunchCount keep the separate chip pair. If the consolidation proves out
 * here, lift it into a shared component.
 */
export const RandomClassContextButton: React.FC<
  RandomClassContextButtonProps
> = ({ roster, rosterMode, onOpenAbsentModal }) => {
  const { t } = useTranslation();
  const { rosters, activeRosterId, setActiveRoster } = useDashboard();

  const anchorRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

  const today = getLocalIsoDate();
  const absentCount =
    rosterMode === 'class' && roster?.absent?.date === today
      ? (roster.absent.studentIds?.length ?? 0)
      : 0;

  const canSwitchClass = rosters.length > 1;
  const canMarkAbsent =
    rosterMode === 'class' && !!roster && roster.students.length > 0;
  const interactive = canSwitchClass || canMarkAbsent;

  const openMenu = useCallback(() => {
    if (!anchorRef.current) return;
    setAnchorRect(anchorRef.current.getBoundingClientRect());
    setOpen(true);
  }, []);

  const closeMenu = useCallback(() => {
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (popoverRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      closeMenu();
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu();
    };
    let animationFrameId = 0;
    const handleReposition = () => {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = requestAnimationFrame(() => {
        if (anchorRef.current) {
          setAnchorRect(anchorRef.current.getBoundingClientRect());
        }
      });
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKey);
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);
    return () => {
      cancelAnimationFrame(animationFrameId);
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKey);
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [open, closeMenu]);

  // Move focus into the popover on open, back to the trigger on close —
  // required for keyboard users since the popover is portaled to <body>.
  // Prefer the currently-active menuitemradio so the menu opens oriented
  // on the user's current selection (matches ActiveClassChip behavior).
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (open) {
      wasOpenRef.current = true;
      const items = popoverRef.current?.querySelectorAll<HTMLElement>(
        '[role="menuitemradio"], [role="menuitem"]'
      );
      if (items && items.length > 0) {
        const list = Array.from(items);
        const activeIdx = list.findIndex(
          (item) => item.getAttribute('aria-checked') === 'true'
        );
        list[activeIdx >= 0 ? activeIdx : 0].focus();
      }
    } else if (wasOpenRef.current) {
      wasOpenRef.current = false;
      anchorRef.current?.focus();
    }
  }, [open]);

  const handleMenuKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const items = popoverRef.current?.querySelectorAll<HTMLButtonElement>(
        '[role="menuitemradio"], [role="menuitem"]'
      );
      if (!items || items.length === 0) return;
      const list = Array.from(items);
      const currentIdx = list.indexOf(
        document.activeElement as HTMLButtonElement
      );
      let nextIdx = -1;
      if (event.key === 'ArrowDown') {
        nextIdx = currentIdx < 0 ? 0 : (currentIdx + 1) % list.length;
      } else if (event.key === 'ArrowUp') {
        nextIdx = currentIdx <= 0 ? list.length - 1 : currentIdx - 1;
      } else if (event.key === 'Home') {
        nextIdx = 0;
      } else if (event.key === 'End') {
        nextIdx = list.length - 1;
      }
      if (nextIdx >= 0) {
        event.preventDefault();
        list[nextIdx].focus();
      }
    },
    []
  );

  // Auto-close if the chip's reason to exist disappears while open —
  // otherwise the portal lingers without an anchor. Also close when the
  // chip transitions to the non-interactive branch (no roster, no switch,
  // no absent action), since that branch never attaches anchorRef and the
  // focus-restore effect would dump focus on <body>.
  if (open && (!roster || !interactive)) {
    setOpen(false);
  }

  if (!roster) return null;

  // Custom-names mode intentionally ignores roster absence — keep the
  // accessible name focused on class identity in that case so screen
  // readers don't announce a "0 marked absent today" phrase for a widget
  // that doesn't track absences.
  const triggerLabel =
    rosterMode === 'class'
      ? t('widgets.random.classContext.triggerAriaWithAbsent', {
          defaultValue:
            'Active class: {{name}}. {{count}} students marked absent today.',
          name: roster.name,
          count: absentCount,
        })
      : t('widgets.random.classContext.triggerAria', {
          defaultValue: 'Active class: {{name}}',
          name: roster.name,
        });

  const buttonClass =
    'relative flex items-center justify-center rounded-xl bg-white border border-slate-200 transition-colors';
  const buttonStyle: React.CSSProperties = {
    padding: 'clamp(6px, 2cqmin, 14px)',
    minHeight: 'clamp(32px, 8cqmin, 48px)',
    minWidth: 'clamp(32px, 8cqmin, 48px)',
  };
  const iconStyle: React.CSSProperties = {
    width: 'clamp(14px, 4cqmin, 22px)',
    height: 'clamp(14px, 4cqmin, 22px)',
  };

  // Badge gated on canMarkAbsent (not just absentCount > 0): if a roster
  // has stale absent IDs but students were removed mid-day, the absent
  // action is unreachable — showing the badge would be a misleading
  // notification with no UI to clear it.
  const chipBody = (
    <>
      <Target className="text-brand-blue-primary shrink-0" style={iconStyle} />
      {canMarkAbsent && absentCount > 0 && (
        <span
          className="absolute font-black bg-red-500 text-white rounded-full leading-none tabular-nums shrink-0 pointer-events-none"
          style={{
            top: 'clamp(-3px, -0.6cqmin, -2px)',
            right: 'clamp(-3px, -0.6cqmin, -2px)',
            fontSize: 'clamp(9px, 3cqmin, 12px)',
            padding: 'clamp(2px, 0.6cqmin, 3px) clamp(5px, 1.6cqmin, 8px)',
          }}
          aria-hidden="true"
        >
          {absentCount}
        </span>
      )}
    </>
  );

  if (!interactive) {
    // Static branch: aria-label on a bare <div> is ignored by AT.
    // role="img" lets the aria-label become the accessible name; a
    // visually-hidden span backs it up via accessible-name-from-content
    // for AT that ignores the role override.
    return (
      <div
        className={buttonClass}
        style={buttonStyle}
        role="img"
        aria-label={triggerLabel}
      >
        {chipBody}
        <span className="sr-only">{triggerLabel}</span>
      </div>
    );
  }

  const POPOVER_MAX_WIDTH = 280;
  const POPOVER_VIEWPORT_MARGIN = 8;
  // Anchor under the trigger's left edge so the popover tracks the chip
  // even when the widget is near the viewport edge (matches ActiveClassChip).
  const popoverStyle: React.CSSProperties | null = anchorRect
    ? {
        position: 'fixed',
        top: anchorRect.bottom + 6,
        left: Math.max(
          POPOVER_VIEWPORT_MARGIN,
          Math.min(
            anchorRect.left,
            window.innerWidth - POPOVER_MAX_WIDTH - POPOVER_VIEWPORT_MARGIN
          )
        ),
        zIndex: Z_INDEX.popover,
      }
    : null;

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        onClick={() => (open ? closeMenu() : openMenu())}
        className={`${buttonClass} hover:bg-slate-50 cursor-pointer focus-visible:outline-2 focus-visible:outline-brand-blue-primary focus-visible:outline-offset-2`}
        style={buttonStyle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={triggerLabel}
      >
        {chipBody}
      </button>

      {open &&
        popoverStyle &&
        createPortal(
          <div
            ref={popoverRef}
            role="menu"
            aria-label={t('widgets.random.classContext.menuAria', {
              defaultValue: 'Class context for Randomizer',
            })}
            onKeyDown={handleMenuKeyDown}
            style={popoverStyle}
            className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2 motion-safe:duration-150 min-w-[220px] max-w-[280px] bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden"
          >
            <div className="px-3 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
              <Target className="w-4 h-4 text-brand-blue-primary shrink-0" />
              <span className="text-sm font-black text-brand-blue-primary tracking-wide truncate">
                {roster.name}
              </span>
              {canSwitchClass && (
                <ChevronDown
                  className="ml-auto w-3.5 h-3.5 text-slate-400 shrink-0"
                  aria-hidden="true"
                />
              )}
            </div>
            {canSwitchClass && (
              <div className="border-b border-slate-200">
                <div className="px-3 pt-2 pb-1">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    {t('widgets.random.classContext.switchHeading', {
                      defaultValue: 'Switch class',
                    })}
                  </span>
                </div>
                <div className="max-h-48 overflow-y-auto pb-1">
                  {rosters.map((r) => {
                    const isActive = r.id === activeRosterId;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        role="menuitemradio"
                        aria-checked={isActive}
                        onClick={() => {
                          if (!isActive) setActiveRoster(r.id);
                          closeMenu();
                        }}
                        className={`w-full flex items-center justify-between px-3 py-2 text-left transition-colors ${
                          isActive
                            ? 'bg-brand-blue-lighter text-brand-blue-primary'
                            : 'hover:bg-slate-50 text-slate-700'
                        }`}
                      >
                        <span
                          className={`text-sm truncate ${isActive ? 'font-black' : 'font-semibold'}`}
                        >
                          {r.name}
                        </span>
                        <span
                          className={`text-[10px] font-bold tabular-nums ml-2 px-2 py-0.5 rounded-full shrink-0 ${
                            isActive
                              ? 'bg-white text-brand-blue-primary border border-brand-blue-light'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {r.studentCount}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {canMarkAbsent && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  closeMenu();
                  onOpenAbsentModal();
                }}
                className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <UserX className="w-4 h-4 text-slate-500 shrink-0" />
                  <span className="text-sm font-semibold truncate">
                    {t('widgets.random.classContext.markAbsentAction', {
                      defaultValue: 'Mark absent students',
                    })}
                  </span>
                </span>
                {absentCount > 0 && (
                  <span className="text-[10px] font-black bg-red-500 text-white rounded-full leading-none tabular-nums shrink-0 px-2 py-0.5">
                    {absentCount}
                  </span>
                )}
              </button>
            )}
          </div>,
          document.body
        )}
    </>
  );
};
