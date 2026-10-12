// Notes & Docs page layout: the notes list with earlier meeting records, and the open note (TEAMS_REDESIGN T11, T15).

import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, FileText, Plus } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { IconButton } from '@/components/common/IconButton';
import { useClickOutside } from '@/hooks/useClickOutside';
import {
  EYEBROW,
  MENU_ITEM,
  MENU_PANEL,
} from '@/components/plc/redesignMockup/ui';
import { tourAttr, tourFieldAttr } from '@/config/tourAnchors';

export interface NotesListEntry {
  key: string;
  title: string;
  meta: string;
  active: boolean;
  /** Docs and old meeting records show a file glyph. */
  icon?: boolean;
  onSelect: () => void;
}

export interface NewMenuItem {
  key: string;
  label: string;
  run: () => void;
}

const NoteListItem: React.FC<{ entry: NotesListEntry }> = ({ entry }) => (
  <button
    type="button"
    aria-current={entry.active || undefined}
    {...tourFieldAttr('teams.notes.list-entry', 'teams-notes', entry.key)}
    onClick={entry.onSelect}
    className={`flex w-full flex-col rounded-xl px-3 py-2 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40 ${
      entry.active ? 'bg-brand-blue-lighter' : 'hover:bg-slate-100'
    }`}
  >
    <span className="flex w-full items-center gap-1.5 text-xs font-bold text-slate-800">
      {entry.icon && (
        <FileText
          className="h-3 w-3 shrink-0 text-slate-400"
          aria-hidden="true"
        />
      )}
      <span className="min-w-0 truncate">{entry.title}</span>
    </span>
    <span className="mt-0.5 w-full truncate text-xxs text-slate-500">
      {entry.meta}
    </span>
  </button>
);

export interface NotesDocsViewProps {
  entries: NotesListEntry[];
  records: NotesListEntry[];
  canEdit: boolean;
  creating?: boolean;
  onNewMeetingNote: () => void;
  newMenu: NewMenuItem[];
  emptyList?: React.ReactNode;
  children: React.ReactNode;
}

export const NotesDocsView: React.FC<NotesDocsViewProps> = ({
  entries,
  records,
  canEdit,
  creating = false,
  onNewMeetingNote,
  newMenu,
  emptyList,
  children,
}) => {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useClickOutside(menuRef, () => setMenuOpen(false));
  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="flex min-h-0 flex-col border-r border-slate-200 bg-slate-50">
        {canEdit && (
          <div className="flex shrink-0 items-center gap-2 border-b border-slate-100 px-4 py-3">
            <Button
              size="sm"
              className="flex-1"
              disabled={creating}
              {...tourAttr('teams.notes.new-meeting-note')}
              onClick={onNewMeetingNote}
              icon={<Plus className="h-3.5 w-3.5" aria-hidden="true" />}
            >
              {t('plcDashboard.notes.meeting.newMeetingNote', {
                defaultValue: 'New meeting note',
              })}
            </Button>
            {newMenu.length > 0 && (
              <div ref={menuRef} className="relative">
                <IconButton
                  icon={<ChevronDown className="h-4 w-4" />}
                  label={t('teams.notes.otherNew', {
                    defaultValue: 'Other new items',
                  })}
                  title={t('teams.notes.otherNewTitle', {
                    defaultValue: 'Blank note or Google Doc',
                  })}
                  size="sm"
                  variant="secondary"
                  shape="square"
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  {...tourAttr('teams.notes.new-menu')}
                  onClick={() => setMenuOpen((v) => !v)}
                />
                {menuOpen && (
                  <div
                    role="menu"
                    className={`absolute right-0 top-full z-20 mt-1 w-56 ${MENU_PANEL}`}
                  >
                    {newMenu.map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        role="menuitem"
                        {...tourFieldAttr(
                          'teams.notes.new-menu-item',
                          'teams-notes',
                          item.key
                        )}
                        className={MENU_ITEM}
                        onClick={() => {
                          setMenuOpen(false);
                          item.run();
                        }}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        <nav
          aria-label={t('plcDashboard.notes.heading', {
            defaultValue: 'Notes',
          })}
          className="flex-1 overflow-y-auto px-2 pb-6 pt-2"
        >
          {entries.length === 0 && records.length === 0 && emptyList}
          {entries.map((entry) => (
            <NoteListItem key={entry.key} entry={entry} />
          ))}
          {records.length > 0 && (
            <>
              <h4 className={`${EYEBROW} px-3 pb-1 pt-4`}>
                {t('teams.notes.earlierMeetings', {
                  defaultValue: 'Earlier meetings',
                })}
              </h4>
              {records.map((entry) => (
                <NoteListItem key={entry.key} entry={entry} />
              ))}
            </>
          )}
        </nav>
      </aside>
      <article
        className="flex min-h-0 flex-col overflow-y-auto bg-white"
        data-scroll-root
      >
        {children}
      </article>
    </div>
  );
};

export interface ArticleSection {
  key: string;
  heading: string | null;
  content: React.ReactNode;
  extras: React.ReactNode[];
}

export interface MeetingNoteArticleProps {
  title: React.ReactNode;
  actions: React.ReactNode;
  meta: string | null;
  sections: ArticleSection[];
  footer?: React.ReactNode;
}

/** The open note: title row, meeting line, then each template section with its blocks. */
export const MeetingNoteArticle: React.FC<MeetingNoteArticleProps> = ({
  title,
  actions,
  meta,
  sections,
  footer,
}) => (
  <div className="mx-auto w-full max-w-3xl px-8 pb-16 pt-6">
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1">{title}</div>
      {actions}
    </div>
    {meta && <p className="mt-1 text-xs text-slate-500">{meta}</p>}
    {sections.map((s) => (
      <section key={s.key} aria-label={s.heading ?? undefined}>
        {s.heading !== null && (
          <h3 className="mb-2 mt-7 text-base font-bold text-slate-800">
            {s.heading}
          </h3>
        )}
        {s.content}
        {s.extras.length > 0 && (
          <div className={`space-y-3 ${s.content ? 'mt-3' : ''}`}>
            {s.extras}
          </div>
        )}
      </section>
    ))}
    {footer}
  </div>
);
