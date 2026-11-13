// Teacher list of District library items that target them (docs/plans/QUIZ_MCA_PRACTICE.md M27-M28).
import React, { useMemo, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Folder,
  Library,
  ListChecks,
  Loader2,
  Plus,
  Search,
  X,
} from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import { tourAttr, tourFieldAttr } from '@/config/tourAnchors';
import {
  childFolders,
  folderChain,
  folderPathLabel,
  foldersWithItems,
  itemFolderId,
  shortTitle,
  startingFolder,
  type FolderMap,
} from '@/utils/districtLibraryFolders';
import type { DistrictLibraryItem } from '@/types/districtLibrary';

/** Each distinct source credited in an item's question notes, with how many questions it covers. */
function itemSources(
  item: Pick<DistrictLibraryItem, 'questionNotes'>
): { attribution: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const note of Object.values(item.questionNotes ?? {})) {
    const text = note.attribution?.trim();
    if (text) counts.set(text, (counts.get(text) ?? 0) + 1);
  }
  return [...counts]
    .map(([attribution, count]) => ({ attribution, count }))
    .sort(
      (a, b) => b.count - a.count || a.attribution.localeCompare(b.attribution)
    );
}

export interface DistrictLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: DistrictLibraryItem[];
  /** Quiz items already in the library, by item id. */
  addedQuizItemIds: ReadonlySet<string>;
  /** Bank items already in the bank picker, by item id. */
  addedBankIds: ReadonlySet<string>;
  /** `quiet` skips the per-item toast (Add all). */
  onAdd: (item: DistrictLibraryItem, quiet?: boolean) => Promise<void>;
  onRemoveBank: (item: DistrictLibraryItem) => Promise<void>;
  /** District folders; null keeps the flat list. */
  folders?: FolderMap | null;
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

const treeRow = (selected: boolean) =>
  `flex w-full items-center gap-1.5 rounded-lg py-1.5 pr-2 text-left text-sm ${
    selected
      ? 'bg-brand-blue-lighter font-semibold text-brand-blue-dark'
      : 'text-slate-700 hover:bg-slate-100'
  }`;

