// Admin Settings > District library with folders: folder tree, folder audience, and rows filed by folder.
import React, { useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Folder,
  FolderInput,
  FolderPlus,
  Library,
  ListChecks,
  NotebookPen,
  Pencil,
  RefreshCw,
  Trash2,
  Users,
} from 'lucide-react';
import { useDialog } from '@/context/useDialog';
import { tourAttr, tourFieldAttr } from '@/config/tourAnchors';
import { OverflowMenu } from '@/components/common/library/LibraryOverflowMenu';
import { FolderPickerPopover } from '@/components/common/library/FolderPickerPopover';
import type { LibraryMenuAction } from '@/components/common/library/types';
import type { Building } from '@/config/buildings';
import type { LibraryFolder } from '@/types';
import type {
  DistrictLibraryFolderAudiences,
  DistrictLibraryItem,
  DistrictLibraryTargeting,
} from '@/types/districtLibrary';
import {
  childFolders,
  folderAudienceFor,
  folderChain,
  folderPathLabel,
  followsFolder,
  isInFolder,
  itemFolderId,
  shortTitle,
  type FolderMap,
} from '@/utils/districtLibraryFolders';
import { describeTargeting } from '@/utils/districtLibraryTargeting';
import {
  createDistrictFolder,
  deleteDistrictFolder,
  moveDistrictFolder,
  moveDistrictItems,
  renameDistrictFolder,
  saveDistrictFolderAudience,
  setDistrictItemFollowsFolder,
} from '@/hooks/useDistrictLibraryFolders';
import { saveDistrictLibraryTargeting } from '@/hooks/useDistrictLibraryAdmin';
import { DistrictLibraryTargetingEditor } from './DistrictLibraryTargetingEditor';

/** 'all' lists every item; 'drafts' every unpublished one; anything else is a folder id. */
export type AdminPlace = string;

const iconButton =
  'touch-target-expand relative inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50';

const treeRow = (selected: boolean) =>
  `flex w-full items-center gap-1.5 rounded-lg py-1.5 pr-2 text-left text-sm ${
    selected
      ? 'bg-brand-blue-lighter font-semibold text-brand-blue-dark'
      : 'text-slate-700 hover:bg-slate-100'
  }`;

const formatDate = (ms: number): string =>
  new Date(ms).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

const toLibraryFolders = (folders: FolderMap): LibraryFolder[] =>
  Object.entries(folders).map(([id, f]) => ({
    id,
    name: f.name,
    parentId: f.parentId,
    order: f.order,
    createdAt: 0,
  }));

interface Props {
  uid: string;
  items: DistrictLibraryItem[];
  folders: FolderMap;
  audiences: DistrictLibraryFolderAudiences['folders'];
  buildings: Building[];
  buildingName: (id: string) => string;
  place: AdminPlace;
  onPlaceChange: (place: AdminPlace) => void;
  isBusy: (itemId: string) => boolean;
  replaceDisabled: boolean;
  onTogglePublished: (item: DistrictLibraryItem) => void;
  onReplace: (itemId: string) => void;
  onRemove: (item: DistrictLibraryItem) => void;
  onError: (message: string) => void;
}

type Editing =
  { kind: 'item'; id: string } | { kind: 'folder'; id: string } | null;
type Moving = { kind: 'items'; ids: string[] } | { kind: 'folder'; id: string };

