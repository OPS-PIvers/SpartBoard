import React, { useContext, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Footprints, Sparkles, X } from 'lucide-react';
import type { WidgetType } from '@/types';
import { IconButton } from '@/components/common/IconButton';
import { AuthContext } from '@/context/AuthContextValue';
import { useWidgetWhatsNew } from '@/hooks/useWidgetWhatsNew';
import { useHasLiveTour } from '@/components/tours/useTourOffers';
import { requestStartTour } from '@/components/tours/tourState';

const GAP = 8;
const CARD_WIDTH = 288;

interface WidgetWhatsNewButtonProps {
  expanded: boolean;
  onExpand: () => void;
  onDismiss: () => void;
}

/** The small what's-new button floating just below a widget window. */
export const WidgetWhatsNewButton: React.FC<WidgetWhatsNewButtonProps> = ({
  expanded,
  onExpand,
  onDismiss,
}) => {
  const { t } = useTranslation();
  return (
    <div className="inline-flex items-center rounded-lg border border-slate-200/80 bg-white/90 shadow-md backdrop-blur animate-in fade-in duration-200">
      <button
        type="button"
        onClick={onExpand}
        aria-expanded={expanded}
        className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-l-lg py-1 pl-2.5 pr-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary"
      >
        <Sparkles
          className="h-3.5 w-3.5 text-brand-blue-primary"
          aria-hidden="true"
        />
        {t('widgetWhatsNew.label')}
      </button>
      <IconButton
        icon={<X className="h-3.5 w-3.5" />}
        label={t('widgetWhatsNew.dismiss')}
        size="sm"
        onClick={onDismiss}
        className="mr-1"
      />
    </div>
  );
};

interface WidgetWhatsNewCardProps {
  text: string;
  onDismiss: () => void;
  onShowMe?: () => void;
}

/** The opened what's-new note. */
export const WidgetWhatsNewCard: React.FC<WidgetWhatsNewCardProps> = ({
  text,
  onDismiss,
  onShowMe,
}) => {
  const { t } = useTranslation();
  return (
    <div
      role="dialog"
      aria-label={t('widgetWhatsNew.label')}
      style={{ width: CARD_WIDTH }}
      className="flex flex-col rounded-xl border border-slate-200 bg-white shadow-xl animate-in fade-in zoom-in-95 duration-200"
    >
      <div className="flex items-center gap-1.5 pl-3 pr-1 pt-1.5">
        <Sparkles
          className="h-3.5 w-3.5 shrink-0 text-brand-blue-primary"
          aria-hidden="true"
        />
        <p className="flex-1 text-sm font-black text-slate-900">
          {t('widgetWhatsNew.label')}
        </p>
        <IconButton
          icon={<X className="h-4 w-4" />}
          label={t('widgetWhatsNew.dismiss')}
          size="sm"
          onClick={onDismiss}
        />
      </div>
      <p className="px-3 pb-2 text-[13px] font-medium leading-relaxed text-slate-700">
        {text}
      </p>
      <div className="flex justify-center gap-2 border-t border-slate-100 px-3 py-2">
        {onShowMe && (
          <button
            type="button"
            onClick={onShowMe}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-blue-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-blue-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary focus-visible:ring-offset-2"
          >
            <Footprints className="h-3.5 w-3.5" aria-hidden="true" />
            {t('tours.showMe')}
          </button>
        )}
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary"
        >
          {t('widgetWhatsNew.gotIt')}
        </button>
      </div>
    </div>
  );
};

interface WidgetWhatsNewProps {
  widgetType: WidgetType;
  /** The window's box on the board, so the notice sits in the same layer and moves with it. */
  box: { left: number; top: number; width: number; height: number };
  zIndex: number;
}

/** A widget's what's-new button below its window, with the note opening beside it; gated by `widget-whats-new`. */
export const WidgetWhatsNew: React.FC<WidgetWhatsNewProps> = (props) =>
  useContext(AuthContext)?.canAccessFeature('widget-whats-new') ? (
    <WidgetWhatsNewNotice {...props} />
  ) : null;

const WidgetWhatsNewNotice: React.FC<WidgetWhatsNewProps> = ({
  widgetType,
  box,
  zIndex,
}) => {
  const { note, dismiss } = useWidgetWhatsNew(widgetType);
  const hasTour = useHasLiveTour(note?.tourSetId);
  const [side, setSide] = useState<'left' | 'right' | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  if (!note) return null;

  const toggle = () => {
    if (side) {
      setSide(null);
      return;
    }
    const rect = rootRef.current?.getBoundingClientRect();
    const fitsRight =
      !rect || rect.right + GAP * 1.5 + CARD_WIDTH <= window.innerWidth;
    setSide(fitsRight || (rect?.left ?? 0) < CARD_WIDTH ? 'right' : 'left');
  };
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <div
      ref={rootRef}
      data-widget-whats-new=""
      className="pointer-events-none absolute"
      style={{ ...box, zIndex }}
      onPointerDown={stop}
      onClick={stop}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && side) {
          e.stopPropagation();
          setSide(null);
        }
      }}
    >
      <div
        className="pointer-events-auto absolute inset-x-0 flex justify-center"
        style={{ top: `calc(100% + ${GAP}px)` }}
      >
        <WidgetWhatsNewButton
          expanded={side !== null}
          onExpand={toggle}
          onDismiss={dismiss}
        />
      </div>
      {side && (
        <div
          className="pointer-events-auto absolute bottom-0"
          style={
            side === 'right'
              ? { left: `calc(100% + ${GAP * 1.5}px)` }
              : { right: `calc(100% + ${GAP * 1.5}px)` }
          }
        >
          <WidgetWhatsNewCard
            text={note.text}
            onDismiss={dismiss}
            onShowMe={
              hasTour && note.tourSetId
                ? () => {
                    const setId = note.tourSetId as string;
                    dismiss();
                    requestStartTour({ setId });
                  }
                : undefined
            }
          />
        </div>
      )}
    </div>
  );
};
