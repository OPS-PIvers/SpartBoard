// Design mockup for District library folders: admin panel, teacher add dialog, Quiz banks view.
import React, { useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  EyeOff,
  Folder,
  FolderInput,
  FolderMinus,
  FolderPlus,
  Library,
  Loader2,
  MoreHorizontal,
  NotebookPen,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import {
  FolderPickerPopover,
  FolderSidebar,
  LibraryGrid,
  LibraryItemCard,
  LibraryShell,
  LibraryToolbar,
} from '@/components/common/library';
import { useFolderLibraryView } from '@/components/common/library/useFolderLibraryView';
import { DistrictLibraryTargetingEditor } from '@/components/admin/DistrictLibrary/DistrictLibraryTargetingEditor';
import { BUILDINGS } from '@/config/buildings';
import type { LibraryFolder } from '@/types';
import type { DistrictLibraryItem } from '@/types/districtLibrary';

const params = new URLSearchParams(window.location.search);
const part = params.get('part') ?? 'admin';
const state = params.get('state') ?? '';
const W = Number(params.get('w')) || 0;
const H = Number(params.get('h')) || 0;
const noop = () => undefined;
const NOW = new Date('2026-11-12T12:00:00').getTime();

// ─── Fixtures ───────────────────────────────────────────────────────────────

interface Fx {
  id: string;
  title: string;
  q: number;
  folder: string;
  draft?: boolean;
  own?: string;
}

const series = (
  prefix: string,
  folder: string,
  rows: [string, number][],
  extra: (i: number) => Partial<Fx> = () => ({})
): Fx[] =>
  rows.map(([t, q], i) => ({
    id: `${folder}-${i}`,
    title: `${prefix}: ${t}`,
    q,
    folder,
    ...extra(i),
  }));

const G8 = series(
  'MCA IV Science Grade 8',
  'sci-8',
  [
    ['Arizona Meteor (2025)', 5],
    ['Barn Bluff Formation (2025)', 4],
    ['Carbon Capture (2025)', 4],
    ['Dung Beetle Starlight Orientation (2021)', 8],
    ['Effects of Climate Change on Lobsters (2025)', 8],
    ['Light Bulbs (2025)', 4],
    ['Plant Fluorescence (2023)', 6],
    ['Roller Coaster Energy (2025)', 7],
    ['Static Electricity (2025)', 4],
  ],
  (i) => (i === 8 ? { own: 'Orono Middle School · Grade 7' } : {})
);
const G5 = series(
  'MCA IV Science Grade 5',
  'sci-5',
  [
    ['Bird Beaks (2024)', 6],
    ['Energy Transfer (2024)', 5],
    ['Plant Growth (2023)', 4],
  ],
  (i) => (i === 2 ? { draft: true } : {})
);
const HS = series('MCA IV Science HS', 'sci-hs', [
  ['Energy in Ecosystems (2025)', 6],
  ['Natural Selection (2024)', 7],
  ['Wave Properties (2025)', 5],
]);
const M8 = series('MCA III Math Grade 8', 'math-8', [
  ['Linear Functions (2025)', 6],
  ['Pythagorean Theorem (2025)', 5],
  ['Scatter Plots (2024)', 4],
]);
const ITEMS: Fx[] = [...G8, ...G5, ...HS, ...M8];

const TREE: { id: string; name: string; parent: string | null }[] = [
  { id: 'sci', name: 'MCA Science', parent: null },
  { id: 'sci-5', name: 'Grade 5', parent: 'sci' },
  { id: 'sci-8', name: 'Grade 8', parent: 'sci' },
  { id: 'sci-hs', name: 'High school', parent: 'sci' },
  { id: 'math', name: 'MCA Math', parent: null },
  { id: 'math-6', name: 'Grade 6', parent: 'math' },
  { id: 'math-8', name: 'Grade 8', parent: 'math' },
  { id: 'read', name: 'MCA Reading', parent: null },
];
const nodeOf = (id: string | null) => TREE.find((n) => n.id === id);
const childrenOf = (id: string | null) => TREE.filter((n) => n.parent === id);
const pathOf = (id: string): string[] => {
  const out: string[] = [];
  let n = nodeOf(id);
  while (n) {
    out.unshift(n.name);
    n = nodeOf(n.parent);
  }
  return out;
};
const inSubtree = (folder: string, root: string): boolean => {
  let n = nodeOf(folder);
  while (n) {
    if (n.id === root) return true;
    n = nodeOf(n.parent);
  }
  return false;
};
const itemsUnder = (root: string, list: Fx[] = ITEMS) =>
  list.filter((i) => inSubtree(i.folder, root));

/** Inside a folder, drop the series prefix every title repeats ("MCA IV Science Grade 8: "). */
const shortTitle = (title: string): string => title.replace(/^[^:]+:\s*/, '');

const folderOf = (
  id: string,
  name: string,
  parentId: string | null,
  order: number,
  color?: LibraryFolder['color']
): LibraryFolder => ({ id, name, parentId, order, createdAt: NOW, color });

const ADMIN_FOLDERS: LibraryFolder[] = TREE.map((f, i) =>
  folderOf(f.id, f.name, f.parent, i)
);

const asItem = (fx: Fx): DistrictLibraryItem => ({
  id: fx.id,
  kind: 'bank',
  title: fx.title,
  questionCount: fx.q,
  status: fx.draft ? 'draft' : 'published',
  everyone: false,
  targetBuildings: ['middle'],
  targetGrades: ['8'],
  targetEmails: [],
  gradeBuildings: [],
  syncGroupId: 'g',
  contentVersion: 1,
  createdAt: NOW,
  updatedAt: NOW,
  updatedBy: 'x',
});

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

// ─── Shared bits ────────────────────────────────────────────────────────────

const iconButton =
  'touch-target-expand relative inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50';

const treeRowClass = (selected: boolean) =>
  `flex w-full items-center gap-1.5 rounded-lg py-1.5 pr-2 text-left text-sm ${
    selected
      ? 'bg-brand-blue-lighter font-semibold text-brand-blue-dark'
      : 'text-slate-700 hover:bg-slate-100'
  }`;

/** Folder rows above items, in the hairline list style the panels already use. */
const FolderRows: React.FC<{
  ids: string[];
  meta: (id: string) => string;
}> = ({ ids, meta }) => (
  <>
    {ids.map((id) => (
      <li key={id}>
        <button
          type="button"
          className="flex w-full items-center gap-3 py-2.5 text-left hover:bg-slate-50"
        >
          <Folder className="h-5 w-5 shrink-0 text-slate-400" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-slate-900">
              {nodeOf(id)?.name}
            </span>
            <span className="block text-xs text-slate-500">{meta(id)}</span>
          </span>
          <ChevronRight
            className="h-4 w-4 shrink-0 text-slate-400"
            aria-hidden
          />
        </button>
      </li>
    ))}
  </>
);

const Crumbs: React.FC<{ root: string; at: string | null }> = ({
  root,
  at,
}) => {
  const trail = at ? pathOf(at) : [];
  return (
    <nav
      aria-label="Folder path"
      className="flex flex-wrap items-center gap-1 text-sm"
    >
      <button
        type="button"
        className={
          trail.length === 0
            ? 'font-bold text-slate-900'
            : 'text-slate-500 hover:text-slate-800'
        }
      >
        {root}
      </button>
      {trail.map((name, i) => (
        <React.Fragment key={name + i}>
          <ChevronRight className="h-3.5 w-3.5 text-slate-400" aria-hidden />
          <span
            className={
              i === trail.length - 1
                ? 'font-bold text-slate-900'
                : 'text-slate-500'
            }
          >
            {name}
          </span>
        </React.Fragment>
      ))}
    </nav>
  );
};

// ─── Admin panel ────────────────────────────────────────────────────────────

const AdminTree: React.FC<{
  selected: string;
  counts: Record<string, number>;
  newFolderUnder?: string;
}> = ({ selected, counts, newFolderUnder }) => {
  const row = (n: (typeof TREE)[number], depth: number): React.ReactNode => {
    const kids = childrenOf(n.id);
    const open = kids.length > 0;
    return (
      <React.Fragment key={n.id}>
        <button
          type="button"
          className={treeRowClass(selected === n.id)}
          style={{ paddingLeft: 8 + depth * 14 }}
        >
          {kids.length > 0 ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          ) : (
            <span className="w-3.5 shrink-0" />
          )}
          <Folder className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
          <span className="min-w-0 flex-1 truncate">{n.name}</span>
          <span className="text-xxs tabular-nums text-slate-400">
            {counts[n.id] ?? 0}
          </span>
        </button>
        {open && kids.map((k) => row(k, depth + 1))}
        {newFolderUnder === n.id && (
          <div
            className="flex items-center gap-1.5 py-1 pr-2"
            style={{ paddingLeft: 8 + (depth + 1) * 14 }}
          >
            <span className="w-3.5 shrink-0" />
            <Folder className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
            <input
              defaultValue="Grade 7"
              aria-label="Folder name"
              className="min-w-0 flex-1 rounded-md border border-brand-blue-primary/40 bg-white px-1.5 py-0.5 text-sm text-slate-800 ring-2 ring-brand-blue-primary/30"
            />
          </div>
        )}
      </React.Fragment>
    );
  };
  return (
    <nav className="w-56 shrink-0" aria-label="District folders">
      <div className="mb-1 flex items-center justify-between px-2">
        <span className="text-xxs font-bold uppercase tracking-wider text-slate-500">
          Folders
        </span>
        <button
          type="button"
          aria-label="New folder"
          className="rounded-md p-1 text-slate-500 hover:bg-slate-100"
        >
          <FolderPlus className="h-4 w-4" />
        </button>
      </div>
      <button type="button" className={treeRowClass(selected === 'all')}>
        <span className="w-3.5" />
        <Library className="h-4 w-4 text-slate-400" aria-hidden />
        <span className="flex-1">All items</span>
        <span className="text-xxs tabular-nums text-slate-400">
          {ITEMS.length}
        </span>
      </button>
      {childrenOf(null).map((n) => row(n, 0))}
      <div className="my-2 border-t border-slate-200" />
      <button type="button" className={treeRowClass(selected === 'drafts')}>
        <span className="w-3.5" />
        <NotebookPen className="h-4 w-4 text-slate-400" aria-hidden />
        <span className="flex-1">Drafts</span>
        <span className="text-xxs tabular-nums text-slate-400">
          {ITEMS.filter((i) => i.draft).length}
        </span>
      </button>
    </nav>
  );
};

