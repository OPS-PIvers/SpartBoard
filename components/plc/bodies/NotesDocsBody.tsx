import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, StickyNote } from 'lucide-react';
import type { Plc } from '@/types';
import { NotesBody } from './NotesBody';
import { PlcDocsBody } from '@/components/plc/docs/PlcDocsBody';

interface NotesDocsBodyProps {
  plc: Plc;
}

type NotesDocsTab = 'notes' | 'docs';

/**
 * Combined "Notes & Docs" surface (Decisions 2.5, 6.5). The native structured
 * meeting-notes editor (`NotesBody`) is now the live default; the Google-Doc
 * embed (`PlcDocsBody`) stays one tab away so teams that already keep their
 * agenda in a shared Google Doc aren't cut off.
 *
 * Both sub-surfaces read PLC subcollections that the Docs section already gates
 * on (`notes` + `docs` in `SLICE_SECTIONS`), so switching tabs mounts no new
 * listeners — the provider already has both slices live for this section.
 *
 * Modal chrome — normal Tailwind sizing (no container-query units).
 */
export const NotesDocsBody: React.FC<NotesDocsBodyProps> = ({ plc }) => {
  const { t } = useTranslation();
  const [tab, setTab] = useState<NotesDocsTab>('notes');

  const tabs: Array<{
    id: NotesDocsTab;
    label: string;
    icon: typeof StickyNote;
  }> = [
    {
      id: 'notes',
      label: t('plcDashboard.notesDocs.notesTab', {
        defaultValue: 'Meeting Notes',
      }),
      icon: StickyNote,
    },
    {
      id: 'docs',
      label: t('plcDashboard.notesDocs.docsTab', {
        defaultValue: 'Google Docs',
      }),
      icon: FileText,
    },
  ];

  return (
    <div className="flex flex-col h-full p-4 md:p-6 gap-4 overflow-hidden">
      {/* Tab switcher */}
      <div
        className="flex items-center gap-1 shrink-0"
        role="tablist"
        aria-label={t('plcDashboard.notesDocs.tablistLabel', {
          defaultValue: 'Notes and docs',
        })}
      >
        {tabs.map(({ id, label, icon: Icon }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              id={`plc-notesdocs-tab-${id}`}
              aria-controls={`plc-notesdocs-panel-${id}`}
              onClick={() => setTab(id)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/60 ${
                active
                  ? 'bg-brand-blue-primary text-white shadow-sm'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          );
        })}
      </div>

      {/* Active panel. Keep both mounted? No — the Docs embed iframe is heavy;
          mount only the active tab. Switching is cheap (no extra listeners). */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === 'notes' ? (
          <div
            role="tabpanel"
            id="plc-notesdocs-panel-notes"
            aria-labelledby="plc-notesdocs-tab-notes"
            className="h-full"
          >
            <NotesBody plc={plc} />
          </div>
        ) : (
          <div
            role="tabpanel"
            id="plc-notesdocs-panel-docs"
            aria-labelledby="plc-notesdocs-tab-docs"
            className="h-full bg-white border border-slate-200 rounded-2xl overflow-hidden"
          >
            <PlcDocsBody plc={plc} />
          </div>
        )}
      </div>
    </div>
  );
};
