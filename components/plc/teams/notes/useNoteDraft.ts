// One note's edit state: CRDT when real-time editing is on, else a debounced, version-checked draft like NotesBody.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PlcActionItem, PlcNote, PlcNoteBlock } from '@/types';
import { useDashboard } from '@/context/useDashboard';
import {
  PlcNoteVersionConflictError,
  type UpdateNotePatch,
  type UpdateNoteOptions,
} from '@/hooks/usePlcNotes';
import { usePlcNoteCrdt } from '@/hooks/usePlcNoteCrdt';
import { mutateNoteBlocks } from '@/utils/plcNoteWrites';
import { logError } from '@/utils/logError';

const SAVE_DEBOUNCE_MS = 500;

interface Draft {
  title: string;
  body: string;
  actionItems: PlcActionItem[];
  blocks: PlcNoteBlock[];
}

type Patch = Pick<
  UpdateNotePatch,
  'title' | 'body' | 'actionItems' | 'blocks' | 'kind'
>;

const draftOf = (note: PlcNote): Draft => ({
  title: note.title,
  body: note.body,
  actionItems: note.actionItems ?? [],
  blocks: note.blocks ?? [],
});

const sameDraft = (a: Draft, b: Draft): boolean =>
  a.title === b.title &&
  a.body === b.body &&
  JSON.stringify(a.actionItems) === JSON.stringify(b.actionItems) &&
  JSON.stringify(a.blocks) === JSON.stringify(b.blocks);

export interface NoteDraft {
  ready: boolean;
  title: string;
  body: string;
  actionItems: PlcActionItem[];
  blocks: PlcNoteBlock[];
  setTitle: (v: string) => void;
  setBody: (v: string) => void;
  setActionItems: (v: PlcActionItem[]) => void;
  /** Functional update so a teammate's blocks are never dropped. */
  updateBlocks: (fn: (blocks: PlcNoteBlock[]) => PlcNoteBlock[]) => void;
  setKind: (kind: 'meeting') => void;
}