const AdminItemRow: React.FC<{
  item: Fx;
  showPath?: boolean;
  menuOpen?: boolean;
  children?: React.ReactNode;
}> = ({ item, showPath, menuOpen, children }) => (
  <li className="py-3">
    <div className="flex items-start gap-3">
      <Library className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span
            className="text-sm font-semibold text-slate-900"
            title={item.title}
          >
            {showPath ? item.title : shortTitle(item.title)}
          </span>
          {item.draft && (
            <span className="rounded bg-slate-200 px-1.5 py-0.5 text-xxs font-bold uppercase tracking-wider text-slate-700">
              Draft
            </span>
          )}
        </div>
        <div className="text-xs text-slate-500">
          {showPath ? `${pathOf(item.folder).join(' / ')} · ` : ''}
          Question bank · {item.q} questions ·{' '}
          {item.own ? (
            <span className="font-semibold text-slate-700">{item.own}</span>
          ) : (
            'Same as folder'
          )}
          {showPath ? '' : ' · updated Nov 12, 2026'}
        </div>
      </div>
      <div className="relative flex shrink-0 items-center gap-1">
        <button type="button" className={iconButton}>
          <Users className="h-3.5 w-3.5" aria-hidden />
          Who sees it
        </button>
        <button
          type="button"
          aria-label={`More for ${item.title}`}
          className={`${iconButton} ${menuOpen ? 'bg-slate-100' : ''}`}
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden />
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-8 z-10 w-48 rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
            {[
              { icon: EyeOff, label: 'Unpublish' },
              { icon: FolderInput, label: 'Move to folder' },
              { icon: RefreshCw, label: 'Replace' },
            ].map(({ icon: Icon, label }) => (
              <button
                key={label}
                type="button"
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100"
              >
                <Icon className="h-4 w-4 text-slate-400" aria-hidden />
                {label}
              </button>
            ))}
            <div className="my-1 border-t border-slate-200" />
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-red-700 hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4" aria-hidden />
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
    {children}
  </li>
);

