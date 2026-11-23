import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Footprints, Sparkles } from 'lucide-react';
import type { ChangelogWidgetNote } from '@/hooks/useChangelog';
import type { WidgetNotesList } from '@/hooks/useWidgetWhatsNew';
import { useToolLabel } from '@/hooks/useToolLabel';
import { useHasLiveTour } from '@/components/tours/useTourOffers';
import { TOOLS } from '@/config/tools';
import type { WidgetType } from '@/types';

const TOOL_BY_TYPE = new Map(TOOLS.map((tool) => [tool.type, tool]));

const NoteText: React.FC<{
  note: ChangelogWidgetNote;
  onShowTour: (setId: string) => void;
}> = ({ note, onShowTour }) => {
  const { t } = useTranslation();
  const hasTour = useHasLiveTour(note.tourSetId);
  return (
    <li className="border-l-2 border-slate-200 pl-3 text-[13px] leading-relaxed text-slate-700">
      {note.text}
      {hasTour && note.tourSetId && (
        <button // no-tour-anchor: tour launcher inside the release notes, which a tour does not walk
          type="button"
          onClick={() => note.tourSetId && onShowTour(note.tourSetId)}
          className="ml-2 inline-flex items-center gap-1 rounded text-xs font-semibold text-brand-blue-primary hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-blue-light"
        >
          <Footprints className="h-3 w-3" aria-hidden="true" />
          {t('tours.showMe')}
        </button>
      )}
    </li>
  );
};

const WidgetRow: React.FC<{
  widget: WidgetType;
  notes: ChangelogWidgetNote[];
  label: string;
  onShowTour: (setId: string) => void;
}> = ({ widget, notes, label, onShowTour }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const tool = TOOL_BY_TYPE.get(widget);
  const Icon = tool?.icon ?? Sparkles;
  const shown = open ? notes : notes.slice(0, 1);
  return (
    <li className="flex gap-3 py-2.5">
      <div
        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white ${tool?.color ?? 'bg-slate-500'}`}
        aria-hidden="true"
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-slate-800">{label}</p>
        <ul className="mt-1 flex flex-col gap-1.5">
          {shown.map((note) => (
            <NoteText key={note.id} note={note} onShowTour={onShowTour} />
          ))}
        </ul>
        {notes.length > 1 && (
          <button // no-tour-anchor: expands one widget's notes in the release notes
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="mt-1 rounded text-xs font-semibold text-brand-blue-primary hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-blue-light"
          >
            {open
              ? t('widgetWhatsNew.showLess')
              : t('widgetWhatsNew.more', { count: notes.length - 1 })}
          </button>
        )}
      </div>
    </li>
  );
};

/** Every widget's current update notes, listed above the release notes; showing them marks them seen. */
export const WhatsNewWidgetUpdates: React.FC<{
  list: WidgetNotesList;
  onShowTour: (setId: string) => void;
}> = ({ list, onShowTour }) => {
  const { t } = useTranslation();
  const labelFor = useToolLabel();
  const { groups, markSeen } = list;
  // Seeing the list counts as reading every note on it, which clears the sidebar dot.
  useEffect(() => markSeen(), [markSeen]);
  if (groups.length === 0) return null;
  return (
    <section className="pb-5 mb-5 border-b border-slate-100">
      <h3 className="text-xxs font-bold uppercase tracking-wide text-slate-500">
        {t('widgetWhatsNew.listTitle')}
      </h3>
      <ul className="divide-y divide-slate-100">
        {groups.map((group) => (
          <WidgetRow
            key={group.widget}
            widget={group.widget}
            notes={group.notes}
            label={labelFor(group.widget)}
            onShowTour={onShowTour}
          />
        ))}
      </ul>
    </section>
  );
};
