/**
 * LibraryDevHarness — DEV-only visual harness for the unified Library
 * primitives (LibraryShell / LibraryToolbar / LibraryGrid / LibraryItemCard /
 * AssignmentArchiveCard).
 *
 * The teacher-facing managers (Quiz / Video Activity / Guided Learning /
 * Mini App) are Firestore- and Drive-backed, which makes it slow to see the
 * shared primitives with realistic data while iterating on styling. This
 * harness renders the primitives with representative fake data at several
 * widget sizes, inside `container-type: size` wrappers that mirror the real
 * widget content area, so container-query scaling can be checked at a glance.
 *
 * Mounted at /library-dev in DEV builds only (same gating pattern as
 * NotebookEditorDevHarness) — excluded from production bundles.
 */

import React, { useState } from 'react';
import {
  BarChart2,
  Copy,
  FilePlus2,
  Pencil,
  Play,
  Share2,
  Trash2,
  Upload,
} from 'lucide-react';
import { LibraryShell } from '@/components/common/library/LibraryShell';
import { LibraryToolbar } from '@/components/common/library/LibraryToolbar';
import { LibraryGrid } from '@/components/common/library/LibraryGrid';
import { LibraryItemCard } from '@/components/common/library/LibraryItemCard';
import { AssignmentArchiveCard } from '@/components/common/library/AssignmentArchiveCard';
import { FolderSidebar } from '@/components/common/library/FolderSidebar';
import type {
  LibrarySortDir,
  LibraryTab,
  LibraryViewMode,
} from '@/components/common/library/types';
import type { LibraryFolder } from '@/types';

interface FakeQuiz {
  id: string;
  title: string;
  subtitle: string;
}

const FAKE_QUIZZES: FakeQuiz[] = [
  { id: 'q1', title: 'Fractions Review', subtitle: '12 questions' },
  {
    id: 'q2',
    title: 'Westward Expansion — Unit 4 Checkpoint with a Long Title',
    subtitle: '24 questions',
  },
  { id: 'q3', title: 'Vocabulary Week 12', subtitle: '8 questions' },
  { id: 'q4', title: 'Cell Structure', subtitle: '15 questions' },
  { id: 'q5', title: 'Exit Ticket 6/10', subtitle: '3 questions' },
];

interface FakeAssignment {
  id: string;
}

const FAKE_FOLDERS: LibraryFolder[] = [
  {
    id: 'f1',
    name: 'Unit 4 — Westward Expansion',
    parentId: null,
    order: 0,
    createdAt: 0,
  },
  { id: 'f2', name: 'Exit Tickets', parentId: null, order: 1, createdAt: 0 },
  { id: 'f3', name: 'Review Games', parentId: null, order: 2, createdAt: 0 },
  { id: 'f4', name: 'Archived Units', parentId: 'f3', order: 0, createdAt: 0 },
];

const noop = () => undefined;

