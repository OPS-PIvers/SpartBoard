import type { FC } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Clock, Folder, LayoutGrid } from 'lucide-react';
import {
  formatExpiresAt,
  teacherCardAccent,
  teacherInitials,
} from './subsView';
import type { DirectoryEntry } from './subDirectory';

interface SubDirectoryCardProps {
  entry: DirectoryEntry;
  buildingName: string;
  onPickBoard: (shareId: string) => void;
  onPickCollectionBoard: (shareId: string, boardId: string) => void;
}

const CARD_CLASS =
  'text-left rounded-2xl bg-white border border-slate-200 shadow-sm p-5 flex flex-col';

export const SubDirectoryCard: FC<SubDirectoryCardProps> = ({
  entry,
  buildingName,
  onPickBoard,
  onPickCollectionBoard,
}) => {
  const { t } = useTranslation();

  const header = (
    <div className="flex items-start gap-3">
      <div
        className={`w-12 h-12 shrink-0 rounded-xl ${teacherCardAccent(
          entry.shareId
        )} flex items-center justify-center text-white font-bold text-base`}
      >
        {teacherInitials(entry.teacherName)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-base font-bold text-slate-900 truncate">
          {entry.teacherName}
        </div>
        <div className="text-[11px] text-slate-500 truncate">
          {buildingName}
        </div>
      </div>
    </div>
  );

  const expires = entry.expiresAt ? (
    <div className="inline-flex items-center gap-1 text-amber-700">
      <Clock className="w-3.5 h-3.5" />
      {formatExpiresAt(entry.expiresAt)}
    </div>
  ) : null;

  if (entry.kind === 'collection') {
    return (
      <div className={CARD_CLASS}>
        {header}
        <div className="mt-4 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500 font-medium">
            <Folder
              className="w-3 h-3"
              style={entry.color ? { color: entry.color } : undefined}
            />
            Collection
          </div>
          <div className="text-sm font-medium text-slate-900 truncate">
            {entry.collectionName}
          </div>
        </div>
        <div className="mt-3 flex flex-col gap-1.5">
          {entry.boards.map((board) => (
            <button
              key={board.id}
              type="button"
              onClick={() => onPickCollectionBoard(entry.shareId, board.id)}
              title={t('subCollections.openBoard', {
                defaultValue: 'Open this board',
              })}
              className="group flex items-center gap-2 rounded-md bg-white hover:bg-brand-blue-primary/5 border border-slate-200 hover:border-brand-blue-primary/40 px-3 py-1.5 text-left text-xs font-medium text-slate-800 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40"
            >
              <span className="flex-1 truncate">
                {board.name ??
                  t('subCollections.boardPlaceholder', {
                    id: board.id.slice(-4),
                    defaultValue: 'Board …{{id}}',
                  })}
              </span>
              <ArrowRight className="w-3.5 h-3.5 shrink-0 text-slate-400 group-hover:text-brand-blue-primary" />
            </button>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between text-[11px]">
          <div className="inline-flex items-center gap-1 text-slate-500">
            <LayoutGrid className="w-3.5 h-3.5" />
            {t('subCollections.boardCount', {
              count: entry.boards.length,
              defaultValue: '{{count}} board(s)',
            })}
          </div>
          {expires}
        </div>
      </div>
    );
  }

  const open = () =>
    entry.kind === 'board'
      ? onPickBoard(entry.shareId)
      : onPickCollectionBoard(entry.shareId, entry.boardId);
  const widgetCount = entry.kind === 'board' ? entry.widgetCount : undefined;

  return (
    <button
      type="button"
      onClick={open}
      className={`group ${CARD_CLASS} hover:border-brand-blue-primary/40 hover:shadow-md transition-all focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40 cursor-pointer`}
    >
      {header}
      <div className="mt-4 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
        <div className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">
          Board
        </div>
        <div className="text-sm font-medium text-slate-900 truncate">
          {entry.boardName}
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between text-[11px]">
        <div className="inline-flex items-center gap-1 text-slate-500">
          {widgetCount !== undefined && (
            <>
              <LayoutGrid className="w-3.5 h-3.5" />
              {widgetCount} {widgetCount === 1 ? 'widget' : 'widgets'}
            </>
          )}
        </div>
        {expires}
      </div>
      <div className="mt-5 inline-flex items-center gap-1.5 self-start rounded-md bg-brand-blue-primary group-hover:bg-brand-blue-dark px-3 py-1.5 text-xs font-bold text-white transition-colors">
        Open board
        <ArrowRight className="w-3.5 h-3.5" />
      </div>
    </button>
  );
};
