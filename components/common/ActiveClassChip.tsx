import React, { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Target, ChevronDown } from 'lucide-react';
import { useDashboard } from '@/context/useDashboard';
import { Z_INDEX } from '@/config/zIndex';

interface ActiveClassChipProps {
  className?: string;
  /**
   * When true, render the trigger as a compact button matching the
   * Shuffle/Rotate-style header buttons used in the Stations widget
   * (white shell, slate border, brand-blue icon/label, smaller height).
   * Default keeps the original pill visual used by Random / SeatingChart /
   * LunchCount.
   */
  compact?: boolean;
}

export const ActiveClassChip: React.FC<ActiveClassChipProps> = ({
  className,
  compact = false,
}) => {
  const { rosters, activeRosterId, setActiveRoster } = useDashboard();
  const activeRoster = rosters.find((r) => r.id === activeRosterId);

  const anchorRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

  const interactive = rosters.length > 1;

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
    const handleMouseDown = (event: MouseEvent) => {
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
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKey);
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);
    return () => {
      cancelAnimationFrame(animationFrameId);
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKey);
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [open, closeMenu]);

  // Move focus into the menu when it opens, and back to the trigger when it
  // closes — required for keyboard users since the popover is portaled to
  // <body> and is not reachable via natural tab order.
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (open) {
      wasOpenRef.current = true;
      const items = popoverRef.current?.querySelectorAll<HTMLButtonElement>(
        '[role="menuitemradio"]'
      );
      if (items && items.length > 0) {
        const activeIdx = Array.from(items).findIndex(
          (item) => item.getAttribute('aria-checked') === 'true'
        );
        items[activeIdx >= 0 ? activeIdx : 0].focus();
      }
    } else if (wasOpenRef.current) {
      wasOpenRef.current = false;
      anchorRef.current?.focus();
    }
  }, [open]);

  const handleMenuKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const items = popoverRef.current?.querySelectorAll<HTMLButtonElement>(
        '[role="menuitemradio"]'
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

  // Auto-close if the chip stops being interactive (e.g. roster deleted,
  // active roster cleared) while the menu is open — otherwise the global
  // listeners would stay registered against a portal that no longer renders.
  if (open && (!interactive || !activeRoster)) {
    setOpen(false);
  }

  if (!activeRoster) return null;

  const iconSizeStyle = compact
    ? { width: 'min(14px, 4cqmin)', height: 'min(14px, 4cqmin)' }
    : {
        width: 'clamp(14px, 3.6cqmin, 28px)',
        height: 'clamp(14px, 3.6cqmin, 28px)',
      };
  const labelFontStyle = compact
    ? { fontSize: 'min(11px, 3.5cqmin)' }
    : { fontSize: 'clamp(12px, 3cqmin, 20px)' };
  const chevronSizeStyle = compact
    ? { width: 'min(12px, 3.5cqmin)', height: 'min(12px, 3.5cqmin)' }
    : {
        width: 'clamp(12px, 3cqmin, 22px)',
        height: 'clamp(12px, 3cqmin, 22px)',
      };

  const chipContent = (
    <>
      <Target
        className="text-brand-blue-primary shrink-0"
        style={iconSizeStyle}
      />
      <span
        className={`font-black uppercase text-brand-blue-primary truncate min-w-0 ${
          compact ? 'tracking-widest' : 'tracking-wider'
        }`}
        style={labelFontStyle}
      >
        {activeRoster.name}
      </span>
      {interactive && (
        <ChevronDown
          className="text-brand-blue-primary shrink-0 opacity-70"
          style={{
            ...chevronSizeStyle,
            transition: 'transform 150ms ease',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        />
      )}
    </>
  );

  const chipClass = compact
    ? 'flex items-center rounded-xl bg-white border border-slate-200'
    : 'flex items-center bg-brand-blue-lighter rounded-full border border-brand-blue-light';
  const chipStyle: React.CSSProperties = compact
    ? {
        gap: 'min(6px, 1.5cqmin)',
        padding: 'min(6px, 1.5cqmin) min(10px, 2.5cqmin)',
        height: 'min(32px, 8cqmin)',
      }
    : {
        gap: 'clamp(6px, 2cqmin, 14px)',
        padding: 'clamp(6px, 1.6cqmin, 12px) clamp(12px, 3cqmin, 22px)',
        minHeight: 'clamp(32px, 8cqmin, 48px)',
      };

  const interactiveHoverClass = compact
    ? 'hover:bg-slate-50 transition-colors cursor-pointer'
    : 'hover:bg-brand-blue-light/40 transition-colors cursor-pointer';

  if (!interactive) {
    return (
      <div
        className={`${chipClass} ${className ?? ''}`.trim()}
        style={chipStyle}
        aria-label={`Active class: ${activeRoster.name}`}
      >
        {chipContent}
      </div>
    );
  }

  const POPOVER_MAX_WIDTH = 260;
  const POPOVER_VIEWPORT_MARGIN = 8;
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
        className={`${chipClass} ${interactiveHoverClass} ${className ?? ''}`.trim()}
        style={chipStyle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Active class: ${activeRoster.name}. Click to switch class.`}
      >
        {chipContent}
      </button>

      {open &&
        popoverStyle &&
        createPortal(
          <div
            ref={popoverRef}
            role="menu"
            aria-label="Switch active class"
            onKeyDown={handleMenuKeyDown}
            style={popoverStyle}
            className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2 motion-safe:duration-150 min-w-[200px] max-w-[260px] bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden"
          >
            <div className="px-3 py-2 bg-slate-50 border-b border-slate-200">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                Switch Class
              </span>
            </div>
            <div className="max-h-64 overflow-y-auto py-1">
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
          </div>,
          document.body
        )}
    </>
  );
};
