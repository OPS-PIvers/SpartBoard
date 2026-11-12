// Design mockup for District library folders: admin panel, teacher add dialog, Quiz banks view.
import React, { useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Folder,
  FolderInput,
  FolderPlus,
  Library,
  Loader2,
  MoreHorizontal,
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
  status?: 'draft' | 'published';
  own?: string;
}

const G8: Fx[] = [
  ['Arizona Meteor (2025)', 5],
  ['Barn Bluff Formation (2025)', 4],
  ['Carbon Capture (2025)', 4],
  ['Dung Beetle Starlight Orientation (2021)', 8],
  ['Effects of Climate Change on Lobsters (2025)', 8],
  ['Light Bulbs (2025)', 4],
  ['Plant Fluorescence (2023)', 6],
  ['Roller Coaster Energy (2025)', 7],
  ['Static Electricity (2025)', 4],
].map(([t, q], i) => ({
  id: `g8-${i}`,
  title: `MCA IV Science Grade 8: ${t as string}`,
  q: q as number,
  folder: 'sci-8',
  status: 'published',
  own: i === 8 ? 'Orono Middle School · Grade 7' : undefined,
}));

const G5: Fx[] = [
  ['Bird Beaks (2024)', 6],
  ['Melting Ice (2025)', 5],
  ['Plant Growth (2023)', 4],
].map(([t, q], i) => ({
  id: `g5-${i}`,
  title: `MCA IV Science Grade 5: ${t as string}`,
  q: q as number,
  folder: 'sci-5',
  status: i === 2 ? 'draft' : 'published',
}));

const ITEMS: Fx[] = [...G8, ...G5];

// Admin folder tree. Ids are plain here; the teacher side mirrors them under `source:`.
const ADMIN_TREE: { id: string; name: string; parent: string | null }[] = [
  { id: 'sci', name: 'MCA Science', parent: null },
  { id: 'sci-5', name: 'Grade 5', parent: 'sci' },
  { id: 'sci-8', name: 'Grade 8', parent: 'sci' },
  { id: 'sci-hs', name: 'High school', parent: 'sci' },
  { id: 'math', name: 'MCA Math', parent: null },
  { id: 'math-6', name: 'Grade 6', parent: 'math' },
  { id: 'math-7', name: 'Grade 7', parent: 'math' },
  { id: 'math-8', name: 'Grade 8', parent: 'math' },
  { id: 'read', name: 'MCA Reading', parent: null },
];

const folderOf = (
  id: string,
  name: string,
  parentId: string | null,
  order: number,
  color?: LibraryFolder['color']
): LibraryFolder => ({ id, name, parentId, order, createdAt: NOW, color });

const ADMIN_FOLDERS: LibraryFolder[] = ADMIN_TREE.map((f, i) =>
  folderOf(f.id, f.name, f.parent, i)
);

