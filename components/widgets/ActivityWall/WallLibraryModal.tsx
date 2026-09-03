// Wall library — browse, open, edit, duplicate, clear, and delete walls.

import React, { useCallback, useEffect, useState } from 'react';
import {
  Copy,
  Eraser,
  LayoutGrid,
  Pencil,
  PlayCircle,
  Trash2,
} from 'lucide-react';
import {
  collection,
  deleteDoc,
  doc,
  getCountFromServer,
} from 'firebase/firestore';
import { Modal } from '@/components/common/Modal';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import { LibraryShell } from '@/components/common/library/LibraryShell';
import { LibraryToolbar } from '@/components/common/library/LibraryToolbar';
import { LibraryGrid } from '@/components/common/library/LibraryGrid';
import { LibraryItemCard } from '@/components/common/library/LibraryItemCard';
import type { LibrarySortDir } from '@/components/common/library/types';
import { db } from '@/config/firebase';
import type { ActivityWallLibraryEntry } from '@/types';
import { ACTIVITY_WALL_DEFAULT_APPEARANCE } from '@/types';
import { LAYOUT_OPTIONS } from './editor/layoutOptions';
import { activityWallSessionId } from '@/utils/activityWallLinks';
import { clearWallSubmissions } from './hooks/useActivityWallSession';

interface WallLibraryModalProps {
  open: boolean;
  onClose: () => void;
  uid: string | undefined;
  entries: ActivityWallLibraryEntry[];
  activeEntryId: string | null;
  readOnly: boolean;
  onOpenOnBoard: (entryId: string) => void;
  onCreate: () => void;
  onEdit: (entry: ActivityWallLibraryEntry) => void;
  onDuplicate: (entry: ActivityWallLibraryEntry) => Promise<void>;
  onDelete: (entryId: string) => Promise<void>;
  addToast: (message: string, tone: 'success' | 'error' | 'info') => void;
  confirm: (message: string) => Promise<boolean>;
}

const layoutSketch = (entry: ActivityWallLibraryEntry): React.ReactNode =>
  LAYOUT_OPTIONS.find((option) => option.layout === entry.layout)?.sketch ??
  null;

const layoutLabel = (entry: ActivityWallLibraryEntry): string =>
  LAYOUT_OPTIONS.find((option) => option.layout === entry.layout)?.label ??
  'Wall';

/** Appearance swatch + layout sketch shown as the card thumbnail. */
const WallThumbnail: React.FC<{ entry: ActivityWallLibraryEntry }> = ({
  entry,
}) => {
  const appearance = entry.appearance ?? ACTIVITY_WALL_DEFAULT_APPEARANCE;
  const isImage = appearance.kind === 'image';
  return (
    <div
      className={`flex h-full w-full items-center justify-center rounded-lg bg-cover bg-center ${
        isImage ? '' : appearance.value
      }`}
      style={
        isImage ? { backgroundImage: `url(${appearance.value})` } : undefined
      }
    >
      <div className="h-10 w-16 text-white/90">{layoutSketch(entry)}</div>
    </div>
  );
};

