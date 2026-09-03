import React, { useEffect, useId, useMemo, useState } from 'react';
import { Modal } from '@/components/common/Modal';
import { CollapsibleSection } from '@/components/common/library/CollapsibleSection';
import { useAuth } from '@/context/useAuth';
import { useDialog } from '@/context/useDialog';
import { useActivityWallLibrary } from '@/hooks/useActivityWallLibrary';
import { classLinkService } from '@/utils/classlinkService';
import {
  buildDefaultWall,
  normalizeActivityWallLibraryEntry,
} from '@/utils/activityWallNormalize';
import { resolveActivityWallBuildingDefaults } from '../buildingDefaults';
import type {
  ActivityWallLayout,
  ActivityWallLibraryEntry,
  ClassLinkClass,
} from '@/types';
import { LayoutPicker } from './LayoutPicker';
import { LAYOUT_OPTIONS } from './layoutOptions';
import { SectionsEditor } from './SectionsEditor';
import type { WallStructure } from './constants';
import { AppearancePicker } from './AppearancePicker';
import { SubmissionTypesToggles } from './SubmissionTypesToggles';
import { ModerationAndAccess } from './ModerationAndAccess';
import { LimitsAndEditing } from './LimitsAndEditing';

interface WallEditorModalProps {
  open: boolean;
  entry: ActivityWallLibraryEntry | null;
  onClose: () => void;
  onSaved: (entry: ActivityWallLibraryEntry) => void;
}

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary';

const CHANGE_LAYOUT_WARNING =
  'Changing the layout keeps every existing post and the fields it was submitted with. Posts may land in a default spot until you move them.';

/** Deprecated legacy fields are still written so the deployed client keeps working. */
const legacyFieldsFor = (
  draft: ActivityWallLibraryEntry
): Pick<ActivityWallLibraryEntry, 'mode' | 'identificationMode'> => ({
  mode: draft.layout === 'wordcloud' ? 'text' : 'photo',
  identificationMode: draft.showNames ? 'name' : 'anonymous',
});

const layoutLabel = (layout: ActivityWallLayout): string =>
  LAYOUT_OPTIONS.find((option) => option.layout === layout)?.label ?? layout;