const AdminPanel: React.FC = () => {
  const counts: Record<string, number> = {};
  for (const n of TREE) counts[n.id] = itemsUnder(n.id).length;
  const selected =
    {
      all: 'all',
      drafts: 'drafts',
      science: 'sci',
      empty: 'math-6',
      'new-folder': 'math',
    }[state] ?? 'sci-8';

  const header = (
    title: string,
    meta: string,
    folderActions: boolean,
    parent?: string
  ) => (
    <div className="flex flex-wrap items-center gap-2 pb-2">
      <div className="min-w-0 flex-1">
        {parent && <div className="text-xs text-slate-500">{parent}</div>}
        <div className="flex items-baseline gap-2">
          <h4 className="text-base font-bold text-slate-900">{title}</h4>
          <span className="text-xs text-slate-500">{meta}</span>
        </div>
      </div>
      {folderActions && (
        <>
          <button
            type="button"
            aria-expanded={state === 'folder-who'}
            className={`${iconButton} ${state === 'folder-who' ? 'bg-slate-100 text-slate-900' : ''}`}
          >
            <Users className="h-3.5 w-3.5" aria-hidden />
            Who sees this folder
          </button>
          <button type="button" aria-label="Folder menu" className={iconButton}>
            <MoreHorizontal className="h-4 w-4" aria-hidden />
          </button>
        </>
      )}
    </div>
  );

  let content: React.ReactNode;
  if (selected === 'all') {
    content = (
      <>
        {header('All items', plural(ITEMS.length, 'item'), false)}
        <ul className="divide-y divide-slate-200 border-y border-slate-200">
          {ITEMS.slice(6, 14).map((it) => (
            <AdminItemRow key={it.id} item={it} showPath />
          ))}
        </ul>
      </>
    );
  } else if (selected === 'drafts') {
    const drafts = ITEMS.filter((i) => i.draft);
    content = (
      <>
        {header('Drafts', 'Only admins see drafts', false)}
        <ul className="divide-y divide-slate-200 border-y border-slate-200">
          {drafts.map((it) => (
            <AdminItemRow key={it.id} item={it} showPath />
          ))}
        </ul>
      </>
    );
  } else if (selected === 'math-6') {
    content = (
      <>
        {header('Grade 6', 'Empty · Nobody yet', true, 'MCA Math')}
        <div className="border-t border-slate-200 py-10 text-center">
          <p className="text-sm font-semibold text-slate-700">
            This folder is empty
          </p>
          <p className="text-sm text-slate-500">
            Upload a package or move items here.
          </p>
        </div>
      </>
    );
  } else if (selected === 'sci' || selected === 'math') {
    const kids = childrenOf(selected).map((n) => n.id);
    content = (
      <>
        {header(
          nodeOf(selected)?.name ?? '',
          `${plural(kids.length, 'folder')} · ${plural(itemsUnder(selected).length, 'item')}`,
          true
        )}
        <ul className="divide-y divide-slate-200 border-y border-slate-200">
          <FolderRows
            ids={kids}
            meta={(id) => {
              const n = itemsUnder(id).length;
              if (n === 0) return 'Empty';
              return `${plural(n, 'item')} · ${id === 'sci-8' || id === 'math-8' ? 'Orono Middle School · Grade 8' : id === 'sci-hs' ? 'Orono High School' : 'Orono Intermediate · Grade 5'}`;
            }}
          />
        </ul>
      </>
    );
  } else {
    const items = ITEMS.filter((i) => i.folder === selected);
    content = (
      <>
        {header(
          'Grade 8',
          `${plural(items.length, 'item')} · Orono Middle School · Grade 8`,
          true,
          'MCA Science'
        )}
        {state === 'folder-who' && (
          <div className="mb-3">
            <p className="text-sm text-slate-700">
              Applies to every item in this folder, including new ones. Items
              you set on their own keep their own choice.
            </p>
            <DistrictLibraryTargetingEditor
              item={asItem(G8[0])}
              buildings={BUILDINGS}
              onCancel={noop}
              onSave={() => Promise.resolve()}
            />
          </div>
        )}
        <ul className="divide-y divide-slate-200 border-y border-slate-200">
          {items.map((item, i) => (
            <AdminItemRow
              key={item.id}
              item={item}
              menuOpen={state === 'menu' && i === 1}
            >
              {state === 'item-who' && i === 8 && (
                <div className="ml-8 mt-3">
                  <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5 text-sm">
                    <span className="rounded-md px-3 py-1 text-slate-600">
                      Same as folder
                    </span>
                    <span className="rounded-md bg-brand-blue-primary px-3 py-1 font-semibold text-white">
                      Choose for this item
                    </span>
                  </div>
                  <DistrictLibraryTargetingEditor
                    item={{
                      ...asItem(item),
                      targetBuildings: ['middle', 'high'],
                      targetGrades: ['7'],
                    }}
                    buildings={BUILDINGS}
                    onCancel={noop}
                    onSave={() => Promise.resolve()}
                  />
                </div>
              )}
            </AdminItemRow>
          ))}
        </ul>
      </>
    );
  }

  return (
    <div className="p-6" style={{ width: W || 1040 }}>
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <Library className="h-5 w-5 text-brand-blue-primary" aria-hidden />
        <h3 className="text-lg font-bold text-slate-900">District library</h3>
        <button
          type="button"
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-brand-blue-primary px-3 py-1.5 text-sm font-bold text-white hover:bg-brand-blue-dark"
        >
          <Upload className="h-4 w-4" aria-hidden />
          Upload package file
        </button>
      </div>
      <p className="mb-4 text-sm text-slate-600">
        Only staff in the district can open these items. New items start as
        drafts.
      </p>

      {state === 'upload' && (
        <section className="mb-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <h4 className="text-sm font-bold text-slate-900">
            MCA IV Science Grade 5
          </h4>
          <p className="text-xs text-slate-500">
            mca-science-g5.zip · made Nov 12, 2026
          </p>
          <ul className="mt-3 divide-y divide-slate-200 border-y border-slate-200">
            {G5.map((e) => (
              <li
                key={e.id}
                className="flex items-center justify-between gap-3 py-2 text-sm"
              >
                <span className="min-w-0 truncate text-slate-800">
                  {e.title}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-slate-500">
                  Bank · {e.q} q ·{' '}
                  <span className="font-semibold text-emerald-700">New</span>
                </span>
              </li>
            ))}
          </ul>
          <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
            <span className="font-semibold">Put new items in</span>
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-sm text-slate-800">
              <Folder className="h-4 w-4 text-slate-400" aria-hidden />
              MCA Science / Grade 5
              <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
            </span>
          </label>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-blue-primary px-3 py-1.5 text-sm font-bold text-white hover:bg-brand-blue-dark"
            >
              Add to library
            </button>
            <button
              type="button"
              className="rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-200"
            >
              Cancel
            </button>
          </div>
        </section>
      )}

      <div className="flex gap-5 border-t border-slate-200 pt-3">
        <AdminTree
          selected={selected}
          counts={counts}
          newFolderUnder={state === 'new-folder' ? 'math' : undefined}
        />
        <div className="min-w-0 flex-1">{content}</div>
      </div>
      {state === 'move' && (
        <FolderPickerPopover
          variant="dialog"
          title="Move Barn Bluff Formation (2025) to…"
          folders={ADMIN_FOLDERS}
          selectedFolderId="sci-8"
          onSelect={noop}
          onClose={noop}
        />
      )}
    </div>
  );
};

