import React, { lazy, Suspense, useState } from 'react';
import { Check, Loader2, Pencil, Plus, Search } from 'lucide-react';
import { useAuth } from '@/context/useAuth';
import { loadBuildingSet, useGuidedLearning } from '@/hooks/useGuidedLearning';
import type {
  GuidedLearningBuildingSetIndex,
  GuidedLearningSet,
} from '@/types';
import { isHelpCenterSet } from '@/components/widgets/GuidedLearning/utils/helpCenterSets';

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
}

const matches = (title: string, search: string): boolean =>
  title.toLowerCase().includes(search.toLowerCase().trim());

const SetList: React.FC<{
  heading: string;
  empty: string;
  children: React.ReactNode;
  isEmpty: boolean;
}> = ({ heading, empty, children, isEmpty }) => (
  <section>
    <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
      {heading}
    </h4>
    <ul className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-48 overflow-y-auto">
      {isEmpty && <li className="px-3 py-2 text-sm text-slate-500">{empty}</li>}
      {children}
    </ul>
  </section>
);

export const GuidedLearningPicker: React.FC<GuidedLearningPickerProps> = ({
  selectedSetId,
  newTitle,
  onSelect,
  onError,
  onEditingChange,
}) => {
  const { user, canAccessFeature } = useAuth();
  const studioEditor = canAccessFeature('gl-studio');
  const { sets, buildingSets, buildingLoading, loadSetData, saveBuildingSet } =
    useGuidedLearning(user?.uid);
  const [search, setSearch] = useState('');
  const [copyingId, setCopyingId] = useState<string | null>(null);
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
      if (full) openEditor({ ...full, isBuilding: true });
      else onError('This activity was deleted. Pick another one.');
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
      const copy: GuidedLearningSet = {
        ...loaded,
        id: crypto.randomUUID(),
        isBuilding: true,
        helpCenter: true,
        authorUid: user?.uid,
        createdAt: now,
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

  const renderBuilding = (set: GuidedLearningBuildingSetIndex) => (
    <li key={set.id}>
      <button
        type="button"
        onClick={() => onSelect(set.id, set.title)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
      >
        <span className="truncate">{set.title || 'Untitled activity'}</span>
        {selectedSetId === set.id && (
          <Check
            className="w-4 h-4 text-green-600 shrink-0"
            aria-label="Selected"
          />
        )}
      </button>
    </li>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
        <p className="min-w-0 truncate text-sm text-slate-700">
          <span className="font-medium">Activity: </span>
          {selected
            ? selected.title || 'Untitled activity'
            : !selectedSetId
              ? 'None picked yet'
              : buildingLoading
                ? 'Loading...'
                : 'This activity was deleted. Pick another one.'}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {selected && (
            <button
              type="button"
              disabled={openingEditor}
              onClick={() => void handleEditSelected(selected.id)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50"
            >
              {openingEditor ? (
                <Loader2
                  className="w-3.5 h-3.5 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
              )}
              Edit activity
            </button>
          )}
          <button
            type="button"
            onClick={handleCreate}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-sm text-slate-700 hover:bg-slate-100"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            New activity
          </button>
        </div>
      </div>

      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search activities..."
          aria-label="Search activities"
          className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <SetList
          heading="Help Center"
          empty="No Help Center activities."
          isEmpty={helpCenter.length === 0}
        >
          {helpCenter.map(renderBuilding)}
        </SetList>
        <SetList
          heading="Building library"
          empty="No building activities."
          isEmpty={building.length === 0}
        >
          {building.map(renderBuilding)}
        </SetList>
        <SetList
          heading="My library"
          empty="No personal activities."
          isEmpty={personal.length === 0}
        >
          {personal.map((set) => (
            <li key={set.id}>
              <button
                type="button"
                disabled={copyingId !== null}
                onClick={() => handlePersonalPick(set.id, set.driveFileId)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <span className="truncate">{set.title}</span>
                {copyingId === set.id && (
                  <Loader2 className="w-4 h-4 animate-spin text-slate-400 shrink-0" />
                )}
              </button>
            </li>
          ))}
        </SetList>
      </div>
      <p className="text-xs text-slate-500">
        Picking one makes a separate Help Center copy.
      </p>

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
    </div>
  );
};
