import React, {
  Suspense,
  lazy,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Send, X } from 'lucide-react';
import { Z_INDEX } from '@/config/zIndex';
import type { ActivityWallSession, ActivityWallSubmission } from '@/types';
import type { WallPlacement } from '@/components/activityWall/render';
import { SubmissionTypePicker } from './SubmissionTypePicker';
import { StructureFields, type StructureValue } from './StructureFields';
import { FileField, LinkField, TextField, WordField } from './ContentFields';
import { isUploadType } from './uploadLimits';
import type { MapPin } from './MapPinPicker';
import {
  EMPTY_DRAFT,
  availableTypes,
  draftFromPost,
  draftValid,
  effectiveType,
  placementFromPost,
  type PostDraft,
} from './submitPost';

const MapPinPicker = lazy(() => import('./MapPinPicker'));

const DEFAULT_MAP_CENTER = { lat: 39.5, lng: -98.35, zoom: 4 };

type UploadType = 'photo' | 'video' | 'file';

export interface ComposerSheetProps {
  session: ActivityWallSession;
  /** Prefilled by a hover-plus spot; prefilled fields hide their picker. */
  placement?: WallPlacement;
  /** Post being edited; hides the type picker and file field. */
  editing?: ActivityWallSubmission;
  onSubmit: (draft: PostDraft, placement: WallPlacement) => void;
  onClose: () => void;
  busy: boolean;
  progress: number | null;
  error: string | null;
}

const EMPTY_PLACEMENT: WallPlacement = {};

const structureFromPlacement = (
  session: ActivityWallSession,
  placement: WallPlacement,
  label: string
): StructureValue => {
  const [rowId, colId] = placement.cellKey?.split('|') ?? [];
  return {
    sectionId: placement.sectionId ?? session.sections?.[0]?.id ?? '',
    rowId: rowId ?? session.tableRows?.[0]?.id ?? '',
    colId: colId ?? session.tableCols?.[0]?.id ?? '',
    label,
  };
};

