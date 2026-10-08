import React, { lazy, Suspense, useRef, useState } from 'react';
import { Check, GraduationCap, Loader2, Plus, Search } from 'lucide-react';
import {
  Btn,
  CellPopover,
} from '@/components/admin/Organization/components/primitives';
import { useAuth } from '@/context/useAuth';
import { loadBuildingSet, useGuidedLearning } from '@/hooks/useGuidedLearning';
import type { GuidedLearningSet } from '@/types';
import { isHelpCenterSet } from '@/components/widgets/GuidedLearning/utils/helpCenterSets';
import { isLiveTourSet } from '@/components/widgets/GuidedLearning/utils/liveTour';
import { requestEditTour } from '@/components/tours/editor/tourEditStore';

const GuidedLearningStudio = lazy(() =>
  import('@/components/widgets/GuidedLearning/components/studio/GuidedLearningStudio').then(
    (m) => ({ default: m.GuidedLearningStudio })
  )
);

const GuidedLearningEditorModal = lazy(() =>
  import('@/components/widgets/GuidedLearning/components/GuidedLearningEditorModal').then(
    (m) => ({ default: m.GuidedLearningEditorModal })
  )
);

interface GuidedLearningPickerProps {
  selectedSetId: string | null;
  /** Title for a new activity, taken from the help item. */
  newTitle: string;
  onSelect: (setId: string, title: string) => void;
  onError: (message: string) => void;
  /** The editor is open; the form must not close underneath it. */
  onEditingChange: (editing: boolean) => void;
  /** 'choose' renders the Choose and New buttons; 'chosen' the picked activity. */
  mode: 'choose' | 'chosen' | 'hidden';
  onChange: () => void;
}

const helpCopyId = (personalSetId: string): string => `help-${personalSetId}`;

const matches = (title: string, search: string): boolean =>
  title.toLowerCase().includes(search.toLowerCase().trim());