export const WallLibraryModal: React.FC<WallLibraryModalProps> = ({
  open,
  onClose,
  uid,
  entries,
  activeEntryId,
  readOnly,
  onOpenOnBoard,
  onCreate,
  onEdit,
  onDuplicate,
  onDelete,
  addToast,
  confirm,
}) => {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ key: string; dir: LibrarySortDir }>({
    key: 'recent',
    dir: 'desc',
  });
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [countedWhileOpen, setCountedWhileOpen] = useState(open);

  // Each open starts a fresh count pass so a reopened library never shows stale post totals.
  if (countedWhileOpen !== open) {
    setCountedWhileOpen(open);
    if (open) setCounts({});
  }

  // One aggregate count per wall, cached by entry id so re-sorting never re-bills it.
  const uncountedKey = entries
    .map((entry) => entry.id)
    .filter((id) => !(id in counts))
    .join(',');
  useEffect(() => {
    if (!open || !uid || !uncountedKey) return;
    let cancelled = false;
    void (async () => {
      const ids = uncountedKey.split(',');
      const resolved = await Promise.all(
        ids.map(async (id) => {
          try {
            const snap = await getCountFromServer(
              collection(
                db,
                'activity_wall_sessions',
                activityWallSessionId(uid, id),
                'submissions'
              )
            );
            return [id, snap.data().count] as const;
          } catch {
            return [id, 0] as const;
          }
        })
      );
      if (cancelled) return;
      setCounts((prev) => ({ ...prev, ...Object.fromEntries(resolved) }));
    })();
    return () => {
      cancelled = true;
    };
  }, [open, uid, uncountedKey]);

  const handleClearPosts = useCallback(
    async (entry: ActivityWallLibraryEntry) => {
      if (!uid) return;
      if (
        !(await confirm(`Delete every post on "${entry.title || 'Untitled'}"?`))
      ) {
        return;
      }
      try {
        await clearWallSubmissions(activityWallSessionId(uid, entry.id));
        setCounts((prev) => ({ ...prev, [entry.id]: 0 }));
        addToast('Posts cleared.', 'success');
      } catch (err) {
        console.error('[ActivityWall] Failed to clear posts:', err);
        addToast('Could not clear posts.', 'error');
      }
    },
    [addToast, confirm, uid]
  );

  const handleDelete = useCallback(
    async (entry: ActivityWallLibraryEntry) => {
      if (!uid) return;
      if (
        !(await confirm(
          `Delete "${entry.title || 'Untitled'}" and all of its posts? This cannot be undone.`
        ))
      ) {
        return;
      }
      try {
        const sessionId = activityWallSessionId(uid, entry.id);
        await clearWallSubmissions(sessionId);
        await onDelete(entry.id);
        await deleteDoc(doc(db, 'activity_wall_sessions', sessionId)).catch(
          () => {
            // Rules deny deleting the session doc; clearing posts + entry retires a wall.
          }
        );
        addToast('Wall deleted.', 'info');
      } catch (err) {
        console.error('[ActivityWall] Failed to delete wall:', err);
        addToast('Could not delete the wall.', 'error');
      }
    },
    [addToast, confirm, onDelete, uid]
  );

  if (!open) return null;

  const term = search.trim().toLowerCase();
  const filtered = entries.filter(
    (entry) =>
      !term ||
      entry.title.toLowerCase().includes(term) ||
      entry.prompt.toLowerCase().includes(term)
  );
  const sorted = [...filtered].sort((a, b) => {
    const value =
      sort.key === 'title'
        ? a.title.localeCompare(b.title)
        : a.updatedAt - b.updatedAt;
    return sort.dir === 'asc' ? value : -value;
  });

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Activity Walls"
      maxWidth="max-w-4xl"
      contentClassName="px-0 pb-0"
    >
      <LibraryShell
        widgetLabel="Activity Wall"
        tab="library"
        onTabChange={() => undefined}
        visibleTabs={['library']}
        counts={{ library: entries.length }}
        primaryAction={
          readOnly
            ? undefined
            : { label: 'New wall', icon: LayoutGrid, onClick: onCreate }
        }
        toolbarSlot={
          <LibraryToolbar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search walls…"
            sort={sort}
            sortOptions={[
              { key: 'recent', label: 'Recently updated', defaultDir: 'desc' },
              { key: 'title', label: 'Title', defaultDir: 'asc' },
            ]}
            onSortChange={setSort}
          />
        }
      >
        <LibraryGrid
          items={sorted}
          getId={(entry) => entry.id}
          dragDisabled
          emptyState={
            entries.length === 0 ? (
              <ScaledEmptyState
                icon={LayoutGrid}
                title="No Walls Yet"
                subtitle="Create your first Activity Wall to get started."
                titleClassName="text-slate-500"
                subtitleClassName="text-slate-400"
                action={
                  !readOnly && (
                    <button
                      type="button"
                      onClick={onCreate}
                      className="inline-flex items-center justify-center rounded-xl bg-brand-blue-primary text-white font-bold shadow-sm hover:bg-brand-blue-dark transition-colors px-4 py-2 text-sm"
                    >
                      New wall
                    </button>
                  )
                }
              />
            ) : (
              <p className="p-6 text-center text-sm text-slate-500">
                No walls match your search.
              </p>
            )
          }
          renderCard={(entry) => (
            <LibraryItemCard
              id={entry.id}
              title={entry.title || 'Untitled wall'}
              subtitle={`${layoutLabel(entry)} · ${
                counts[entry.id] ?? 0
              } post${counts[entry.id] === 1 ? '' : 's'}`}
              thumbnail={<WallThumbnail entry={entry} />}
              sortable={false}
              badges={[
                {
                  label: entry.acceptingResponses === false ? 'Closed' : 'Open',
                  tone:
                    entry.acceptingResponses === false ? 'neutral' : 'success',
                },
                ...(entry.id === activeEntryId
                  ? ([{ label: 'On board', tone: 'info' }] as const)
                  : []),
              ]}
              primaryAction={{
                label: 'Open on board',
                icon: PlayCircle,
                onClick: () => onOpenOnBoard(entry.id),
                disabled: readOnly,
                disabledReason: 'This board is view-only.',
              }}
              secondaryActions={
                readOnly
                  ? []
                  : [
                      {
                        id: 'edit',
                        label: 'Edit',
                        icon: Pencil,
                        onClick: () => onEdit(entry),
                      },
                      {
                        id: 'duplicate',
                        label: 'Duplicate',
                        icon: Copy,
                        onClick: () => {
                          void onDuplicate(entry);
                        },
                      },
                      {
                        id: 'clear',
                        label: 'Clear posts',
                        icon: Eraser,
                        onClick: () => {
                          void handleClearPosts(entry);
                        },
                      },
                      {
                        id: 'delete',
                        label: 'Delete',
                        icon: Trash2,
                        destructive: true,
                        onClick: () => {
                          void handleDelete(entry);
                        },
                      },
                    ]
              }
            />
          )}
        />
      </LibraryShell>
    </Modal>
  );
};