const Panel: React.FC<{
  width: number;
  height: number;
  label: string;
}> = ({ width, height, label }) => {
  const [tab, setTab] = useState<LibraryTab>('library');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ key: string; dir: LibrarySortDir }>({
    key: 'updated',
    dir: 'desc',
  });
  const [viewMode, setViewMode] = useState<LibraryViewMode>('grid');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-2">
      <div className="text-xs font-bold uppercase tracking-widest text-slate-400">
        {label} ({width}×{height})
      </div>
      <div
        className="rounded-2xl bg-slate-100 shadow-xl overflow-hidden"
        style={{ width, height, containerType: 'size' }}
      >
        <LibraryShell
          widgetLabel="Quiz"
          tab={tab}
          onTabChange={setTab}
          counts={{ library: FAKE_QUIZZES.length, active: 3, archive: 2 }}
          primaryAction={{ label: 'New Quiz', icon: FilePlus2, onClick: noop }}
          secondaryActions={[{ label: 'Import', icon: Upload, onClick: noop }]}
          filterSidebarSlot={
            tab === 'library' ? (
              <FolderSidebar
                widget="quiz"
                folders={FAKE_FOLDERS}
                selectedFolderId={selectedFolderId}
                onSelectFolder={setSelectedFolderId}
                itemCounts={{ f1: 2, f2: 1, f3: 1, f4: 1 }}
              />
            ) : undefined
          }
          toolbarSlot={
            tab === 'library' ? (
              <LibraryToolbar
                search={search}
                onSearchChange={setSearch}
                searchPlaceholder="Search quizzes…"
                sort={sort}
                sortOptions={[
                  { key: 'updated', label: 'Last updated', defaultDir: 'desc' },
                  { key: 'title', label: 'Title' },
                ]}
                onSortChange={setSort}
                viewMode={viewMode}
                onViewModeChange={setViewMode}
              />
            ) : undefined
          }
        >
          {tab === 'library' && (
            <LibraryGrid<FakeQuiz>
              items={FAKE_QUIZZES}
              getId={(q) => q.id}
              renderCard={(q) => (
                <LibraryItemCard<FakeQuiz>
                  key={q.id}
                  id={q.id}
                  title={q.title}
                  subtitle={q.subtitle}
                  badges={
                    q.id === 'q2'
                      ? [{ label: 'Building', tone: 'warn' }]
                      : q.id === 'q4'
                        ? [{ label: 'Synced', tone: 'info', dot: true }]
                        : undefined
                  }
                  primaryAction={{ label: 'Assign', icon: Play, onClick: noop }}
                  secondaryActions={[
                    { id: 'edit', label: 'Edit', icon: Pencil, onClick: noop },
                    {
                      id: 'share',
                      label: 'Share',
                      icon: Share2,
                      onClick: noop,
                    },
                    {
                      id: 'delete',
                      label: 'Delete',
                      icon: Trash2,
                      destructive: true,
                      onClick: noop,
                    },
                  ]}
                  viewMode={viewMode}
                  sortable={false}
                  onClick={noop}
                />
              )}
              layout={viewMode}
            />
          )}
          {tab === 'active' && (
            <div className="flex flex-col">
              <AssignmentArchiveCard<FakeAssignment>
                assignment={{ id: 'a1' }}
                mode="active"
                status={{ label: 'Live', tone: 'success', dot: true }}
                title="Fractions Review"
                subtitle="Period 3 — Mathematics (Room 214)"
                meta={<span>18/24 submitted · Assigned Jun 9</span>}
                primaryAction={{
                  label: 'Monitor',
                  icon: BarChart2,
                  onClick: noop,
                  badgeCount: 3,
                }}
                secondaryActions={[
                  { id: 'copy', label: 'Copy link', icon: Copy, onClick: noop },
                  {
                    id: 'delete',
                    label: 'Delete',
                    icon: Trash2,
                    destructive: true,
                    onClick: noop,
                  },
                ]}
              />
              <AssignmentArchiveCard<FakeAssignment>
                assignment={{ id: 'a2' }}
                mode="active"
                status={{ label: 'Paused', tone: 'warn', dot: true }}
                title="Westward Expansion — Unit 4 Checkpoint with a Long Title"
                subtitle="Period 5 — American History"
                meta={<span>9/26 submitted · Assigned Jun 8</span>}
                primaryAction={{
                  label: 'Monitor',
                  icon: BarChart2,
                  onClick: noop,
                }}
                secondaryActions={[
                  { id: 'copy', label: 'Copy link', icon: Copy, onClick: noop },
                ]}
              />
              <AssignmentArchiveCard<FakeAssignment>
                assignment={{ id: 'a3' }}
                mode="active"
                status={{ label: 'Shared', tone: 'info' }}
                title="Vocabulary Week 12"
                subtitle="View-only share"
                meta={<span>41 views</span>}
                primaryAction={{
                  label: 'Copy link',
                  icon: Copy,
                  onClick: noop,
                }}
              />
            </div>
          )}
          {tab === 'archive' && (
            <div className="flex flex-col">
              <AssignmentArchiveCard<FakeAssignment>
                assignment={{ id: 'a4' }}
                mode="archive"
                status={{ label: 'Ended', tone: 'neutral' }}
                title="Cell Structure"
                subtitle="Period 1 — Biology"
                meta={<span>22/22 submitted · Ended Jun 2</span>}
                primaryAction={{
                  label: 'Results',
                  icon: BarChart2,
                  onClick: noop,
                }}
                secondaryActions={[
                  {
                    id: 'delete',
                    label: 'Delete',
                    icon: Trash2,
                    destructive: true,
                    onClick: noop,
                  },
                ]}
              />
              <AssignmentArchiveCard<FakeAssignment>
                assignment={{ id: 'a5' }}
                mode="archive"
                status={{ label: 'Closed', tone: 'neutral' }}
                title="Exit Ticket 5/28"
                subtitle="Period 3 — Mathematics"
                meta={<span>Ended May 30</span>}
                primaryAction={{
                  label: 'Results',
                  icon: BarChart2,
                  onClick: noop,
                }}
              />
            </div>
          )}
        </LibraryShell>
      </div>
    </div>
  );
};

export const LibraryDevHarness: React.FC = () => {
  return (
    <div className="min-h-screen w-full bg-slate-900 p-8 flex flex-wrap items-start gap-8 overflow-auto">
      <Panel width={520} height={440} label="Default widget" />
      <Panel width={900} height={560} label="Large widget" />
      <Panel width={340} height={420} label="Narrow widget" />
    </div>
  );
};