/** Bottom-sheet composer over the wall; builds the post draft and resolves placement from prefill or the structure pickers. */
export const ComposerSheet: React.FC<ComposerSheetProps> = ({
  session,
  placement: prefill = EMPTY_PLACEMENT,
  editing,
  onSubmit,
  onClose,
  busy,
  progress,
  error,
}) => {
  const seedPlacement = editing ? placementFromPost(editing) : prefill;
  const [draft, setDraft] = useState<PostDraft>(() =>
    editing ? draftFromPost(editing) : EMPTY_DRAFT
  );
  const [structure, setStructure] = useState<StructureValue>(() =>
    structureFromPlacement(session, seedPlacement, draft.label)
  );
  const [pin, setPin] = useState<MapPin | null>(() =>
    typeof seedPlacement.lat === 'number' &&
    typeof seedPlacement.lng === 'number'
      ? { lat: seedPlacement.lat, lng: seedPlacement.lng }
      : null
  );
  const panelRef = useRef<HTMLDivElement>(null);

  const isWordCloud = session.layout === 'wordcloud';
  const type = effectiveType(session, draft.type);
  const types = availableTypes(session);
  const isEditing = editing !== undefined;

  // Only a hover-plus prefill hides its picker; an edit keeps them so the post can move.
  const sectionPrefilled = !isEditing && !!prefill.sectionId;
  const cellPrefilled = !isEditing && !!prefill.cellKey;
  const pinPrefilled =
    typeof seedPlacement.lat === 'number' &&
    typeof seedPlacement.lng === 'number';
  const hideStructure =
    isWordCloud ||
    (session.layout === 'columns' && sectionPrefilled) ||
    (session.layout === 'table' && cellPrefilled);
  const showMapPicker = session.layout === 'map' && !pinPrefilled;

  const previewUrl = useMemo(
    () => (draft.file ? URL.createObjectURL(draft.file) : null),
    [draft.file]
  );
  // Object URLs are an external browser resource; revoke the previous one on change.
  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  // Escape closes; focus lands on the sheet so keyboard users start inside it.
  useEffect(() => {
    panelRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const patchDraft = (patch: Partial<PostDraft>) =>
    setDraft((prev) => ({ ...prev, ...patch }));

  const resolvedPlacement = (): WallPlacement => {
    const next: WallPlacement = {};
    if (session.layout === 'columns' && structure.sectionId)
      next.sectionId = structure.sectionId;
    if (session.layout === 'table' && structure.rowId && structure.colId)
      next.cellKey = `${structure.rowId}|${structure.colId}`;
    if (
      session.layout === 'timeline' &&
      typeof seedPlacement.order === 'number'
    )
      next.order = seedPlacement.order;
    if (session.layout === 'map' && pin) {
      next.lat = pin.lat;
      next.lng = pin.lng;
    }
    return next;
  };

  const valid = draftValid(session, draft, isEditing);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || !valid) return;
    onSubmit({ ...draft, label: structure.label }, resolvedPlacement());
  };

  const heading = isEditing
    ? 'Edit your post'
    : isWordCloud
      ? 'Add a word'
      : 'Add a post';

  return createPortal(
    <div
      className="fixed inset-0 flex items-end justify-center sm:items-center"
      style={{ zIndex: Z_INDEX.dialog }}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/60"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="aw-composer-title"
        tabIndex={-1}
        className="relative flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl outline-none sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2
            id="aw-composer-title"
            className="text-lg font-black text-slate-900"
          >
            {heading}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close composer"
            className="rounded-full p-1.5 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <form
          className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5"
          onSubmit={submit}
        >
          {!isWordCloud && !isEditing && (
            <SubmissionTypePicker
              available={types}
              value={draft.type}
              onChange={(next) => patchDraft({ type: next, file: null })}
            />
          )}

          {isWordCloud ? (
            <WordField
              value={draft.word}
              onChange={(word) => patchDraft({ word })}
            />
          ) : type === 'link' ? (
            <LinkField
              url={draft.url}
              title={draft.title}
              onUrlChange={(url) => patchDraft({ url })}
              onTitleChange={(title) => patchDraft({ title })}
            />
          ) : isUploadType(type) ? (
            <>
              {isEditing ? (
                <p className="text-sm text-slate-600">
                  You can change the title of an uploaded post.
                </p>
              ) : (
                <FileField
                  type={type as UploadType}
                  file={draft.file}
                  previewUrl={previewUrl}
                  onSelect={(file) => patchDraft({ file })}
                />
              )}
              <TextField
                title={draft.title}
                body=""
                hideBody
                onTitleChange={(title) => patchDraft({ title })}
                onBodyChange={() => undefined}
              />
            </>
          ) : (
            <TextField
              title={draft.title}
              body={draft.body}
              onTitleChange={(title) => patchDraft({ title })}
              onBodyChange={(body) => patchDraft({ body })}
            />
          )}

          {!hideStructure && (
            <StructureFields
              session={session}
              value={structure}
              onChange={(patch) =>
                setStructure((prev) => ({ ...prev, ...patch }))
              }
            />
          )}

          {showMapPicker && (
            <Suspense
              fallback={
                <div className="h-64 animate-pulse rounded-xl bg-slate-200" />
              }
            >
              <MapPinPicker
                center={session.mapCenter ?? DEFAULT_MAP_CENTER}
                pin={pin}
                onPick={setPin}
              />
            </Suspense>
          )}

          {progress !== null && (
            <div
              className="h-2 w-full overflow-hidden rounded-full bg-slate-200"
              role="progressbar"
              aria-label="Upload progress"
              aria-valuenow={progress}
            >
              <div
                className="h-full bg-brand-blue-primary transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}

          {error && <p className="text-sm font-medium text-red-700">{error}</p>}

          <button
            type="submit"
            disabled={busy || !valid}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2 font-bold text-white transition hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2 disabled:opacity-60"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="h-4 w-4" aria-hidden="true" />
            )}
            {isEditing ? 'Save changes' : 'Post'}
          </button>
        </form>
      </div>
    </div>,
    document.body
  );
};
