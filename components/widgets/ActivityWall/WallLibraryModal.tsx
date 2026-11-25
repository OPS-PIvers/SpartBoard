// Wall library — browse, open, edit, duplicate, clear, and delete walls.

import React, { useState } from 'react';
import { LayoutGrid } from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import { LibraryShell } from '@/components/common/library/LibraryShell';
import { LibraryToolbar } from '@/components/common/library/LibraryToolbar';
import { LibraryGrid } from '@/components/common/library/LibraryGrid';
import { LibraryItemCard } from '@/components/common/library/LibraryItemCard';
import type {
  LibraryBadge,
  LibrarySortDir,
} from '@/components/common/library/types';
import type { ActivityWallLibraryEntry } from '@/types';
import { tourTypeAttr } from '@/config/tourAnchors';
import { LIBRARY_HEADER_ACCENTS } from '@/components/common/library/libraryAccents';
import { WallThumbnail } from './WallThumbnail';
import {
  useWallLibraryActions,
  wallBadges,
  wallMenuActions,
  wallOpenAction,
  wallSubtitle,
} from './wallLibraryShared';

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
  /** Extra status chips, e.g. the Claude review mark. */
  badgesFor?: (entry: ActivityWallLibraryEntry) => LibraryBadge[];
  onDuplicate: (entry: ActivityWallLibraryEntry) => Promise<void>;
  onDelete: (entryId: string) => Promise<void>;
  onClearPosts: (entryId: string) => Promise<void>;
  addToast: (message: string, tone: 'success' | 'error' | 'info') => void;
  confirm: (message: string) => Promise<boolean>;
}

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
  badgesFor,
  onDuplicate,
  onDelete,
  onClearPosts,
  addToast,
  confirm,
}) => {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ key: string; dir: LibrarySortDir }>({
    key: 'recent',
    dir: 'desc',
  });
  const { counts, clearPosts, wallDelete } = useWallLibraryActions({
    active: open,
    uid,
    entries,
    onDelete,
    onClearPosts,
    addToast,
    confirm,
  });

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
      accent={LIBRARY_HEADER_ACCENTS['activity-wall']}
      isOpen
      onClose={onClose}
      title="Activity Walls"
      maxWidth="max-w-4xl"
      contentClassName="px-0 pb-0 flex flex-col"
    >
      <LibraryShell
        widgetLabel="Activity Wall"
        widgetType="activity-wall"
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
            widgetType="activity-wall"
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
                      {...tourTypeAttr(
                        'activity-wall-library.empty-new',
                        'activity-wall'
                      )}
                      className="inline-flex items-center justify-center rounded-xl bg-brand-blue-primary text-white font-bold shadow-xs hover:bg-brand-blue-dark transition-colors px-4 py-2 text-sm"
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
          renderCard={(entry, index) => (
            <LibraryItemCard
              key={entry.id}
              id={entry.id}
              title={entry.title || 'Untitled wall'}
              tourIndex={index}
              tourWidgetType="activity-wall"
              subtitle={wallSubtitle(entry, counts[entry.id])}
              thumbnail={<WallThumbnail entry={entry} />}
              sortable={false}
              badges={wallBadges(entry, activeEntryId, badgesFor?.(entry))}
              primaryAction={wallOpenAction(
                () => onOpenOnBoard(entry.id),
                readOnly
              )}
              secondaryActions={
                readOnly
                  ? []
                  : wallMenuActions({
                      onEdit: () => onEdit(entry),
                      onDuplicate: () => void onDuplicate(entry),
                      onClearPosts: () => void clearPosts(entry),
                      onDelete: () => void wallDelete.deleteOne(entry),
                    })
              }
            />
          )}
        />
      </LibraryShell>
    </Modal>
  );
};