export function useNoteDraft(params: {
  plcId: string;
  note: PlcNote;
  uid: string;
  canEdit: boolean;
  collab: boolean;
  updateNote: (
    id: string,
    patch: UpdateNotePatch,
    options?: UpdateNoteOptions
  ) => Promise<void>;
}): NoteDraft {
  const { plcId, note, uid, canEdit, collab, updateNote } = params;
  const { t } = useTranslation();
  const { addToast } = useDashboard();
  const crdt = usePlcNoteCrdt({
    plcId,
    noteId: collab ? note.id : null,
    enabled: collab,
  });

  const [draft, setDraft] = useState<Draft>(() => draftOf(note));
  const baselineRef = useRef<Draft>(draftOf(note));
  const versionRef = useRef<number | undefined>(note.version);
  const pendingRef = useRef<Patch>({});
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef<Promise<void> | null>(null);

  // A teammate's save lands: adopt it while this draft holds no unsaved work.
  const [seenEditAt, setSeenEditAt] = useState(note.lastEditedAt);
  if (note.lastEditedAt !== seenEditAt) {
    setSeenEditAt(note.lastEditedAt);
    /* eslint-disable react-hooks/refs -- adjusting state during render on a remote save (CLAUDE.md pattern) */
    const clean =
      sameDraft(draft, baselineRef.current) &&
      Object.keys(pendingRef.current).length === 0;
    if (clean) {
      const next = draftOf(note);
      setDraft(next);
      baselineRef.current = next;
      versionRef.current = note.version;
    }
    /* eslint-enable react-hooks/refs */
  }

  const draftRef = useRef(draft);
  // eslint-disable-next-line react-hooks/refs -- render-body ref sync keeps the debounced save current (CLAUDE.md pattern)
  draftRef.current = draft;
  const noteRef = useRef(note);
  // eslint-disable-next-line react-hooks/refs -- same render-body ref sync
  noteRef.current = note;

  const flush = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    const patch = pendingRef.current;
    pendingRef.current = {};
    if (Object.keys(patch).length === 0) return;
    const sent = draftRef.current;
    const send = () => {
      const expectedVersion = versionRef.current;
      return updateNote(note.id, patch, { expectedVersion }).then(() => {
        if (expectedVersion !== undefined) {
          versionRef.current = expectedVersion + 1;
        }
        baselineRef.current = sent;
      });
    };
    const prior = inFlightRef.current;
    const write = prior ? prior.then(send, send) : send();
    inFlightRef.current = write.catch(() => undefined);
    write.catch((err: unknown) => {
      if (err instanceof PlcNoteVersionConflictError) {
        addToast(
          t('plcDashboard.notes.conflictMessage', {
            defaultValue:
              'A teammate edited this note while you were writing. Reload to see their changes. Your unsaved text is kept below.',
          }),
          'warning',
          {
            label: t('plcDashboard.notes.conflictReload', {
              defaultValue: 'Reload note',
            }),
            onClick: () => {
              const next = draftOf(noteRef.current);
              setDraft(next);
              baselineRef.current = next;
              versionRef.current = noteRef.current.version;
            },
          }
        );
        return;
      }
      logError('useNoteDraft.save', err, { plcId, noteId: note.id });
    });
  }, [addToast, note.id, plcId, t, updateNote]);

  useEffect(() => flush, [flush]);

  const schedule = useCallback(
    (patch: Patch) => {
      pendingRef.current = { ...pendingRef.current, ...patch };
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(flush, SAVE_DEBOUNCE_MS);
    },
    [flush]
  );

  const collabReady = collab && crdt.status === 'ready';
  const ready = !collab || collabReady;

  const setTitle = (v: string) => {
    if (!canEdit || !ready) return;
    if (collab) return crdt.setTitle(v);
    setDraft((d) => ({ ...d, title: v }));
    schedule({ title: v });
  };
  const setBody = (v: string) => {
    if (!canEdit || !ready) return;
    if (collab) return crdt.setBody(v);
    setDraft((d) => ({ ...d, body: v }));
    schedule({ body: v });
  };
  const setActionItems = (v: PlcActionItem[]) => {
    if (!canEdit || !ready) return;
    if (collab) return crdt.setActionItems(v);
    setDraft((d) => ({ ...d, actionItems: v }));
    schedule({ actionItems: v });
  };
  const updateBlocks = (fn: (blocks: PlcNoteBlock[]) => PlcNoteBlock[]) => {
    if (!canEdit) return;
    if (collab) {
      void mutateNoteBlocks(plcId, note.id, uid, fn).catch((err: unknown) => {
        logError('useNoteDraft.blocks', err, { plcId, noteId: note.id });
        addToast(
          t('plcDashboard.notes.saveFailed', {
            defaultValue: "Couldn't save your changes. Please try again.",
          }),
          'error'
        );
      });
      return;
    }
    const next = fn(draftRef.current.blocks);
    setDraft((d) => ({ ...d, blocks: next }));
    schedule({ blocks: next });
  };
  const setKind = (kind: 'meeting') => {
    if (!canEdit || note.kind === kind) return;
    if (collab) {
      void updateNote(
        note.id,
        { kind },
        { expectedVersion: note.version }
      ).catch((err: unknown) => logError('useNoteDraft.kind', err, { plcId }));
      return;
    }
    schedule({ kind });
  };

  if (collab) {
    return {
      ready,
      title: collabReady ? crdt.content.title : note.title,
      body: collabReady ? crdt.content.body : note.body,
      actionItems: collabReady
        ? crdt.content.actionItems
        : (note.actionItems ?? []),
      blocks: note.blocks ?? [],
      setTitle,
      setBody,
      setActionItems,
      updateBlocks,
      setKind,
    };
  }
  return {
    ready,
    ...draft,
    setTitle,
    setBody,
    setActionItems,
    updateBlocks,
    setKind,
  };
}