const asItem = (fx: Fx): DistrictLibraryItem => ({
  id: fx.id,
  kind: 'bank',
  title: fx.title,
  questionCount: fx.q,
  status: fx.status ?? 'published',
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

// ─── Admin panel ────────────────────────────────────────────────────────────

/** Inside a folder, drop the series prefix every title repeats ("MCA IV Science Grade 8: "). */
const shortTitle = (title: string): string => title.replace(/^[^:]+:\s*/, '');

const iconButton =
  'touch-target-expand relative inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50';

const AdminFolderRow: React.FC<{
  folder: LibraryFolder;
  depth: number;
  selected: string;
  onSelect: (id: string) => void;
  counts: Record<string, number>;
}> = ({ folder, depth, selected, onSelect, counts }) => {
  const children = ADMIN_FOLDERS.filter((f) => f.parentId === folder.id);
  const open = selected.startsWith(folder.id) || folder.id === 'math';
  const isSel = selected === folder.id;
  return (
    <>
      <button
        type="button"
        onClick={() => onSelect(folder.id)}
        className={`flex w-full items-center gap-1.5 rounded-lg py-1.5 pr-2 text-left text-sm ${
          isSel
            ? 'bg-brand-blue-lighter font-semibold text-brand-blue-dark'
            : 'text-slate-700 hover:bg-slate-100'
        }`}
        style={{ paddingLeft: 8 + depth * 14 }}
      >
        {children.length > 0 ? (
          open ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          )
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        <Folder className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
        <span className="min-w-0 flex-1 truncate">{folder.name}</span>
        <span className="text-xxs tabular-nums text-slate-400">
          {counts[folder.id] ?? 0}
        </span>
      </button>
      {open &&
        children.map((c) => (
          <AdminFolderRow
            key={c.id}
            folder={c}
            depth={depth + 1}
            selected={selected}
            onSelect={onSelect}
            counts={counts}
          />
        ))}
    </>
  );
};

const AdminPanel: React.FC = () => {
  const [selected, setSelected] = useState('sci-8');
  const counts: Record<string, number> = {};
  for (const it of ITEMS) {
    let f: string | null = it.folder;
    while (f) {
      counts[f] = (counts[f] ?? 0) + 1;
      f = ADMIN_FOLDERS.find((x) => x.id === f)?.parentId ?? null;
    }
  }
  const items = ITEMS.filter((i) => i.folder === selected);
  const folder = ADMIN_FOLDERS.find((f) => f.id === selected);
  const parent = ADMIN_FOLDERS.find((f) => f.id === folder?.parentId);
  const folderWho = state === 'folder-who';
  const itemWho = state === 'item-who';
  const menuOpen = state === 'menu';
  const upload = state === 'upload';

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

      {upload && (
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
          <button
            type="button"
            className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100"
          >
            <span className="w-3.5" />
            <Library className="h-4 w-4 text-slate-400" aria-hidden />
            <span className="flex-1">All items</span>
            <span className="text-xxs tabular-nums text-slate-400">
              {ITEMS.length}
            </span>
          </button>
          {ADMIN_FOLDERS.filter((f) => f.parentId === null).map((f) => (
            <AdminFolderRow
              key={f.id}
              folder={f}
              depth={0}
              selected={selected}
              onSelect={setSelected}
              counts={counts}
            />
          ))}
          <div className="my-2 border-t border-slate-200" />
          <button
            type="button"
            className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100"
          >
            <span className="w-3.5" />
            <Eye className="h-4 w-4 text-slate-400" aria-hidden />
            <span className="flex-1">Drafts</span>
            <span className="text-xxs tabular-nums text-slate-400">1</span>
          </button>
        </nav>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 pb-2">
            <div className="min-w-0 flex-1">
              <div className="text-xs text-slate-500">
                {parent?.name ?? 'All items'}
              </div>
              <div className="flex items-baseline gap-2">
                <h4 className="text-base font-bold text-slate-900">
                  {folder?.name}
                </h4>
                <span className="text-xs text-slate-500">
                  {items.length} items · Orono Middle School · Grade 8
                </span>
              </div>
            </div>
            <button
              type="button"
              aria-expanded={folderWho}
              className={`${iconButton} ${folderWho ? 'bg-slate-100 text-slate-900' : ''}`}
            >
              <Users className="h-3.5 w-3.5" aria-hidden />
              Who sees this folder
            </button>
            <button
              type="button"
              aria-label="Folder menu"
              className={iconButton}
            >
              <MoreHorizontal className="h-4 w-4" aria-hidden />
            </button>
          </div>
          {folderWho && (
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
              <li key={item.id} className="py-3">
                <div className="flex items-start gap-3">
                  <Library
                    className="mt-0.5 h-5 w-5 shrink-0 text-slate-400"
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span
                        className="text-sm font-semibold text-slate-900"
                        title={item.title}
                      >
                        {shortTitle(item.title)}
                      </span>
                      {item.status === 'draft' && (
                        <span className="rounded bg-slate-200 px-1.5 py-0.5 text-xxs font-bold uppercase tracking-wider text-slate-700">
                          Draft
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500">
                      Question bank · {item.q} questions ·{' '}
                      {item.own ? (
                        <span className="font-semibold text-slate-700">
                          {item.own}
                        </span>
                      ) : (
                        'Same as folder'
                      )}{' '}
                      · updated Nov 12, 2026
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
                      className={`${iconButton} ${menuOpen && i === 1 ? 'bg-slate-100' : ''}`}
                    >
                      <MoreHorizontal className="h-4 w-4" aria-hidden />
                    </button>
                    {menuOpen && i === 1 && (
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
                            <Icon
                              className="h-4 w-4 text-slate-400"
                              aria-hidden
                            />
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
                {itemWho && i === 8 && (
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
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

// ─── Teacher add dialog ─────────────────────────────────────────────────────

const TEACHER_TREE = [
  { id: 'sci', name: 'MCA Science', depth: 0, count: 12 },
  { id: 'sci-5', name: 'Grade 5', depth: 1, count: 3 },
  { id: 'sci-8', name: 'Grade 8', depth: 1, count: 9 },
  { id: 'math', name: 'MCA Math', depth: 0, count: 0 },
];

const added = new Set(['g8-0', 'g8-1', 'g8-2']);

const AddRow: React.FC<{ fx: Fx; path?: string; busy?: boolean }> = ({
  fx,
  path,
  busy,
}) => {
  const isAdded = added.has(fx.id);
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
          {path ? `${path} · ` : ''}
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

const AddDialog: React.FC = () => {
  const narrow = state === 'narrow';
  const searching = state === 'search';
  const selected = 'sci-8';
  const rows = G8;
  const remaining = rows.filter((r) => !added.has(r.id)).length;

  const folderHeader = (
    <div className="flex items-center gap-2 pb-2">
      <div className="min-w-0 flex-1">
        {!narrow && <div className="text-xs text-slate-500">MCA Science</div>}
        <div className="flex items-baseline gap-2">
          <h4 className="text-base font-bold text-slate-900">Grade 8</h4>
          <span className="text-xs text-slate-500">
            {rows.length} banks · {rows.length - remaining} added
          </span>
        </div>
      </div>
      <button
        type="button"
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden />
        Add all {remaining}
      </button>
    </div>
  );

  const body = searching ? (
    <>
      <SearchBox value="energy" />
      <p className="mt-3 text-xs font-semibold text-slate-500">
        3 results in all folders
      </p>
      <ul className="mt-1 divide-y divide-slate-200 border-y border-slate-200">
        <AddRow fx={G8[7]} path="MCA Science / Grade 8" />
        <AddRow
          fx={{
            id: 'x1',
            title: 'MCA IV Science Grade 5: Energy Transfer (2024)',
            q: 5,
            folder: 'sci-5',
          }}
          path="MCA Science / Grade 5"
        />
        <AddRow
          fx={{
            id: 'x2',
            title: 'MCA IV Science HS: Energy in Ecosystems (2025)',
            q: 6,
            folder: 'sci-hs',
          }}
          path="MCA Science / High school"
        />
      </ul>
    </>
  ) : narrow ? (
    <>
      <SearchBox value="" />
      <button
        type="button"
        className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-blue-primary"
      >
        <ChevronRight className="h-4 w-4 rotate-180" aria-hidden />
        MCA Science
      </button>
      <div className="mt-1">{folderHeader}</div>
      <ul className="divide-y divide-slate-200 border-y border-slate-200">
        {rows.map((fx) => (
          <AddRow key={fx.id} fx={fx} />
        ))}
      </ul>
    </>
  ) : (
    <>
      <SearchBox value="" />
      <div className="mt-4 flex gap-5">
        <nav className="w-44 shrink-0" aria-label="Folders">
          {TEACHER_TREE.filter((f) => f.count > 0).map((f) => {
            const sel = f.id === selected;
            return (
              <button
                key={f.id}
                type="button"
                className={`flex w-full items-center gap-1.5 rounded-lg py-1.5 pr-2 text-left text-sm ${
                  sel
                    ? 'bg-brand-blue-lighter font-semibold text-brand-blue-dark'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
                style={{ paddingLeft: 8 + f.depth * 14 }}
              >
                <Folder
                  className="h-4 w-4 shrink-0 text-slate-400"
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                <span className="text-xxs tabular-nums text-slate-400">
                  {f.count}
                </span>
              </button>
            );
          })}
        </nav>
        <div className="min-w-0 flex-1">
          {folderHeader}
          <ul className="divide-y divide-slate-200 border-y border-slate-200">
            {rows.map((fx, i) => (
              <AddRow key={fx.id} fx={fx} busy={i === 4} />
            ))}
          </ul>
        </div>
      </div>
    </>
  );

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
const BANK_FOLDERS: LibraryFolder[] = [
  folderOf(D, 'District library', null, -1, 'gray'),
  folderOf(`${D}:sci`, 'MCA Science', D, 0, 'gray'),
  folderOf(`${D}:sci-8`, 'Grade 8', `${D}:sci`, 0, 'gray'),
  folderOf('samples', 'Samples', null, 1, 'red'),
  folderOf('schoology', 'From Schoology', null, 2, 'blue'),
  folderOf('mcas', 'MCAs', null, 3),
];

const BANK_ROWS: BankRow[] = [
  ...G8.filter((g) => !['g8-5', 'g8-6'].includes(g.id)).map((g, i) => ({
    id: g.id,
    title: g.title,
    questionCount: g.q,
    folderId: `${D}:sci-8`,
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
];

const SEARCH_FIELDS = (b: BankRow): string => b.title;
const SORT = [{ key: 'updatedAt', label: 'Last updated' }];

const BanksView: React.FC = () => {
  const [search, setSearch] = useState('');
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
    if (state === 'inside') view.onSelectFolder(`${D}:sci-8`);
  }
  const counts: Record<string, number> = {};
  for (const b of BANK_ROWS) {
    if (b.folderId) counts[b.folderId] = (counts[b.folderId] ?? 0) + 1;
  }
  const inDistrict = (view.selectedFolderId ?? '').startsWith(D);

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
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search banks..."
          sort={{ key: 'updatedAt', dir: 'desc' }}
          sortOptions={SORT}
          onSortChange={noop}
          widgetType="quiz"
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
            secondaryActions={[
              {
                id: 'm',
                label: b.district ? 'Remove from my banks' : 'Edit',
                icon: b.district ? X : Folder,
                onClick: noop,
              },
            ]}
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