export const DistrictLibraryModal: React.FC<DistrictLibraryModalProps> = ({
  isOpen,
  onClose,
  items,
  addedQuizItemIds,
  addedBankIds,
  onAdd,
  onRemoveBank,
  folders = null,
}) => {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sourcesOpen, setSourcesOpen] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [level, setLevel] = useState<string | null | undefined>(undefined);

  const run = async (id: string, action: () => Promise<void>) => {
    setBusyId(id);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusyId(null);
    }
  };

  const isAdded = (item: DistrictLibraryItem) =>
    item.kind === 'quiz'
      ? addedQuizItemIds.has(item.id)
      : addedBankIds.has(item.id);

  const row = (item: DistrictLibraryItem, mode: 'flat' | 'short' | 'path') => {
    const added = isAdded(item);
    const busy = busyId === item.id;
    const KindIcon = item.kind === 'quiz' ? ListChecks : Library;
    const sources = itemSources(item);
    const home = folders ? itemFolderId(folders, item) : null;
    return (
      <li key={item.id} className="flex items-start gap-3 py-3">
        <KindIcon
          className="w-5 h-5 mt-0.5 shrink-0 text-brand-blue-primary"
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <div
            className="text-sm font-semibold text-slate-900"
            title={item.title}
          >
            {mode === 'short' ? shortTitle(item.title) : item.title}
          </div>
          <div className="text-xs text-slate-500">
            {mode === 'path' && folders && home
              ? `${folderPathLabel(folders, home)} · `
              : ''}
            {item.kind === 'quiz' ? 'Quiz' : 'Question bank'} ·{' '}
            {item.questionCount}{' '}
            {item.questionCount === 1 ? 'question' : 'questions'}
            {item.sourceName ? ` · ${item.sourceName}` : ''}
          </div>
          {item.description && (
            <p className="mt-1 text-xs text-slate-600">{item.description}</p>
          )}
          {sources.length > 0 && (
            <>
              <button
                type="button"
                onClick={() =>
                  setSourcesOpen((prev) => (prev === item.id ? null : item.id))
                }
                aria-expanded={sourcesOpen === item.id}
                {...tourFieldAttr(
                  'quiz.district-library.sources',
                  'quiz',
                  item.id
                )}
                className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-brand-blue-primary hover:underline"
              >
                Sources
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform ${
                    sourcesOpen === item.id ? 'rotate-180' : ''
                  }`}
                  aria-hidden
                />
              </button>
              {sourcesOpen === item.id && (
                <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
                  {sources.map((s) => (
                    <li key={s.attribution}>
                      {s.attribution}
                      {s.count > 1 ? ` (${s.count} questions)` : ''}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
        {added ? (
          <div className="flex items-center gap-2 shrink-0">
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
              <Check className="w-3.5 h-3.5" aria-hidden />
              {item.kind === 'quiz' ? 'In your library' : 'In your banks'}
            </span>
            {item.kind === 'bank' && (
              <button
                type="button"
                disabled={busy}
                onClick={() => run(item.id, () => onRemoveBank(item))}
                {...tourFieldAttr(
                  'quiz.district-library.remove',
                  'quiz',
                  item.id
                )}
                title="Remove from your banks"
                aria-label={`Remove ${item.title} from your banks`}
                className="touch-target-expand relative rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50"
              >
                <X className="w-4 h-4" aria-hidden />
              </button>
            )}
          </div>
        ) : (
          <button
            type="button"
            disabled={busy || busyId !== null}
            onClick={() => run(item.id, () => onAdd(item))}
            {...tourFieldAttr('quiz.district-library.add', 'quiz', item.id)}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-brand-blue-primary px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-blue-dark disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
            ) : (
              <Plus className="w-3.5 h-3.5" aria-hidden />
            )}
            Add
          </button>
        )}
      </li>
    );
  };

  const visible = useMemo(
    () => (folders ? foldersWithItems(folders, items) : new Set<string>()),
    [folders, items]
  );
  const start = folders ? startingFolder(folders, items) : null;

  const intro = (
    <p className="text-sm text-slate-600 mb-4">
      Added items stay read-only and get the district&apos;s corrections.
    </p>
  );
  const errorLine = error && (
    <p role="alert" className="mb-3 text-sm text-red-600">
      {error}
    </p>
  );

  if (!folders) {
    return (
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="District library"
        maxWidth="max-w-2xl"
        contentClassName="px-6 pb-6 overflow-y-auto"
      >
        {intro}
        {errorLine}
        <ul className="divide-y divide-slate-200 border-y border-slate-200">
          {items.map((item) => row(item, 'flat'))}
        </ul>
      </Modal>
    );
  }

  const live = level === undefined ? start : level;
  const at = live && visible.has(live) ? live : start;
  const pinned = start !== null;
  const kidsOf = (id: string | null) =>
    childFolders(folders, id).filter((f) => visible.has(f.id));
  const under = (id: string) =>
    items.filter((i) =>
      folderChain(folders, i.folderId ?? null).some((f) => f.id === id)
    );
  const noun = (list: DistrictLibraryItem[]) =>
    list.every((i) => i.kind === 'bank') ? 'bank' : 'item';
  const folderMeta = (id: string) => {
    const inside = under(id);
    const added = inside.filter(isAdded).length;
    const kids = kidsOf(id).length;
    return [
      kids > 0 ? plural(kids, 'folder') : '',
      plural(inside.length, noun(inside)),
      added > 0 ? `${added} added` : '',
    ]
      .filter(Boolean)
      .join(' · ');
  };
  const kids = kidsOf(at);
  const direct = items.filter((i) => itemFolderId(folders, i) === at);
  const remaining = direct.filter((i) => !isAdded(i));
  const query = search.trim().toLowerCase();

  const addAll = () =>
    run('add-all', async () => {
      for (const item of remaining) await onAdd(item, true);
    });

  const searchBox = (
    <div className="relative">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
        aria-hidden
      />
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search the district library"
        aria-label="Search the district library"
        {...tourAttr('quiz.district-library.search')}
        className="w-full rounded-xl border border-slate-200 bg-white py-1.5 pl-9 pr-3 text-sm font-medium text-slate-700 shadow-xs placeholder:text-slate-400"
      />
    </div>
  );

  let body: React.ReactNode;
  if (query) {
    const hits = items.filter((i) => i.title.toLowerCase().includes(query));
    body =
      hits.length > 0 ? (
        <>
          <p className="mt-3 text-xs font-semibold text-slate-500">
            {plural(hits.length, 'result')} in all folders
          </p>
          <ul className="mt-1 divide-y divide-slate-200 border-y border-slate-200">
            {hits.map((item) => row(item, 'path'))}
          </ul>
        </>
      ) : (
        <div className="py-10 text-center">
          <p className="text-sm font-semibold text-slate-700">
            No matches for &ldquo;{search.trim()}&rdquo;
          </p>
          <p className="text-sm text-slate-500">Try a shorter word.</p>
        </div>
      );
  } else {
    const trail = folderChain(folders, at);
    const parent = trail.length > 1 ? trail[trail.length - 2] : null;
    const header = (
      <div className="flex items-center gap-2 pb-2">
        <div className="min-w-0 flex-1">
          {pinned ? (
            parent && (
              <div className="text-xs text-slate-500">
                {folderPathLabel(folders, parent.id)}
              </div>
            )
          ) : (
            <nav
              aria-label="Folder path"
              className="hidden flex-wrap items-center gap-1 text-sm md:flex"
            >
              <button
                type="button"
                onClick={() => setLevel(null)}
                {...tourFieldAttr(
                  'quiz.district-library.crumb',
                  'quiz',
                  'root'
                )}
                className={
                  at === null
                    ? 'font-bold text-slate-900'
                    : 'text-slate-500 hover:text-slate-800'
                }
              >
                All folders
              </button>
              {trail.map((f, i) => (
                <React.Fragment key={f.id}>
                  <ChevronRight
                    className="h-3.5 w-3.5 text-slate-400"
                    aria-hidden
                  />
                  <button
                    type="button"
                    onClick={() => setLevel(f.id)}
                    {...tourFieldAttr(
                      'quiz.district-library.crumb',
                      'quiz',
                      f.id
                    )}
                    className={
                      i === trail.length - 1
                        ? 'font-bold text-slate-900'
                        : 'text-slate-500 hover:text-slate-800'
                    }
                  >
                    {f.name}
                  </button>
                </React.Fragment>
              ))}
            </nav>
          )}
          {at && (
            <div className="flex flex-wrap items-baseline gap-x-2">
              <h4 className="text-base font-bold text-slate-900">
                {folders[at].name}
              </h4>
              <span className="text-xs text-slate-500">{folderMeta(at)}</span>
            </div>
          )}
        </div>
        {at && direct.length > 0 && (
          <button
            type="button"
            disabled={remaining.length === 0 || busyId !== null}
            onClick={() => void addAll()}
            {...tourFieldAttr('quiz.district-library.add-all', 'quiz', at)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            {busyId === 'add-all' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : remaining.length === 0 ? (
              <Check className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <Plus className="h-3.5 w-3.5" aria-hidden />
            )}
            {remaining.length === 0
              ? 'All added'
              : `Add all ${remaining.length}`}
          </button>
        )}
      </div>
    );
    const list =
      kids.length === 0 && direct.length === 0 ? (
        <div className="border-t border-slate-200 py-10 text-center">
          <p className="text-sm font-semibold text-slate-700">
            Nothing here yet
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-200 border-y border-slate-200">
          {kids.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                onClick={() => setLevel(f.id)}
                {...tourFieldAttr(
                  'quiz.district-library.open-folder',
                  'quiz',
                  f.id
                )}
                className="flex w-full items-center gap-3 py-2.5 text-left hover:bg-slate-50"
              >
                <Folder
                  className="h-5 w-5 shrink-0 text-slate-400"
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-slate-900">
                    {f.name}
                  </span>
                  <span className="block text-xs text-slate-500">
                    {folderMeta(f.id)}
                  </span>
                </span>
                <ChevronRight
                  className="h-4 w-4 shrink-0 text-slate-400"
                  aria-hidden
                />
              </button>
            </li>
          ))}
          {direct.map((item) => row(item, at ? 'short' : 'flat'))}
        </ul>
      );
    const treeNodes = (
      parentId: string | null,
      depth: number
    ): React.ReactNode =>
      kidsOf(parentId).map((f) => (
        <React.Fragment key={f.id}>
          <button
            type="button"
            onClick={() => setLevel(f.id)}
            {...tourFieldAttr('quiz.district-library.folder', 'quiz', f.id)}
            className={treeRow(f.id === at)}
            style={{ paddingLeft: 8 + depth * 14 }}
          >
            <Folder className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
            <span className="min-w-0 flex-1 truncate">{f.name}</span>
            <span className="text-xxs tabular-nums text-slate-400">
              {under(f.id).length}
            </span>
          </button>
          {treeNodes(f.id, depth + 1)}
        </React.Fragment>
      ));
    body = (
      <>
        {!pinned && at !== null && (
          <button
            type="button"
            onClick={() => setLevel(parent?.id ?? null)}
            {...tourAttr('quiz.district-library.back')}
            className="mt-3 inline-flex items-center gap-0.5 text-sm font-semibold text-brand-blue-primary md:hidden"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
            {parent?.name ?? 'All folders'}
          </button>
        )}
        <div className="mt-4 flex gap-5">
          {!pinned && (
            <nav className="hidden w-44 shrink-0 md:block" aria-label="Folders">
              <button
                type="button"
                onClick={() => setLevel(null)}
                {...tourFieldAttr(
                  'quiz.district-library.folder',
                  'quiz',
                  'root'
                )}
                className={treeRow(at === null)}
                style={{ paddingLeft: 8 }}
              >
                <Library
                  className="h-4 w-4 shrink-0 text-slate-400"
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate">All folders</span>
              </button>
              {treeNodes(null, 1)}
            </nav>
          )}
          <div className="min-w-0 flex-1">
            {header}
            {list}
          </div>
        </div>
      </>
    );
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="District library"
      maxWidth="max-w-3xl"
      contentClassName="px-6 pb-6 overflow-y-auto"
    >
      <p className="mb-3 text-sm text-slate-600">
        Added items stay read-only and get the district&apos;s corrections.
      </p>
      {errorLine}
      {searchBox}
      {body}
    </Modal>
  );
};
