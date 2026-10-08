// Path bar, search scope and folder rows above the library list (docs/plans/LIBRARY_FOLDERS.md D3, D4, D7).
import React from 'react';
import { ChevronRight, Folder } from 'lucide-react';
import type { LibraryViewMode } from './types';
import { folderColorSwatch } from './folderColors';
import {
  breadcrumbEntries,
  folderPath,
  folderPathLabel,
  type LibraryLocation,
} from './folderView';
import type {
  LibraryFolderRow,
  LibraryFolderViewModel,
} from './LibraryFolderViewContext';

export const LIBRARY_ROOT_LABEL = 'Library';

const textStyle: React.CSSProperties = { fontSize: 'min(13px, 4cqmin)' };
const iconStyle: React.CSSProperties = {
  width: 'min(14px, 4cqmin)',
  height: 'min(14px, 4cqmin)',
  flexShrink: 0,
};

const Breadcrumb: React.FC<{ model: LibraryFolderViewModel }> = ({ model }) => {
  const { location, navigate, index } = model;
  if (location.kind !== 'folder') return null;
  const entries = breadcrumbEntries(folderPath(location.folderId, index));
  const go = (next: LibraryLocation) => () => navigate(next);
  return (
    <nav aria-label="Folder path" className="min-w-0">
      <ol
        className="flex flex-wrap items-center text-slate-500"
        style={{ ...textStyle, gap: 'min(4px, 1cqmin)' }}
      >
        {entries.map((entry, i) => {
          const last = i === entries.length - 1;
          const key =
            entry.kind === 'folder' ? entry.folder.id : `${entry.kind}-${i}`;
          let content: React.ReactNode;
          if (entry.kind === 'gap') {
            content = (
              <span
                title={folderPathLabel(entry.hidden)}
                aria-label="More folders"
              >
                …
              </span>
            );
          } else {
            const label =
              entry.kind === 'root' ? LIBRARY_ROOT_LABEL : entry.folder.name;
            const target: LibraryLocation = {
              kind: 'folder',
              folderId: entry.kind === 'root' ? null : entry.folder.id,
            };
            content = last ? (
              <span
                className="font-semibold text-brand-blue-dark break-words"
                aria-current="location"
              >
                {label}
              </span>
            ) : (
              <button
                type="button"
                onClick={go(target)}
                className="rounded px-0.5 break-words hover:text-brand-blue-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40"
              >
                {label}
              </button>
            );
          }
          return (
            <li
              key={key}
              className="flex min-w-0 items-center"
              style={{ gap: 'min(4px, 1cqmin)' }}
            >
              {i > 0 && (
                <ChevronRight
                  aria-hidden
                  className="text-slate-400"
                  style={iconStyle}
                />
              )}
              {content}
            </li>
          );
        })}
      </ol>
    </nav>
  );
};

export const FolderRowButton: React.FC<{
  row: LibraryFolderRow;
  viewMode: LibraryViewMode;
  onOpen: () => void;
}> = ({ row, viewMode, onOpen }) => {
  const isList = viewMode === 'list';
  const swatch = folderColorSwatch(row.folder.color);
  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid="library-folder-row"
      className={`flex w-full items-center text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-blue-primary/40 ${
        isList
          ? 'bg-white hover:bg-amber-50'
          : `rounded-2xl border hover:brightness-95 ${swatch?.row ?? 'border-amber-200 bg-amber-50'}`
      }`}
      style={{
        gap: 'min(10px, 2.5cqmin)',
        padding: isList
          ? 'min(8px, 2cqmin) min(10px, 2.5cqmin)'
          : 'min(12px, 3cqmin)',
      }}
    >
      <span
        className={`flex shrink-0 items-center justify-center rounded-lg ${
          swatch
            ? `${swatch.row.split(' ')[0]} ${swatch.icon}`
            : 'bg-amber-100 text-amber-700'
        }`}
        style={
          isList
            ? { width: 'min(48px, 13cqmin)', height: 'min(48px, 13cqmin)' }
            : { width: 'min(36px, 10cqmin)', height: 'min(36px, 10cqmin)' }
        }
        aria-hidden
      >
        <Folder
          style={{ width: 'min(22px, 6cqmin)', height: 'min(22px, 6cqmin)' }}
        />
      </span>
      <span
        className="min-w-0 flex-1 break-words font-bold text-slate-800"
        style={{
          fontSize: isList ? 'min(14px, 4.5cqmin)' : 'min(15px, 4.8cqmin)',
        }}
      >
        {row.folder.name}
      </span>
      <span
        className="shrink-0 font-medium text-slate-500"
        style={{ fontSize: 'min(12px, 3.8cqmin)' }}
      >
        {row.label}
      </span>
    </button>
  );
};

export const FolderViewHeader: React.FC<{
  model: LibraryFolderViewModel;
  viewMode: LibraryViewMode;
  /** False when `LibraryGrid` draws the folder rows inside its own list. */
  includeRows?: boolean;
}> = ({ model, viewMode, includeRows = true }) => {
  const { location, searchActive, searchScope, index } = model;
  const folderRows = includeRows ? model.folderRows : [];
  const openFolder =
    location.kind === 'folder' && location.folderId != null
      ? index.byId.get(location.folderId)
      : undefined;
  // At the top level, All items and Recent, the side panel already says where you are.
  const showPathBar = openFolder != null;
  const showScope = searchActive && openFolder != null;
  if (!showPathBar && folderRows.length === 0) return null;
  const isList = viewMode === 'list';
  return (
    <div
      className="flex flex-col"
      style={{
        gap: 'min(8px, 2cqmin)',
        marginBottom:
          folderRows.length > 0 ? 'min(8px, 2cqmin)' : 'min(10px, 2.5cqmin)',
      }}
    >
      {showPathBar && (
        <div
          className="flex flex-wrap items-center justify-between"
          style={{ gap: 'min(8px, 2cqmin)' }}
        >
          <Breadcrumb model={model} />
          {showScope && (
            <button
              type="button"
              onClick={() =>
                model.setSearchScope(
                  searchScope === 'folder' ? 'all' : 'folder'
                )
              }
              className="rounded-lg font-semibold text-brand-blue-primary hover:bg-brand-blue-lighter/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40"
              style={{
                ...textStyle,
                paddingInline: 'min(8px, 2cqmin)',
                paddingBlock: 'min(2px, 0.6cqmin)',
              }}
            >
              {searchScope === 'folder'
                ? `Search all of ${LIBRARY_ROOT_LABEL}`
                : `Search only ${openFolder.name}`}
            </button>
          )}
        </div>
      )}
      {folderRows.length > 0 && (
        <div
          className={
            isList
              ? 'flex flex-col divide-y divide-slate-200 border-y border-slate-200'
              : 'grid gap-3'
          }
          style={
            isList
              ? undefined
              : {
                  gridTemplateColumns:
                    'repeat(auto-fill, minmax(min(240px, 80cqmin), 1fr))',
                }
          }
          data-testid="library-folder-rows"
        >
          {folderRows.map((row) => (
            <FolderRowButton
              key={row.folder.id}
              row={row}
              viewMode={viewMode}
              onOpen={() =>
                model.navigate({ kind: 'folder', folderId: row.folder.id })
              }
            />
          ))}
        </div>
      )}
    </div>
  );
};