export const GuidedLearningPicker: React.FC<GuidedLearningPickerProps> = ({
  selectedSetId,
  newTitle,
  onSelect,
  onError,
  onEditingChange,
  mode,
  onChange,
}) => {
  const { user, canAccessFeature } = useAuth();
  const studioEditor = canAccessFeature('gl-studio');
  const liveTours = canAccessFeature('gl-live-tours');
  const { sets, buildingSets, buildingLoading, loadSetData, saveBuildingSet } =
    useGuidedLearning(user?.uid);
  const [search, setSearch] = useState('');
  const [copyingId, setCopyingId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLSpanElement>(null);
  const [openingEditor, setOpeningEditor] = useState(false);
  // Held once, so a snapshot after an autosave doesn't hand the editor a new set.
  const [editing, setEditing] = useState<GuidedLearningSet | null>(null);

  const selected = buildingSets.find((set) => set.id === selectedSetId);
  const visible = buildingSets.filter((set) => matches(set.title, search));
  const helpCenter = visible.filter(isHelpCenterSet);
  const building = visible.filter((set) => !isHelpCenterSet(set));
  const personal = sets.filter((set) => matches(set.title, search));

  const openEditor = (set: GuidedLearningSet) => {
    setEditing(set);
    onEditingChange(true);
  };

  // The picker lists index entries; the full set is fetched only to edit it.
  const handleEditSelected = async (setId: string): Promise<void> => {
    setOpeningEditor(true);
    try {
      const full = await loadBuildingSet(setId);
      if (!full) onError('This activity was deleted. Pick another one.');
      // Tours are edited on the board; Admin Settings closes to show it.
      else if (isLiveTourSet(full) && liveTours) requestEditTour({ setId });
      else openEditor({ ...full, isBuilding: true });
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setOpeningEditor(false);
    }
  };

  const closeEditor = () => {
    setEditing(null);
    onEditingChange(false);
  };

  const handleCreate = () => {
    const now = Date.now();
    openEditor({
      id: crypto.randomUUID(),
      title: newTitle.trim(),
      imageUrls: [],
      steps: [],
      mode: 'structured',
      createdAt: now,
      updatedAt: now,
      authorUid: user?.uid,
      isBuilding: true,
      helpCenter: true,
    });
  };

  // A new activity is picked on its first save, so closing an empty one leaves nothing behind.
  const handleEditorSave = async (set: GuidedLearningSet): Promise<void> => {
    await saveBuildingSet(set);
    if (set.id !== selectedSetId) onSelect(set.id, set.title);
  };

  // Personal sets live in Drive, which teachers can't read, so the Help Center keeps its own copy.
  const handlePersonalPick = async (
    setId: string,
    driveFileId: string
  ): Promise<void> => {
    setCopyingId(setId);
    try {
      const loaded = await loadSetData(driveFileId);
      const now = Date.now();
      // One copy per personal set: picking it again refreshes that copy.
      const copyId = helpCopyId(setId);
      const existing = buildingSets.find((set) => set.id === copyId);
      const copy: GuidedLearningSet = {
        ...loaded,
        id: copyId,
        isBuilding: true,
        helpCenter: true,
        authorUid: user?.uid,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      await saveBuildingSet(copy);
      onSelect(copy.id, copy.title);
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setCopyingId(null);
    }
  };

  const pick = (setId: string, title: string) => {
    setMenuOpen(false);
    setSearch('');
    onSelect(setId, title);
  };

  const groups: {
    heading: string;
    empty: string;
    note?: string;
    rows: { id: string; title: string; onPick: () => void }[];
  }[] = [
    {
      heading: 'Help Center',
      empty: 'No Help Center activities.',
      rows: helpCenter.map((set) => ({
        id: set.id,
        title: set.title || 'Untitled activity',
        onPick: () => pick(set.id, set.title),
      })),
    },
    {
      heading: 'Building library',
      empty: 'No building activities.',
      rows: building.map((set) => ({
        id: set.id,
        title: set.title || 'Untitled activity',
        onPick: () => pick(set.id, set.title),
      })),
    },
    {
      heading: 'My library',
      empty: 'No personal activities.',
      note: 'Picking one makes a separate Help Center copy.',
      rows: personal.map((set) => ({
        id: set.id,
        title: set.title || 'Untitled activity',
        onPick: () => {
          setMenuOpen(false);
          setSearch('');
          void handlePersonalPick(set.id, set.driveFileId);
        },
      })),
    },
  ];

  const selectedLabel = selected
    ? selected.title || 'Untitled activity'
    : buildingLoading
      ? 'Loading...'
      : 'This activity was deleted. Pick another one.';

  return (
    <>
      {mode === 'chosen' && selectedSetId ? (
        <div className="flex min-h-10 w-full items-center gap-3 rounded-lg border border-slate-300 bg-white px-3 py-2">
          <GraduationCap
            className="w-4 h-4 shrink-0 text-slate-500"
            aria-hidden="true"
          />
          <span
            className={`flex-1 break-words text-sm ${selected ? 'text-slate-800' : 'text-slate-500'}`}
          >
            {selectedLabel}
          </span>
          {selected && (
            <button
              type="button"
              disabled={openingEditor}
              onClick={() => void handleEditSelected(selected.id)}
              className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-brand-blue-primary hover:underline disabled:opacity-50"
            >
              {openingEditor && (
                <Loader2
                  className="w-3.5 h-3.5 animate-spin"
                  aria-hidden="true"
                />
              )}
              Open editor
            </button>
          )}
          <button
            type="button"
            onClick={onChange}
            className="shrink-0 text-sm font-semibold text-slate-600 hover:underline"
          >
            Change
          </button>
        </div>
      ) : mode === 'choose' ? (
        <>
          <span ref={menuButtonRef} className="inline-flex">
            <Btn
              size="lg"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              disabled={copyingId !== null}
              onClick={() => setMenuOpen((open) => !open)}
              icon={
                copyingId !== null ? (
                  <Loader2
                    className="w-4 h-4 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <GraduationCap className="w-4 h-4" aria-hidden="true" />
                )
              }
            >
              Choose activity
            </Btn>
          </span>
          <Btn
            size="lg"
            onClick={handleCreate}
            icon={<Plus className="w-4 h-4" aria-hidden="true" />}
          >
            New activity
          </Btn>
        </>
      ) : null}

      <CellPopover
        open={menuOpen}
        onClose={() => {
          setMenuOpen(false);
          setSearch('');
        }}
        anchorRef={menuButtonRef}
        className="w-[min(36rem,calc(100vw-2rem))] max-h-[min(28rem,70vh)] overflow-y-auto"
      >
        <div role="menu" aria-label="Choose activity">
          <div className="relative p-1">
            <Search
              className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2"
              aria-hidden="true"
            />
            <input
              autoFocus
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search activities..."
              aria-label="Search activities"
              className="w-full h-9 pl-9 pr-3 rounded-lg border border-slate-300 text-sm focus:outline-none focus:border-brand-blue-primary focus:ring-[3px] focus:ring-brand-blue-primary/30"
            />
          </div>
          {groups.map((group) => (
            <section
              key={group.heading}
              aria-label={group.heading}
              className="border-t border-slate-100 first-of-type:border-t-0 py-1"
            >
              <h4 className="px-3 pt-2 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {group.heading}
              </h4>
              {group.note && group.rows.length > 0 && (
                <p className="px-3 pb-1 text-xs text-slate-500">{group.note}</p>
              )}
              {group.rows.length === 0 ? (
                <p className="px-3 py-1.5 text-sm text-slate-400">
                  {group.empty}
                </p>
              ) : (
                group.rows.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={row.id === selectedSetId}
                    onClick={row.onPick}
                    className={`flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50 focus:bg-slate-50 focus:outline-none ${row.id === selectedSetId ? 'font-semibold text-slate-900' : 'text-slate-700'}`}
                  >
                    <span className="flex-1 break-words">{row.title}</span>
                    {row.id === selectedSetId && (
                      <Check
                        className="w-4 h-4 mt-0.5 text-brand-blue-primary shrink-0"
                        aria-hidden="true"
                      />
                    )}
                  </button>
                ))
              )}
            </section>
          ))}
        </div>
      </CellPopover>

      {editing && (
        <Suspense fallback={null}>
          {studioEditor ? (
            <GuidedLearningStudio
              key={editing.id}
              set={editing}
              meta={null}
              onClose={closeEditor}
              onSave={handleEditorSave}
            />
          ) : (
            <GuidedLearningEditorModal
              isOpen
              set={editing}
              meta={null}
              onClose={closeEditor}
              onSave={handleEditorSave}
            />
          )}
        </Suspense>
      )}
    </>
  );
};