// ─── Teacher add dialog ─────────────────────────────────────────────────────

// Paul as support staff sees every published folder; a Grade 8 science teacher sees one.
const visibleTo = (id: string) => itemsUnder(id).some((i) => !i.draft);
const addedIds = new Set(
  state === 'added-all'
    ? G8.map((g) => g.id)
    : ['sci-8-0', 'sci-8-1', 'sci-8-2']
);
const publishedUnder = (id: string) => itemsUnder(id).filter((i) => !i.draft);

const AddRow: React.FC<{ fx: Fx; path?: boolean; busy?: boolean }> = ({
  fx,
  path,
  busy,
}) => {
  const isAdded = addedIds.has(fx.id);
  return (
    <li className="flex items-start gap-3 py-2.5">
      <Library
        className="mt-0.5 h-4 w-4 shrink-0 text-brand-blue-primary"
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-slate-900" title={fx.title}>
          {path ? fx.title : shortTitle(fx.title)}
        </div>
        <div className="text-xs text-slate-500">
          {path ? `${pathOf(fx.folder).join(' / ')} · ` : ''}
          {fx.q} questions ·{' '}
          <button
            type="button"
            className="inline-flex items-center gap-0.5 font-semibold text-brand-blue-primary hover:underline"
          >
            Sources
            <ChevronDown className="h-3 w-3" aria-hidden />
          </button>
        </div>
      </div>
      {isAdded ? (
        <div className="flex shrink-0 items-center gap-2">
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
            <Check className="h-3.5 w-3.5" aria-hidden />
            In your banks
          </span>
          <button
            type="button"
            aria-label={`Remove ${fx.title}`}
            className="touch-target-expand relative rounded-md p-1 text-slate-500 hover:bg-slate-100"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-blue-primary px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-blue-dark"
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <Plus className="h-3.5 w-3.5" aria-hidden />
          )}
          Add
        </button>
      )}
    </li>
  );
};

