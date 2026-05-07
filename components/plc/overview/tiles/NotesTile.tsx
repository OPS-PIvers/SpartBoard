import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Loader2, StickyNote } from 'lucide-react';
import { Plc } from '@/types';
import { usePlcNotes } from '@/hooks/usePlcNotes';
import type { PlcDashboardTabId } from '../../PlcDashboard';

interface NotesTileProps {
  plc: Plc;
  onNavigateTab: (tabId: PlcDashboardTabId) => void;
}

const PREVIEW_LIMIT = 3;
const BODY_TRUNCATE_AT = 90;

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1).trimEnd() + '…';
}

export const NotesTile: React.FC<NotesTileProps> = ({ plc, onNavigateTab }) => {
  const { t } = useTranslation();
  const { notes, loading } = usePlcNotes(plc.id);
  const preview = notes.slice(0, PREVIEW_LIMIT);

  // Capture "now" once at mount. Frozen across re-renders is fine for
  // a preview tile — exact relative-time accuracy isn't critical, and
  // the lint rule forbids calling Date.now() inside render.
  const [now] = useState(() => Date.now());
  const relativeTime = (ms: number): string => {
    if (!ms) return '';
    const diff = Math.max(0, now - ms);
    const min = 60 * 1000;
    const hr = 60 * min;
    const day = 24 * hr;
    if (diff < min)
      return t('plcDashboard.overview.tiles.notes.justNow', {
        defaultValue: 'just now',
      });
    if (diff < hr)
      return t('plcDashboard.overview.tiles.notes.minutesAgo', {
        defaultValue: '{{count}}m ago',
        count: Math.floor(diff / min),
      });
    if (diff < day)
      return t('plcDashboard.overview.tiles.notes.hoursAgo', {
        defaultValue: '{{count}}h ago',
        count: Math.floor(diff / hr),
      });
    return t('plcDashboard.overview.tiles.notes.daysAgo', {
      defaultValue: '{{count}}d ago',
      count: Math.floor(diff / day),
    });
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 px-4 pt-4 pb-2">
        <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center">
          <StickyNote className="w-3.5 h-3.5 text-amber-600" />
        </div>
        <h4 className="text-xxs font-bold uppercase tracking-widest text-slate-500">
          {t('plcDashboard.overview.tiles.notes.heading', {
            defaultValue: 'Notes',
          })}
        </h4>
        {notes.length > 0 && (
          <span className="ml-auto text-xs font-bold text-slate-700">
            {notes.length}
          </span>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4 pb-2">
        {loading ? (
          <div className="flex items-center justify-center h-full text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin" />
          </div>
        ) : preview.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-xs text-slate-500 py-2">
            <StickyNote className="w-6 h-6 text-slate-300 mb-2" />
            <p className="font-semibold text-slate-600">
              {t('plcDashboard.overview.tiles.notes.empty', {
                defaultValue: 'No notes yet',
              })}
            </p>
            <p className="text-xxs text-slate-400 mt-1">
              {t('plcDashboard.overview.tiles.notes.emptySubtitle', {
                defaultValue: 'Capture meeting notes, decisions, ideas.',
              })}
            </p>
          </div>
        ) : (
          <ul className="space-y-2 py-1">
            {preview.map((note) => (
              <li
                key={note.id}
                className="px-2 py-2 rounded-lg hover:bg-amber-50/60 transition-colors"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <div className="text-xs font-bold text-slate-800 truncate">
                    {note.title || (
                      <span className="italic text-slate-400">
                        {t('plcDashboard.overview.tiles.notes.untitled', {
                          defaultValue: 'Untitled',
                        })}
                      </span>
                    )}
                  </div>
                  <span className="shrink-0 text-xxs text-slate-400">
                    {relativeTime(note.lastEditedAt)}
                  </span>
                </div>
                {note.body && (
                  <p className="text-xxs text-slate-500 line-clamp-2 mt-0.5">
                    {truncate(note.body, BODY_TRUNCATE_AT)}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <button
        type="button"
        onClick={() => onNavigateTab('notes')}
        className="flex items-center justify-center gap-1.5 px-4 py-2.5 border-t border-slate-100 text-xxs font-bold uppercase tracking-wider text-amber-700 hover:bg-amber-50/60 transition-colors"
      >
        {t('plcDashboard.overview.tiles.notes.openAll', {
          defaultValue: 'Open notes',
        })}
        <ChevronRight className="w-3 h-3" />
      </button>
    </div>
  );
};
