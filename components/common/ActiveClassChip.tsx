import React, { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Target, ChevronDown } from 'lucide-react';
import { useDashboard } from '@/context/useDashboard';
import { Z_INDEX } from '@/config/zIndex';

interface ActiveClassChipProps {
  className?: string;
}

export const ActiveClassChip: React.FC<ActiveClassChipProps> = ({
  className,
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
    const handleReposition = () => {
      if (anchorRef.current) {
        setAnchorRect(anchorRef.current.getBoundingClientRect());
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKey);
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKey);
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [open, closeMenu]);

  if (!activeRoster) return null;

  const chipContent = (
    <>
      <Target
        className="text-brand-blue-primary shrink-0"
        style={{
          width: 'clamp(14px, 3.6cqmin, 28px)',
          height: 'clamp(14px, 3.6cqmin, 28px)',
        }}
      />
      <span
        className="font-black uppercase text-brand-blue-primary tracking-wider truncate"
        style={{ fontSize: 'clamp(12px, 3cqmin, 20px)' }}
      >
        {activeRoster.name}
      </span>
      {interactive && (
        <ChevronDown
          className="text-brand-blue-primary shrink-0 opacity-70"
          style={{
            width: 'clamp(12px, 3cqmin, 22px)',
            height: 'clamp(12px, 3cqmin, 22px)',
            transition: 'transform 150ms ease',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        />
      )}
    </>
  );

  const chipClass =
    'flex items-center bg-brand-blue-lighter rounded-full border border-brand-blue-light';
  const chipStyle: React.CSSProperties = {
    gap: 'clamp(6px, 2cqmin, 14px)',
    padding: 'clamp(6px, 1.6cqmin, 12px) clamp(12px, 3cqmin, 22px)',
    minHeight: 'clamp(32px, 8cqmin, 48px)',
  };

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

  const popoverStyle: React.CSSProperties | null = anchorRect
    ? {
        position: 'fixed',
        top: anchorRect.bottom + 6,
        left: Math.min(
          anchorRect.left,
          window.innerWidth - 260 // keep within viewport (max-width ~240 + margin)
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
        className={`${chipClass} hover:bg-brand-blue-light/40 transition-colors cursor-pointer ${className ?? ''}`.trim()}
        style={chipStyle}
        aria-haspopup="listbox"
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
            role="listbox"
            aria-label="Switch active class"
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
                    role="option"
                    aria-selected={isActive}
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