const SearchBox: React.FC<{ value: string }> = ({ value }) => (
  <div className="relative">
    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
    <input
      type="search"
      defaultValue={value}
      placeholder="Search the district library"
      className="w-full rounded-xl border border-slate-200 bg-white py-1.5 pl-9 pr-3 text-sm font-medium text-slate-700 shadow-xs placeholder:text-slate-400"
    />
  </div>
);

const addedCount = (id: string) =>
  publishedUnder(id).filter((i) => addedIds.has(i.id)).length;
const folderMeta = (id: string) => {
  const n = publishedUnder(id).length;
  const a = addedCount(id);
  const kids = childrenOf(id).filter((k) => visibleTo(k.id)).length;
  return [
    kids > 0 ? plural(kids, 'folder') : '',
    plural(n, 'bank'),
    a > 0 ? `${a} added` : '',
  ]
    .filter(Boolean)
    .join(' · ');
};

const AddDialog: React.FC = () => {
  const narrow = params.get('narrow') === '1';
  const level =
    (
      {
        root: null,
        science: 'sci',
        'one-folder': 'sci-8',
      } as Record<string, string | null>
    )[state] ?? 'sci-8';
  const searching = state === 'search' || state === 'search-empty';
  const oneFolder = state === 'one-folder';

  const subfolders = level
    ? childrenOf(level).filter((n) => visibleTo(n.id))
    : childrenOf(null).filter((n) => visibleTo(n.id));
  const items = level
    ? ITEMS.filter((i) => i.folder === level && !i.draft)
    : [];
  const remaining = items.filter((i) => !addedIds.has(i.id)).length;

  const folderHeader = (
    <div className="flex items-center gap-2 pb-2">
      <div className="min-w-0 flex-1">
        {narrow || oneFolder ? (
          oneFolder ? (
            <div className="text-xs text-slate-500">MCA Science</div>
          ) : null
        ) : (
          <Crumbs root="All folders" at={level} />
        )}
        {level && (
          <div className="flex items-baseline gap-2">
            <h4 className="text-base font-bold text-slate-900">
              {nodeOf(level)?.name}
            </h4>
            <span className="text-xs text-slate-500">{folderMeta(level)}</span>
          </div>
        )}
      </div>
      {items.length > 0 && (
        <button
          type="button"
          disabled={remaining === 0}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
        >
          {remaining === 0 ? (
            <Check className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <Plus className="h-3.5 w-3.5" aria-hidden />
          )}
          {remaining === 0 ? 'All added' : `Add all ${remaining}`}
        </button>
      )}
    </div>
  );

  const list = (
    <ul className="divide-y divide-slate-200 border-y border-slate-200">
      <FolderRows ids={subfolders.map((s) => s.id)} meta={folderMeta} />
      {items.map((fx, i) => (
        <AddRow key={fx.id} fx={fx} busy={state === '' && i === 4} />
      ))}
    </ul>
  );

  const tree = (
    <nav className="w-44 shrink-0" aria-label="Folders">
      <button type="button" className={treeRowClass(level === null)}>
        <Library className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
        <span className="min-w-0 flex-1 truncate">All folders</span>
      </button>
      {TREE.filter((n) => visibleTo(n.id)).map((n) => {
        const depth = pathOf(n.id).length;
        return (
          <button
            key={n.id}
            type="button"
            className={treeRowClass(n.id === level)}
            style={{ paddingLeft: 8 + depth * 14 }}
          >
            <Folder className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
            <span className="min-w-0 flex-1 truncate">{n.name}</span>
            <span className="text-xxs tabular-nums text-slate-400">
              {publishedUnder(n.id).length}
            </span>
          </button>
        );
      })}
    </nav>
  );

  let body: React.ReactNode;
  if (searching) {
    const q = state === 'search' ? 'energy' : 'photosynthesis';
    const hits = ITEMS.filter(
      (i) => !i.draft && i.title.toLowerCase().includes(q)
    );
    body = (
      <>
        <SearchBox value={q} />
        {hits.length > 0 ? (
          <>
            <p className="mt-3 text-xs font-semibold text-slate-500">
              {plural(hits.length, 'result')} in all folders
            </p>
            <ul className="mt-1 divide-y divide-slate-200 border-y border-slate-200">
              {hits.map((h) => (
                <AddRow key={h.id} fx={h} path />
              ))}
            </ul>
          </>
        ) : (
          <div className="py-10 text-center">
            <p className="text-sm font-semibold text-slate-700">
              No matches for &ldquo;{q}&rdquo;
            </p>
            <p className="text-sm text-slate-500">Try a shorter word.</p>
          </div>
        )}
      </>
    );
  } else if (narrow || oneFolder) {
    body = (
      <>
        <SearchBox value="" />
        {level && !oneFolder && (
          <button
            type="button"
            className="mt-3 inline-flex items-center gap-0.5 text-sm font-semibold text-brand-blue-primary"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
            {nodeOf(nodeOf(level)?.parent ?? null)?.name ?? 'All folders'}
          </button>
        )}
        <div className="mt-2">{folderHeader}</div>
        {list}
      </>
    );
  } else {
    body = (
      <>
        <SearchBox value="" />
        <div className="mt-4 flex gap-5">
          {tree}
          <div className="min-w-0 flex-1">
            {folderHeader}
            {list}
          </div>
        </div>
      </>
    );
  }

  return (
    <Modal
      isOpen
      onClose={noop}
      title="District library"
      maxWidth={narrow ? 'max-w-md' : 'max-w-3xl'}
      contentClassName="px-6 pb-6 overflow-y-auto"
    >
      <p className="mb-3 text-sm text-slate-600">
        Added items stay read-only and get the district&apos;s corrections.
      </p>
      {body}
    </Modal>
  );
};