export const DistrictLibraryFolderView: React.FC<Props> = ({
  uid,
  items,
  folders,
  audiences,
  buildings,
  buildingName,
  place,
  onPlaceChange,
  isBusy,
  replaceDisabled,
  onTogglePublished,
  onReplace,
  onRemove,
  onError,
}) => {
  const { showConfirm } = useDialog();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [naming, setNaming] = useState<{
    parentId: string | null;
    renameId?: string;
    value: string;
  } | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [itemMode, setItemMode] = useState<'folder' | 'own'>('folder');
  const [moving, setMoving] = useState<Moving | null>(null);
  const [working, setWorking] = useState(false);

  const ctx = { folders, audiences, items, uid };
  const folderId = place !== 'all' && place !== 'drafts' ? place : null;
  const folder = folderId ? folders[folderId] : undefined;

  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const item of items) {
      for (const f of folderChain(folders, item.folderId ?? null)) {
        out[f.id] = (out[f.id] ?? 0) + 1;
      }
    }
    return out;
  }, [items, folders]);
  const drafts = items.filter((i) => i.status === 'draft');

  const run = async (action: () => Promise<unknown>) => {
    setWorking(true);
    try {
      await action();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setWorking(false);
    }
  };

  const commitName = () => {
    if (!naming) return;
    const name = naming.value.trim();
    setNaming(null);
    if (!name) return;
    void run(async () => {
      if (naming.renameId) {
        await renameDistrictFolder(naming.renameId, name);
      } else {
        const id = await createDistrictFolder(folders, name, naming.parentId);
        onPlaceChange(id);
      }
    });
  };

  const nameInput = (depth: number) => (
    <div
      className="flex items-center gap-1.5 py-1 pr-2"
      style={{ paddingLeft: 8 + depth * 14 }}
    >
      <span className="w-3.5 shrink-0" />
      <Folder className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
      <input
        autoFocus
        value={naming?.value ?? ''}
        aria-label="Folder name"
        onChange={(e) =>
          setNaming((prev) =>
            prev ? { ...prev, value: e.target.value } : prev
          )
        }
        onBlur={commitName}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commitName();
          if (e.key === 'Escape') setNaming(null);
        }}
        {...tourAttr('admin.district-library.folder-name')}
        className="min-w-0 flex-1 rounded-md border border-brand-blue-primary/40 bg-white px-1.5 py-0.5 text-sm text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-brand-blue-primary/30"
      />
    </div>
  );

  const treeNode = (
    node: { id: string; name: string },
    depth: number
  ): React.ReactNode => {
    const kids = childFolders(folders, node.id);
    const open = !collapsed[node.id];
    const renaming = naming?.renameId === node.id;
    return (
      <React.Fragment key={node.id}>
        {renaming ? (
          nameInput(depth)
        ) : (
          <div
            className={treeRow(place === node.id)}
            style={{ paddingLeft: 8 + depth * 14 }}
          >
            {kids.length > 0 ? (
              <button
                type="button"
                onClick={() =>
                  setCollapsed((prev) => ({ ...prev, [node.id]: open }))
                }
                aria-label={
                  open ? `Collapse ${node.name}` : `Expand ${node.name}`
                }
                aria-expanded={open}
                {...tourFieldAttr(
                  'admin.district-library.folder-expand',
                  'admin',
                  node.id
                )}
                className="shrink-0 text-slate-400 hover:text-slate-700"
              >
                {open ? (
                  <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                )}
              </button>
            ) : (
              <span className="w-3.5 shrink-0" />
            )}
            <button
              type="button"
              onClick={() => onPlaceChange(node.id)}
              {...tourFieldAttr(
                'admin.district-library.folder',
                'admin',
                node.id
              )}
              className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
            >
              <Folder className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{node.name}</span>
              <span className="text-xxs tabular-nums text-slate-400">
                {counts[node.id] ?? 0}
              </span>
            </button>
          </div>
        )}
        {open && kids.map((k) => treeNode(k, depth + 1))}
        {naming &&
          !naming.renameId &&
          naming.parentId === node.id &&
          nameInput(depth + 1)}
      </React.Fragment>
    );
  };

  const folderAudienceLabel = (id: string): string => {
    const found = folderAudienceFor(folders, audiences, id);
    return found
      ? describeTargeting(found.audience, buildingName)
      : 'Nobody yet';
  };

  const itemActions = (item: DistrictLibraryItem): LibraryMenuAction[] => [
    {
      id: 'publish',
      label: item.status === 'published' ? 'Unpublish' : 'Publish',
      icon: item.status === 'published' ? EyeOff : Eye,
      disabled:
        isBusy(item.id) ||
        (item.status === 'draft' && !(item.contentVersion > 0)),
      disabledReason:
        item.contentVersion > 0
          ? undefined
          : 'Its upload did not finish. Upload the package again first.',
      onClick: () => onTogglePublished(item),
      anchor: tourFieldAttr('admin.district-library.publish', 'admin', item.id),
    },
    {
      id: 'move',
      label: 'Move to folder',
      icon: FolderInput,
      disabled: isBusy(item.id),
      onClick: () => setMoving({ kind: 'items', ids: [item.id] }),
      anchor: tourFieldAttr('admin.district-library.move', 'admin', item.id),
    },
    {
      id: 'replace',
      label: 'Replace',
      icon: RefreshCw,
      disabled: isBusy(item.id) || replaceDisabled,
      onClick: () => onReplace(item.id),
      anchor: tourFieldAttr('admin.district-library.replace', 'admin', item.id),
    },
    {
      id: 'delete',
      label: 'Delete',
      icon: Trash2,
      destructive: true,
      disabled: isBusy(item.id),
      onClick: () => onRemove(item),
      anchor: tourFieldAttr('admin.district-library.delete', 'admin', item.id),
    },
  ];

  const folderActions = (id: string): LibraryMenuAction[] => [
    {
      id: 'rename',
      label: 'Rename',
      icon: Pencil,
      onClick: () =>
        setNaming({ parentId: null, renameId: id, value: folders[id].name }),
      anchor: tourFieldAttr(
        'admin.district-library.folder-rename',
        'admin',
        id
      ),
    },
    {
      id: 'new-inside',
      label: 'New folder inside',
      icon: FolderPlus,
      onClick: () => {
        setCollapsed((prev) => ({ ...prev, [id]: false }));
        setNaming({ parentId: id, value: '' });
      },
      anchor: tourFieldAttr(
        'admin.district-library.folder-new-inside',
        'admin',
        id
      ),
    },
    {
      id: 'move',
      label: 'Move to folder',
      icon: FolderInput,
      onClick: () => setMoving({ kind: 'folder', id }),
      anchor: tourFieldAttr('admin.district-library.folder-move', 'admin', id),
    },
    {
      id: 'delete',
      label: 'Delete',
      icon: Trash2,
      destructive: true,
      onClick: () =>
        void (async () => {
          const ok = await showConfirm(
            `Delete the folder "${folders[id].name}"? Only empty folders can be deleted.`,
            {
              title: 'Delete folder',
              confirmLabel: 'Delete',
              variant: 'danger',
            }
          );
          if (!ok) return;
          await run(async () => {
            await deleteDistrictFolder(folders, items, id);
            onPlaceChange(liveParent(id));
          });
        })(),
      anchor: tourFieldAttr(
        'admin.district-library.folder-delete',
        'admin',
        id
      ),
    },
  ];
  const liveParent = (id: string): AdminPlace => {
    const parent = folders[id]?.parentId;
    return parent && folders[parent] ? parent : 'all';
  };

  const subtitle = (item: DistrictLibraryItem, showPath: boolean) => {
    const home = itemFolderId(folders, item);
    const audience = followsFolder(folders, item) ? (
      'Same as folder'
    ) : home ? (
      <span className="font-semibold text-slate-700">
        {describeTargeting(item, buildingName)}
      </span>
    ) : (
      describeTargeting(item, buildingName)
    );
    return (
      <>
        {showPath && home ? `${folderPathLabel(folders, home)} · ` : ''}
        {item.kind === 'quiz' ? 'Quiz' : 'Question bank'} ·{' '}
        {plural(item.questionCount, 'question')} · {audience} · updated{' '}
        {formatDate(item.updatedAt)}
      </>
    );
  };

  const itemRow = (item: DistrictLibraryItem, showPath: boolean) => {
    const KindIcon = item.kind === 'quiz' ? ListChecks : Library;
    const busy = isBusy(item.id) || working;
    const home = itemFolderId(folders, item);
    const open = editing?.kind === 'item' && editing.id === item.id;
    return (
      <li key={item.id} className="py-3">
        <div className="flex flex-wrap items-start gap-3">
          <KindIcon
            className="mt-0.5 h-5 w-5 shrink-0 text-slate-400"
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span
                className="text-sm font-semibold text-slate-900"
                title={item.title}
              >
                {showPath ? item.title : shortTitle(item.title)}
              </span>
              {item.status === 'draft' && (
                <span className="rounded bg-slate-200 px-1.5 py-0.5 text-xxs font-bold uppercase tracking-wider text-slate-700">
                  Draft
                </span>
              )}
            </div>
            <div className="text-xs text-slate-500">
              {subtitle(item, showPath)}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setItemMode(followsFolder(folders, item) ? 'folder' : 'own');
                setEditing(open ? null : { kind: 'item', id: item.id });
              }}
              aria-expanded={open}
              {...tourFieldAttr(
                'admin.district-library.targeting',
                'admin',
                item.id
              )}
              className={iconButton}
            >
              <Users className="h-3.5 w-3.5" aria-hidden />
              Who sees it
            </button>
            <OverflowMenu
              actions={itemActions(item)}
              widgetType="admin"
              anchor={tourFieldAttr(
                'admin.district-library.row-menu',
                'admin',
                item.id
              )}
            />
          </div>
        </div>
        {open && !busy && (
          <div className="mt-3 sm:ml-8">
            {home && (
              <div
                role="radiogroup"
                aria-label="Who sees it"
                className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5 text-sm"
              >
                {(
                  [
                    [
                      'folder',
                      'Same as folder',
                      tourFieldAttr(
                        'admin.district-library.same-as-folder',
                        'admin',
                        item.id
                      ),
                    ],
                    [
                      'own',
                      'Choose for this item',
                      tourFieldAttr(
                        'admin.district-library.own-audience',
                        'admin',
                        item.id
                      ),
                    ],
                  ] as const
                ).map(([mode, label, anchor]) => (
                  <button
                    key={mode}
                    type="button"
                    role="radio"
                    aria-checked={itemMode === mode}
                    onClick={() => setItemMode(mode)}
                    {...anchor}
                    className={`rounded-md px-3 py-1 ${
                      itemMode === mode
                        ? 'bg-brand-blue-primary font-semibold text-white'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            {home && itemMode === 'folder' ? (
              <div className="mt-3 flex items-center gap-2">
                <span className="text-sm text-slate-700">
                  {folderAudienceLabel(home)}
                </span>
                <button
                  type="button"
                  disabled={working}
                  onClick={() =>
                    void run(async () => {
                      await setDistrictItemFollowsFolder(item, true, ctx);
                      setEditing(null);
                    })
                  }
                  {...tourFieldAttr(
                    'admin.district-library.save-same-as-folder',
                    'admin',
                    item.id
                  )}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-brand-blue-primary px-3 py-1.5 text-sm font-bold text-white hover:bg-brand-blue-dark disabled:opacity-50"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  {...tourFieldAttr(
                    'admin.district-library.cancel-targeting',
                    'admin',
                    `${item.id}-folder`
                  )}
                  className="rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-200"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <DistrictLibraryTargetingEditor
                item={item}
                buildings={buildings}
                onCancel={() => setEditing(null)}
                onSave={async (targeting: DistrictLibraryTargeting) => {
                  await saveDistrictLibraryTargeting(
                    item.id,
                    targeting,
                    buildings,
                    uid,
                    home !== null
                  );
                  setEditing(null);
                }}
              />
            )}
          </div>
        )}
      </li>
    );
  };

  const folderRow = (id: string) => {
    const f = folders[id];
    const n = counts[id] ?? 0;
    return (
      <li key={id}>
        <button
          type="button"
          onClick={() => onPlaceChange(id)}
          {...tourFieldAttr('admin.district-library.open-folder', 'admin', id)}
          className="flex w-full items-center gap-3 py-2.5 text-left hover:bg-slate-50"
        >
          <Folder className="h-5 w-5 shrink-0 text-slate-400" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-slate-900">
              {f.name}
            </span>
            <span className="block text-xs text-slate-500">
              {n === 0
                ? 'Empty'
                : `${plural(n, 'item')} · ${folderAudienceLabel(id)}`}
            </span>
          </span>
          <ChevronRight
            className="h-4 w-4 shrink-0 text-slate-400"
            aria-hidden
          />
        </button>
      </li>
    );
  };

  let header: React.ReactNode;
  let body: React.ReactNode;
  if (folderId && folder) {
    const kids = childFolders(folders, folderId);
    const direct = items.filter((i) => itemFolderId(folders, i) === folderId);
    const parentPath = folderPathLabel(folders, folder.parentId);
    const audienceOpen = editing?.kind === 'folder' && editing.id === folderId;
    const audience = folderAudienceFor(folders, audiences, folderId);
    header = (
      <>
        <div className="flex flex-wrap items-center gap-2 pb-2">
          <div className="min-w-0 flex-1">
            {parentPath && (
              <div className="text-xs text-slate-500">{parentPath}</div>
            )}
            <div className="flex flex-wrap items-baseline gap-x-2">
              <h4 className="text-base font-bold text-slate-900">
                {folder.name}
              </h4>
              <span className="text-xs text-slate-500">
                {[
                  kids.length > 0 ? plural(kids.length, 'folder') : '',
                  (counts[folderId] ?? 0) === 0
                    ? 'Empty'
                    : plural(counts[folderId] ?? 0, 'item'),
                  folderAudienceLabel(folderId),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </div>
          </div>
          <button
            type="button"
            disabled={working}
            aria-expanded={audienceOpen}
            onClick={() =>
              setEditing(audienceOpen ? null : { kind: 'folder', id: folderId })
            }
            {...tourFieldAttr(
              'admin.district-library.folder-targeting',
              'admin',
              folderId
            )}
            className={`${iconButton} ${audienceOpen ? 'bg-slate-100 text-slate-900' : ''}`}
          >
            <Users className="h-3.5 w-3.5" aria-hidden />
            Who sees this folder
          </button>
          <OverflowMenu
            actions={folderActions(folderId)}
            widgetType="admin"
            anchor={tourFieldAttr(
              'admin.district-library.folder-menu',
              'admin',
              folderId
            )}
          />
        </div>
        {audienceOpen && (
          <div className="mb-3">
            <p className="text-sm text-slate-700">
              Applies to every item in this folder, including new ones. Items
              you set on their own keep their own choice.
            </p>
            <DistrictLibraryTargetingEditor
              item={{
                id: folderId,
                everyone: audience?.audience.everyone ?? false,
                targetBuildings: audience?.audience.targetBuildings ?? [],
                targetGrades: audience?.audience.targetGrades ?? [],
                targetEmails: audience?.audience.targetEmails ?? [],
              }}
              buildings={buildings}
              onCancel={() => setEditing(null)}
              onSave={async (targeting) => {
                await saveDistrictFolderAudience(
                  folderId,
                  targeting,
                  buildings,
                  ctx
                );
                setEditing(null);
              }}
            />
          </div>
        )}
      </>
    );
    body =
      kids.length === 0 && direct.length === 0 ? (
        <div className="border-t border-slate-200 py-10 text-center">
          <p className="text-sm font-semibold text-slate-700">
            This folder is empty
          </p>
          <p className="text-sm text-slate-500">
            Upload a package or move items here.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-200 border-y border-slate-200">
          {kids.map((k) => folderRow(k.id))}
          {direct.map((item) => itemRow(item, false))}
        </ul>
      );
  } else {
    const list = place === 'drafts' ? drafts : items;
    header = (
      <div className="flex flex-wrap items-baseline gap-x-2 pb-2">
        <h4 className="text-base font-bold text-slate-900">
          {place === 'drafts' ? 'Drafts' : 'All items'}
        </h4>
        <span className="text-xs text-slate-500">
          {place === 'drafts'
            ? 'Only admins see drafts'
            : plural(list.length, 'item')}
        </span>
      </div>
    );
    body =
      list.length === 0 ? (
        <div className="border-t border-slate-200 py-10 text-center">
          <p className="text-sm font-semibold text-slate-700">
            {place === 'drafts' ? 'No drafts' : 'No library items yet'}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-200 border-y border-slate-200">
          {list.map((item) => itemRow(item, true))}
        </ul>
      );
  }

  const libraryFolders = toLibraryFolders(folders);
  return (
    <div className="flex flex-col gap-5 border-t border-slate-200 pt-3 md:flex-row">
      <nav className="shrink-0 md:w-56" aria-label="District library folders">
        <div className="mb-1 flex items-center justify-between px-2">
          <span className="text-xxs font-bold uppercase tracking-wider text-slate-500">
            Folders
          </span>
          <button
            type="button"
            aria-label="New folder"
            title="New folder"
            disabled={working}
            onClick={() => {
              if (folderId)
                setCollapsed((prev) => ({ ...prev, [folderId]: false }));
              setNaming({ parentId: folderId, value: '' });
            }}
            {...tourAttr('admin.district-library.new-folder')}
            className="touch-target-expand relative rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50"
          >
            <FolderPlus className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <button
          type="button"
          onClick={() => onPlaceChange('all')}
          {...tourAttr('admin.district-library.all-items')}
          className={treeRow(place === 'all')}
          style={{ paddingLeft: 8 }}
        >
          <span className="w-3.5 shrink-0" />
          <Library className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
          <span className="flex-1">All items</span>
          <span className="text-xxs tabular-nums text-slate-400">
            {items.length}
          </span>
        </button>
        {childFolders(folders, null).map((f) => treeNode(f, 0))}
        {naming && !naming.renameId && naming.parentId === null && nameInput(0)}
        <div className="my-2 border-t border-slate-200" />
        <button
          type="button"
          onClick={() => onPlaceChange('drafts')}
          {...tourAttr('admin.district-library.drafts')}
          className={treeRow(place === 'drafts')}
          style={{ paddingLeft: 8 }}
        >
          <span className="w-3.5 shrink-0" />
          <NotebookPen
            className="h-4 w-4 shrink-0 text-slate-400"
            aria-hidden
          />
          <span className="flex-1">Drafts</span>
          <span className="text-xxs tabular-nums text-slate-400">
            {drafts.length}
          </span>
        </button>
      </nav>
      <div className="min-w-0 flex-1">
        {header}
        {body}
      </div>
      {moving && (
        <FolderPickerPopover
          variant="dialog"
          title={
            moving.kind === 'folder'
              ? `Move "${folders[moving.id]?.name ?? ''}" to…`
              : `Move "${shortTitle(items.find((i) => i.id === moving.ids[0])?.title ?? '')}" to…`
          }
          folders={
            moving.kind === 'folder'
              ? libraryFolders.filter(
                  (f) => !isInFolder(folders, f.id, moving.id)
                )
              : libraryFolders
          }
          selectedFolderId={
            moving.kind === 'folder'
              ? (folders[moving.id]?.parentId ?? null)
              : itemFolderId(
                  folders,
                  items.find((i) => i.id === moving.ids[0]) ?? {}
                )
          }
          onSelect={(target) => {
            const job = moving;
            setMoving(null);
            void run(() =>
              job.kind === 'folder'
                ? moveDistrictFolder(job.id, target, ctx)
                : moveDistrictItems(job.ids, target, ctx)
            );
          }}
          onClose={() => setMoving(null)}
          rootLabel="Top level"
          rowAnchor={(id) =>
            tourFieldAttr('admin.district-library.move-target', 'admin', id)
          }
        />
      )}
    </div>
  );
};
