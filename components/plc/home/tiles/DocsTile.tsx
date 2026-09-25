// Docs & notes tile: the newest shared docs and notes.

import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, NotebookPen } from 'lucide-react';
import {
  usePlcDocsData,
  usePlcMembers,
  usePlcNotesData,
} from '@/context/usePlcContext';
import { formatActivityRelativeTime } from '@/components/plc/activity/activityDescriptions';
import { TileEmpty, TileFrame } from './TileFrame';
import { selectRecentDocs, type RecentDocItem } from './docsSelectors';
import type { PlcHomeTileProps } from './tileTypes';

const COMPACT_LIMIT = 3;
const HERO_LIMIT = 8;

const DocRow: React.FC<{
  item: RecentDocItem;
  hero: boolean;
  onOpen: () => void;
}> = ({ item, hero, onOpen }) => {
  const { t, i18n } = useTranslation();
  const Icon = item.kind === 'doc' ? FileText : NotebookPen;
  const meta = hero
    ? [item.author, formatActivityRelativeTime(item.at, t, i18n.language)]
        .filter(Boolean)
        .join(' · ')
    : '';
  const body = (
    <>
      <Icon className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-slate-700">
          {item.title ||
            t('plcDashboard.home.docs.untitled', { defaultValue: 'Untitled' })}
        </span>
        {meta && (
          <span className="block truncate text-xs text-slate-400">{meta}</span>
        )}
      </span>
    </>
  );
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40"
      >
        {body}
      </button>
    </li>
  );
};

export const DocsTile: React.FC<PlcHomeTileProps> = ({
  ctx,
  hero,
  controls,
}) => {
  const { t } = useTranslation();
  const { data: docs, loading: docsLoading } = usePlcDocsData();
  const { data: notes, loading: notesLoading } = usePlcNotesData();
  const members = usePlcMembers();
  const items = useMemo(
    () =>
      selectRecentDocs(docs, notes, members, hero ? HERO_LIMIT : COMPACT_LIMIT),
    [docs, notes, members, hero]
  );
  const openNotes = () => ctx.onNavigate('docs');

  return (
    <TileFrame
      icon={FileText}
      title={t('plcDashboard.home.docs.title', {
        defaultValue: 'Docs and notes',
      })}
      hero={hero}
      headerExtra={controls}
      link={{
        label: t('plcDashboard.home.docs.open', {
          defaultValue: 'Open Notes & Docs',
        }),
        onClick: openNotes,
      }}
    >
      {items.length === 0 ? (
        !(docsLoading || notesLoading) && (
          <TileEmpty>
            {t('plcDashboard.home.docs.empty', {
              defaultValue: 'No shared docs or notes yet.',
            })}
          </TileEmpty>
        )
      ) : (
        <ul className={hero ? 'grid gap-x-4 md:grid-cols-2' : ''}>
          {items.map((item) => (
            <DocRow
              key={item.id}
              item={item}
              hero={hero}
              onOpen={
                item.kind === 'doc'
                  ? () => ctx.onOpenDoc(item.sourceId)
                  : openNotes
              }
            />
          ))}
        </ul>
      )}
    </TileFrame>
  );
};
