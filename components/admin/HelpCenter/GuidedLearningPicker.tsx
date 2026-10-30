import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { tourAttr, tourFieldAttr } from '@/config/tourAnchors';
import {
  Check,
  Globe,
  GraduationCap,
  Loader2,
  Plus,
  Search,
} from 'lucide-react';
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
import { openAssignmentIdsForSet } from '@/utils/guidedLearningFileRelease';
import { watchWebTourDrafts } from '@/components/tours/webTours';

const GuidedLearningStudio = lazy(() =>
  import('@/components/widgets/GuidedLearning/components/studio/GuidedLearningStudio').then(
    (m) => ({ default: m.GuidedLearningStudio })
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
  const { user, isAdmin, canAccessFeature } = useAuth();
  const webToursOn = isAdmin === true && canAccessFeature('web-tours');
  const [webTours, setWebTours] = useState<GuidedLearningSet[] | null>(null);
  useEffect(
    () => (webToursOn ? watchWebTourDrafts(setWebTours) : undefined),
    [webToursOn]
  );
  const {
    sets,
    buildingSets,
    buildingLoading,
    loadSetData,
    saveBuildingSet,
    deleteSet,
  } = useGuidedLearning(user?.uid);
  const [search, setSearch] = useState('');
  const [copyingId, setCopyingId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLSpanElement>(null);
  const [openingEditor, setOpeningEditor] = useState(false);
  // Held once, so a snapshot after an autosave doesn't hand the editor a new set.
  const [editing, setEditing] = useState<GuidedLearningSet | null>(null);

  const selected = buildingSets.find((set) => set.id === selectedSetId);
  const selectedWeb = webToursOn
    ? webTours?.find((set) => set.id === selectedSetId)
    : undefined;
  const visible = buildingSets.filter((set) => matches(set.title, search));
  const helpCenter = visible.filter(isHelpCenterSet);
  const building = visible.filter((set) => !isHelpCenterSet(set));
  const personal = sets.filter((set) => matches(set.title, search));
  const web = webToursOn
    ? (webTours ?? []).filter((set) => matches(set.title, search))
    : [];

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
      else if (isLiveTourSet(full)) requestEditTour({ setId });
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

  // Personal sets live in Drive, which teachers can't read, so the set moves into a Help Center copy.
  const handlePersonalPick = async (
    setId: string,
    driveFileId: string,
    personalUpdatedAt: number
  ): Promise<void> => {
    if (!user?.uid) return;
    setCopyingId(setId);
    try {
      const copyId = helpCopyId(setId);
      // One copy per personal set: picking it again reuses that copy, keeping admin edits.
      let picked = await loadBuildingSet(copyId);
      // An original edited after its older copy was made keeps the newer work.
      let removeOriginal = !picked || personalUpdatedAt <= picked.createdAt;
      if (!picked) {
        const loaded = await loadSetData(driveFileId);
        // eslint-disable-next-line react-hooks/purity -- runs in an async select handler, not render
        const now = Date.now();
        picked = {
          ...loaded,
          id: copyId,
          isBuilding: true,
          helpCenter: true,
          authorUid: user.uid,
          createdAt: now,
          updatedAt: now,
        };
        await saveBuildingSet(picked);
      }
      onSelect(picked.id, picked.title);
      // Removed only after the copy is saved, and kept while students still work on it.
      if (removeOriginal) {
        const openIds = await openAssignmentIdsForSet(user.uid, setId);
        removeOriginal = openIds.length === 0;
      }
      if (removeOriginal) await deleteSet(setId, driveFileId);
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
    ...(webToursOn
      ? [
          {
            heading: 'Web tours',
            empty: 'No web tours.',
            rows: web.map((set) => ({
              id: set.id,
              title: set.title || 'Untitled web tour',
              onPick: () => pick(set.id, set.title),
            })),
          },
        ]
      : []),
    {
      heading: 'My library',
      empty: 'No personal activities.',
      note: 'Picking one moves it out of My library.',
      rows: personal.map((set) => ({
        id: set.id,
        title: set.title || 'Untitled activity',
        onPick: () => {
          setMenuOpen(false);
          setSearch('');
          void handlePersonalPick(set.id, set.driveFileId, set.updatedAt);
        },
      })),
    },
  ];

  const selectedLabel = selected
    ? selected.title || 'Untitled activity'
    : selectedWeb
      ? selectedWeb.title || 'Untitled web tour'
      : buildingLoading || (webToursOn && webTours === null)
        ? 'Loading...'
        : 'This activity was deleted. Pick another one.';

  return (
    <>
      {mode === 'chosen' && selectedSetId ? (
        <div className="flex min-h-10 w-full items-center gap-3 rounded-lg border border-slate-300 bg-white px-3 py-2">
          {selectedWeb ? (
            <Globe
              className="w-4 h-4 shrink-0 text-slate-500"
              aria-hidden="true"
            />
          ) : (
            <GraduationCap
              className="w-4 h-4 shrink-0 text-slate-500"
              aria-hidden="true"
            />
          )}
          <span
            className={`flex-1 wrap-break-word text-sm ${selected || selectedWeb ? 'text-slate-800' : 'text-slate-500'}`}
          >
            {selectedLabel}
          </span>
          {selected && (
            <button
              type="button"
              disabled={openingEditor}
              onClick={() => void handleEditSelected(selected.id)}
              {...tourAttr('admin.help-center.gl-open-editor')}
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
            {...tourAttr('admin.help-center.gl-change')}
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
              {...tourAttr('admin.help-center.gl-choose')}
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
            {...tourAttr('admin.help-center.gl-new')}
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
              {...tourAttr('admin.help-center.gl-search')}
              aria-label="Search activities"
              className="w-full h-9 pl-9 pr-3 rounded-lg border border-slate-300 text-sm focus:outline-hidden focus:border-brand-blue-primary focus:ring-[3px] focus:ring-brand-blue-primary/30"
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
                    {...tourFieldAttr(
                      'admin.help-center.gl-option',
                      'help',
                      row.id
                    )}
                    className={`flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50 focus:bg-slate-50 focus:outline-hidden ${row.id === selectedSetId ? 'font-semibold text-slate-900' : 'text-slate-700'}`}
                  >
                    <span className="flex-1 wrap-break-word">{row.title}</span>
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
          <GuidedLearningStudio
            key={editing.id}
            set={editing}
            meta={null}
            onClose={closeEditor}
            onSave={handleEditorSave}
          />
        </Suspense>
      )}
    </>
  );
};