/** Two-step wall editor: layout card grid, then one scrollable grouped form. */
export const WallEditorModal: React.FC<WallEditorModalProps> = ({
  open,
  entry,
  onClose,
  onSaved,
}) => {
  const { user, featurePermissions, selectedBuildings } = useAuth();
  const { saveActivity } = useActivityWallLibrary(user?.uid);
  const titleId = useId();
  const promptId = useId();

  const buildingDefaults = useMemo(
    () =>
      resolveActivityWallBuildingDefaults(
        featurePermissions,
        selectedBuildings
      ),
    [featurePermissions, selectedBuildings]
  );

  const makeDraft = (): ActivityWallLibraryEntry => {
    if (entry) {
      const normalized = normalizeActivityWallLibraryEntry(entry.id, entry);
      // Legacy walls only stored a single classId; seed classIds so saving doesn't strip the class gate.
      if (!normalized.classIds?.length && normalized.classId) {
        normalized.classIds = [normalized.classId];
      }
      return normalized;
    }
    const blank = buildDefaultWall(buildingDefaults);
    return {
      ...blank,
      layout: buildingDefaults.layout ?? blank.layout,
      allowGuests: buildingDefaults.allowGuests ?? blank.allowGuests,
      showNames: buildingDefaults.showNames ?? blank.showNames,
      maxPostsPerStudent:
        buildingDefaults.maxPostsPerStudent ?? blank.maxPostsPerStudent,
    };
  };

  const sessionKey = `${open ? 'open' : 'closed'}:${entry?.id ?? 'new'}`;
  const [prevKey, setPrevKey] = useState(sessionKey);
  const [draft, setDraft] = useState<ActivityWallLibraryEntry>(makeDraft);
  const [step, setStep] = useState<1 | 2>(entry ? 2 : 1);
  const [showLayoutWarning, setShowLayoutWarning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [baseline, setBaseline] = useState(() => JSON.stringify(draft));
  const { showConfirm } = useDialog();
  const isDirty = JSON.stringify(draft) !== baseline;
  const requestClose = () => {
    if (!isDirty || saving) {
      onClose();
      return;
    }
    void showConfirm('Discard your unsaved changes to this wall?', {
      title: 'Discard changes',
      variant: 'warning',
      confirmLabel: 'Discard',
      cancelLabel: 'Keep editing',
    }).then((ok) => {
      if (ok) onClose();
    });
  };

  if (prevKey !== sessionKey) {
    setPrevKey(sessionKey);
    const fresh = makeDraft();
    setDraft(fresh);
    setBaseline(JSON.stringify(fresh));
    setStep(entry ? 2 : 1);
    setShowLayoutWarning(false);
    setError(null);
    setSaving(false);
  }

  const [classes, setClasses] = useState<ClassLinkClass[]>([]);
  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    void (async () => {
      try {
        const data = await classLinkService.getRosters();
        if (!cancelled) setClasses(data.classes);
      } catch (err) {
        if (import.meta.env.DEV) {
          console.warn('[WallEditorModal] ClassLink fetch failed:', err);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  const patch = (updates: Partial<ActivityWallLibraryEntry>) =>
    setDraft((prev) => ({ ...prev, ...updates }));

  const layout = draft.layout ?? 'wall';
  const isWordCloud = layout === 'wordcloud';

  /** Seeds placeholder columns/rows so a brand-new wall isn't saved empty. */
  const seedForLayout = (
    next: ActivityWallLayout,
    current: ActivityWallLibraryEntry
  ): Partial<ActivityWallLibraryEntry> => {
    if (entry) return {};
    if (next === 'columns' && !current.sections?.length) {
      return {
        sections: [
          { id: crypto.randomUUID(), label: 'Column 1' },
          { id: crypto.randomUUID(), label: 'Column 2' },
        ],
      };
    }
    if (
      next === 'table' &&
      !current.tableRows?.length &&
      !current.tableCols?.length
    ) {
      return {
        tableRows: [
          { id: crypto.randomUUID(), label: 'Row 1' },
          { id: crypto.randomUUID(), label: 'Row 2' },
        ],
        tableCols: [
          { id: crypto.randomUUID(), label: 'Column 1' },
          { id: crypto.randomUUID(), label: 'Column 2' },
        ],
      };
    }
    return {};
  };

  const chooseLayout = (next: ActivityWallLayout) => {
    patch({ layout: next, ...seedForLayout(next, draft) });
    setStep(2);
    setShowLayoutWarning(false);
  };

  const handleSave = async () => {
    const title = draft.title.trim();
    if (!title) {
      setError('Give the wall a title.');
      return;
    }
    const prompt = draft.prompt.trim();
    if (!prompt) {
      setError('Add a prompt for students.');
      return;
    }
    const trimSections = (items: { id: string; label: string }[] | undefined) =>
      (items ?? [])
        .map((item) => ({ ...item, label: item.label.trim() }))
        .filter((item) => item.label.length > 0);

    const trimmedSections = trimSections(draft.sections);
    const trimmedRows = trimSections(draft.tableRows);
    const trimmedCols = trimSections(draft.tableCols);

    if (draft.layout === 'columns' && trimmedSections.length === 0) {
      setError('Add at least one column before saving.');
      return;
    }
    if (
      draft.layout === 'table' &&
      (trimmedRows.length === 0 || trimmedCols.length === 0)
    ) {
      setError('Add at least one row and one column before saving.');
      return;
    }

    const now = Date.now();
    const next: ActivityWallLibraryEntry = {
      ...draft,
      ...legacyFieldsFor(draft),
      title,
      prompt,
      sections: trimmedSections,
      tableRows: trimmedRows,
      tableCols: trimmedCols,
      createdAt: draft.createdAt || now,
      updatedAt: now,
    };
    // Firestore rejects `undefined`; mirror classIds[0] onto the deprecated
    // single-class field only when a class is targeted.
    const primaryClassId = next.classIds?.[0];
    if (primaryClassId) next.classId = primaryClassId;
    else delete next.classId;

    setSaving(true);
    setError(null);
    try {
      await saveActivity(next);
      onSaved(next);
      onClose();
    } catch (err) {
      console.error('[WallEditorModal] save failed:', err);
      setError('Could not save this wall. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const structure: WallStructure = {
    sections: draft.sections,
    tableRows: draft.tableRows,
    tableCols: draft.tableCols,
    mapCenter: draft.mapCenter,
  };

  return (
    <Modal
      isOpen
      onClose={requestClose}
      title={entry ? 'Edit wall' : 'New wall'}
      maxWidth="max-w-2xl"
      contentClassName="px-6 [scrollbar-gutter:stable]"
      footer={
        step === 2 ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-red-600" role="alert">
              {error ?? ''}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={requestClose}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleSave()}
                className="rounded-xl bg-brand-blue-primary px-4 py-2 text-sm font-bold text-white transition hover:bg-brand-blue-dark disabled:opacity-60"
              >
                {saving ? 'Saving…' : 'Save wall'}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={requestClose}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        )
      }
    >
      {showLayoutWarning && (
        <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {CHANGE_LAYOUT_WARNING}
        </p>
      )}
      {step === 1 ? (
        <div className="pb-2">
          <LayoutPicker value={draft.layout ?? null} onSelect={chooseLayout} />
        </div>
      ) : (
        <div className="space-y-4 pb-2">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <span className="text-sm font-semibold text-slate-700">
              {`Layout: ${layoutLabel(layout)}`}
            </span>
            <button
              type="button"
              onClick={() => {
                if (entry) setShowLayoutWarning(true);
                setStep(1);
              }}
              className="text-sm font-semibold text-brand-blue-primary hover:underline"
            >
              Change layout
            </button>
          </div>

          <div>
            <label
              className="mb-1 block text-sm font-bold text-slate-700"
              htmlFor={titleId}
            >
              Title
            </label>
            <input
              id={titleId}
              className={inputClass}
              value={draft.title}
              onChange={(event) => patch({ title: event.target.value })}
            />
          </div>

          <div>
            <label
              className="mb-1 block text-sm font-bold text-slate-700"
              htmlFor={promptId}
            >
              Prompt
            </label>
            <textarea
              id={promptId}
              rows={3}
              className={inputClass}
              value={draft.prompt}
              onChange={(event) => patch({ prompt: event.target.value })}
            />
          </div>

          <SectionsEditor
            layout={layout}
            value={structure}
            onChange={(next) => patch(next)}
          />

          {!isWordCloud && (
            <CollapsibleSection label="Submission types" defaultOpen>
              <SubmissionTypesToggles
                value={
                  draft.allowedTypes ?? {
                    photo: false,
                    link: false,
                    file: false,
                    video: false,
                  }
                }
                onChange={(allowedTypes) => patch({ allowedTypes })}
              />
            </CollapsibleSection>
          )}

          <CollapsibleSection label="Appearance">
            <AppearancePicker
              value={
                draft.appearance ?? {
                  kind: 'gradient',
                  value: 'bg-gradient-to-br from-slate-900 to-slate-700',
                }
              }
              onChange={(appearance) => patch({ appearance })}
            />
          </CollapsibleSection>

          <CollapsibleSection label="Moderation & access">
            <ModerationAndAccess
              moderationEnabled={draft.moderationEnabled}
              allowGuests={draft.allowGuests ?? false}
              showNames={draft.showNames ?? false}
              classIds={draft.classIds ?? []}
              classes={classes}
              onChange={(next) => patch(next)}
            />
          </CollapsibleSection>

          <CollapsibleSection label="Limits & editing">
            <LimitsAndEditing
              maxPostsPerStudent={draft.maxPostsPerStudent ?? 0}
              allowStudentEdit={draft.allowStudentEdit ?? false}
              allowStudentDelete={draft.allowStudentDelete ?? false}
              onChange={(next) => patch(next)}
            />
          </CollapsibleSection>
        </div>
      )}
    </Modal>
  );
};