// ─── Quiz widget, Question banks ────────────────────────────────────────────

interface BankRow {
  id: string;
  title: string;
  questionCount: number;
  folderId: string | null;
  updatedAt: number;
  district?: boolean;
}

const D = 'source:district';
const nothingAdded = state === 'before';
const filed = state === 'filed';
const BANK_FOLDERS: LibraryFolder[] = [
  ...(nothingAdded
    ? []
    : [
        folderOf(D, 'District library', null, -1, 'gray'),
        folderOf(`${D}:sci`, 'MCA Science', D, 0, 'gray'),
        folderOf(`${D}:sci-8`, 'Grade 8', `${D}:sci`, 0, 'gray'),
      ]),
  folderOf('samples', 'Samples', null, 1, 'red'),
  folderOf('schoology', 'From Schoology', null, 2, 'blue'),
  folderOf('mcas', 'MCAs', null, 3),
];

const ADDED_G8 = G8.filter((g) => !['sci-8-5', 'sci-8-6'].includes(g.id));
const BANK_ROWS: BankRow[] = [
  ...(nothingAdded ? [] : ADDED_G8).map((g, i) => ({
    id: g.id,
    title: g.title,
    questionCount: g.q,
    folderId: filed && i === 0 ? 'mcas' : `${D}:sci-8`,
    updatedAt: NOW - i * 1000,
    district: true,
  })),
  {
    id: 'own-1',
    title: 'Unit 3 forces review',
    questionCount: 18,
    folderId: null,
    updatedAt: NOW,
  },
  {
    id: 'own-2',
    title: 'Lab safety',
    questionCount: 12,
    folderId: 'samples',
    updatedAt: NOW,
  },
  {
    id: 'own-3',
    title: 'Energy unit warm-ups',
    questionCount: 10,
    folderId: 'mcas',
    updatedAt: NOW - 5000,
  },
];

