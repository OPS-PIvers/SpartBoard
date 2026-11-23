import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CircleHelp } from 'lucide-react';
import { useAuth } from '@/context/useAuth';
import { tourAttr } from '@/config/tourAnchors';
import {
  incrementHelpOpenCount,
  useHelpResources,
} from '@/hooks/useHelpResources';
import { useRunnableTourIds } from '@/components/tours/useTourOffers';
import {
  requestRecordTour,
  requestStartTour,
} from '@/components/tours/tourState';
import type { HelpResourceItem } from '@/types/helpCenter';
import { SubsHelpMenu } from './SubsHelpMenu';

interface SubsHelpButtonProps {
  /** `header` sits in the light portal header; `board` floats over a sub board. */
  variant: 'header' | 'board';
}

const CLASS: Record<SubsHelpButtonProps['variant'], string> = {
  header:
    'inline-flex items-center gap-1.5 rounded-md bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 px-2.5 py-1.5 text-xs transition-colors cursor-pointer touch-target-expand focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40',
  board:
    'flex items-center gap-1.5 rounded-full bg-white/85 hover:bg-white backdrop-blur-xl border border-slate-200/70 shadow-md px-3 py-1.5 text-xs font-bold text-brand-blue-primary transition-colors cursor-pointer touch-target-expand focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-blue-primary',
};

/** Help on every /subs screen: the subs' published live tours, plus Record a tour for admins. */
export const SubsHelpButton: React.FC<SubsHelpButtonProps> = ({ variant }) => {
  const { canAccessFeature, isAdmin } = useAuth();
  if (!canAccessFeature('subs-live-tours')) return null;
  return <HelpButton variant={variant} canRecord={isAdmin === true} />;
};

const HelpButton: React.FC<SubsHelpButtonProps & { canRecord: boolean }> = ({
  variant,
  canRecord,
}) => {
  const { t } = useTranslation();
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { items } = useHelpResources({
    includeHidden: false,
    audience: 'subs',
  });
  const guides = useMemo(
    () => items.filter((item) => item.kind === 'guided-learning'),
    [items]
  );
  const runnable = useRunnableTourIds(
    guides.flatMap((item) => (item.setId ? [item.setId] : []))
  );
  const tours = guides.filter(
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

  // Stays up during a tour, so a step can point at it; the runner ignores a second start.
  if (tours.length === 0 && !canRecord) return null;

  const play = (item: HelpResourceItem) => {
    setOpen(false);
    if (!item.setId) return;
    void incrementHelpOpenCount(item.id);
    requestStartTour({ setId: item.setId });
  };
  const record = () => {
    setOpen(false);
    requestRecordTour('subs');
  };

  const label = t('subsTours.help', { defaultValue: 'Help' });
  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        className={CLASS[variant]}
        {...tourAttr('subs.help')}
      >
        <CircleHelp className="w-3.5 h-3.5" aria-hidden="true" />
        {label}
      </button>
      {open && (
        <SubsHelpMenu
          id={menuId}
          tours={tours}
          canRecord={canRecord}
          onPlay={play}
          onRecord={record}
        />
      )}
    </div>
  );
};
