import React, { useEffect, useId, useRef, useState } from 'react';
import { CircleHelp } from 'lucide-react';
import { tourAttr } from '@/config/tourAnchors';
import { useRunnableTourIds } from '@/components/tours/useTourOffers';
import { requestStartTour } from '@/components/tours/tourState';
import type { HelpResourceItem } from '@/types/helpCenter';
import { StudentHelpMenu } from './StudentHelpMenu';

/** A floating Help button on student pages; shown only when a Published student tour can run. */
export const StudentHelpButton: React.FC<{
  items: readonly HelpResourceItem[];
  /** Admins in View as student get Record a tour. */
  onRecord?: () => void;
}> = ({ items, onRecord }) => {
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const runnable = useRunnableTourIds(
    items.flatMap((item) => (item.setId ? [item.setId] : []))
  );
  const tours = items.filter(
    (item) => !!item.setId && runnable.has(item.setId)
  );

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (tours.length === 0 && !onRecord) return null;

  const play = (item: HelpResourceItem) => {
    setOpen(false);
    if (item.setId) requestStartTour({ setId: item.setId });
  };

  return (
    <div
      ref={containerRef}
      className="fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-50"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        className="flex items-center gap-1.5 rounded-full bg-white/90 hover:bg-white backdrop-blur-xl border border-slate-200 shadow-md px-3 py-2 text-sm font-semibold text-brand-blue-primary transition-colors cursor-pointer touch-target-expand focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-blue-primary"
        {...tourAttr('student.help')}
      >
        <CircleHelp className="w-4 h-4" aria-hidden="true" />
        Help
      </button>
      {open && (
        <StudentHelpMenu
          id={menuId}
          tours={tours}
          onPlay={play}
          onRecord={
            onRecord &&
            (() => {
              setOpen(false);
              onRecord();
            })
          }
        />
      )}
    </div>
  );
};