const SEARCH_FIELDS = (b: BankRow): string => b.title;
const SORT = [{ key: 'updatedAt', label: 'Last updated' }];
const START_FOLDER: Record<string, string> = {
  district: D,
  science: `${D}:sci`,
  inside: `${D}:sci-8`,
  menu: `${D}:sci-8`,
  filed: 'mcas',
};

const toolbarChip =
  'inline-flex items-center rounded-lg bg-white/70 font-bold uppercase tracking-wider text-slate-600 transition-colors hover:bg-white hover:text-slate-800';

const BanksView: React.FC = () => {
  const search = params.get('q') ?? '';
  const view = useFolderLibraryView<BankRow>({
    items: BANK_ROWS,
    folderView: {
      library: 'district-folders-dev',
      userId: undefined,
      folders: BANK_FOLDERS,
      foldersLoading: false,
      getId: (b) => b.id,
      itemNoun: ['bank', 'banks'],
    },
    initialSort: { key: 'updatedAt', dir: 'desc' },
    initialViewMode: 'list',
    searchFields: SEARCH_FIELDS,
    sortComparators: { updatedAt: (a, b) => b.updatedAt - a.updatedAt },
  });
  const [opened, setOpened] = useState(false);
  if (!opened) {
    setOpened(true);
    if (START_FOLDER[state]) view.onSelectFolder(START_FOLDER[state]);
    if (search) view.toolbarProps.onSearchChange(search);
  }
  const counts: Record<string, number> = {};
  for (const b of BANK_ROWS) {
    if (b.folderId) counts[b.folderId] = (counts[b.folderId] ?? 0) + 1;
  }
  const inDistrict = (view.selectedFolderId ?? '').startsWith(D) && !search;

  return (
    <LibraryShell
      widgetLabel="Quiz"
      widgetType="quiz"
      tab="library"
      onTabChange={noop}
      counts={{ library: 7, active: 2, archive: 3 }}
      primaryAction={{ label: 'New', icon: Plus, onClick: noop }}
      folderView={view.folderView}
      folderViewMode="list"
      toolbarSlot={
        <LibraryToolbar
          search={view.state.search}
          onSearchChange={view.toolbarProps.onSearchChange}
          searchPlaceholder="Search banks..."
          sort={{ key: 'updatedAt', dir: 'desc' }}
          sortOptions={SORT}
          onSortChange={noop}
          widgetType="quiz"
          rightSlot={
            <button
              type="button"
              className={toolbarChip}
              style={{
                gap: 'min(6px, 1.5cqmin)',
                padding: 'min(6px, 1.5cqmin) min(10px, 2.5cqmin)',
                fontSize: 'min(11px, 4cqmin)',
              }}
              title="Quizzes and banks from your district"
            >
              <Library
                style={{
                  width: 'min(14px, 3.5cqmin)',
                  height: 'min(14px, 3.5cqmin)',
                }}
                aria-hidden="true"
              />
              District · 15
            </button>
          }
        />
      }
      filterSidebarSlot={
        <FolderSidebar
          widget="quiz"
          folders={BANK_FOLDERS}
          selectedFolderId={view.selectedFolderId}
          onSelectFolder={view.onSelectFolder}
          itemCounts={counts}
          folderView={view.folderView}
          onCreateFolder={() => Promise.resolve('x')}
          extraNav={[
            {
              id: 'banks',
              icon: Library,
              label: 'Question banks',
              count: BANK_ROWS.length,
              selected: true,
              onClick: noop,
            },
          ]}
        />
      }
    >
      <LibraryGrid<BankRow>
        items={view.visibleItems}
        getId={(b) => b.id}
        layout="list"
        dragDisabled
        emptyState={null}
        renderCard={(b) => (
          <LibraryItemCard<BankRow>
            key={b.id}
            id={b.id}
            title={inDistrict ? shortTitle(b.title) : b.title}
            subtitle={
              <span>
                {b.questionCount} questions
                {b.district ? ' · Read-only' : ''}
              </span>
            }
            badges={
              b.district && !inDistrict
                ? [{ label: 'District library', tone: 'info' }]
                : []
            }
            secondaryActions={
              b.district
                ? [
                    {
                      id: 'move',
                      label: 'Move to folder',
                      icon: FolderInput,
                      onClick: noop,
                    },
                    {
                      id: 'remove',
                      label: 'Remove from my banks',
                      icon: FolderMinus,
                      onClick: noop,
                    },
                  ]
                : [
                    {
                      id: 'edit',
                      label: 'Edit',
                      icon: NotebookPen,
                      onClick: noop,
                    },
                  ]
            }
            viewMode="list"
            sortable={false}
          />
        )}
      />
    </LibraryShell>
  );
};

// ─── Page ───────────────────────────────────────────────────────────────────

export const DistrictFoldersDevHarness: React.FC = () => {
  if (part === 'add') return <AddDialog />;
  if (part === 'banks')
    return (
      <div className="min-h-screen bg-slate-300 p-6">
        <div
          className="relative overflow-hidden rounded-2xl bg-white shadow-lg"
          style={{ width: W || 1080, height: H || 620, containerType: 'size' }}
        >
          <BanksView />
        </div>
      </div>
    );
  return (
    <div className="min-h-screen bg-white">
      <AdminPanel />
    </div>
  );
};
