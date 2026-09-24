import type {
  GuidedLearningMode,
  GuidedLearningSet,
  GuidedLearningStep,
  GuidedLearningVideoTrim,
  GuidedLearningWatchPace,
  WidgetType,
} from '@/types';
import type { GuidedLearningMediaKind } from '@/utils/guidedLearningMedia';

/** The undoable part of the editor: everything that is saved with the set. */
export interface EditorDocument {
  title: string;
  description: string;
  mode: GuidedLearningMode;
  imageUrls: string[];
  imageKinds: GuidedLearningMediaKind[];
  videoTrims: (GuidedLearningVideoTrim | null)[];
  steps: GuidedLearningStep[];
  hotspotPulse: 'consistent' | 'reminder' | 'off';
  imageTransition: 'none' | 'slide' | 'fade';
  welcomeEnabled: boolean;
  welcomeMessage: string;
  watchPace: GuidedLearningWatchPace | undefined;
  /** Live tours: widget types the tour adds to the board before it starts. */
  tourSetupWidgets: WidgetType[];
}

/** A file to delete once the set is saved and the editor closes. */
export interface MediaDeletionRef {
  storagePath?: string;
  driveFileId?: string;
}

/** The document before an edit, plus the deletions that edit queued. */
export interface HistoryEntry {
  doc: EditorDocument;
  media: MediaDeletionRef[];
  /** Identifies the edit that pushed this entry, for a targeted undo. */
  tag?: object;
}

export interface EditorHistoryState {
  past: HistoryEntry[];
  present: EditorDocument;
  future: HistoryEntry[];
  /** Deletions whose edits can no longer be undone (trimmed or cleared). */
  retiredMedia: MediaDeletionRef[];
  /** Document at beginGesture; null when no gesture is open. */
  gestureBase: EditorDocument | null;
  /** Key and time of the last coalescable edit. */
  lastCoalesce: { key: string; at: number } | null;
}

export const HISTORY_LIMIT = 100;
export const COALESCE_MS = 800;

export type EditorHistoryAction =
  | {
      type: 'apply';
      update: (doc: EditorDocument) => EditorDocument;
      /** Edits sharing a key within COALESCE_MS of each other form one entry. */
      coalesceKey?: string;
      at?: number;
      tag?: object;
    }
  | { type: 'undo' }
  /** Undoes only while the tagged edit is still the newest one. */
  | { type: 'undoIfLatest'; tag: object }
  | { type: 'redo' }
  | { type: 'beginGesture' }
  | { type: 'endGesture' }
  | { type: 'queueMedia'; ref: MediaDeletionRef }
  | {
      type: 'rebase';
      /** Rewrites every document in history without adding an entry; null drops that entry and older ones. */
      convert: (doc: EditorDocument) => EditorDocument | null;
    }
  | { type: 'reset'; doc: EditorDocument };

function kindsForSet(set: GuidedLearningSet | null): GuidedLearningMediaKind[] {
  if (!set) return [];
  return set.imageUrls.map((_, i) => set.imageKinds?.[i] ?? 'image');
}

function trimsForSet(
  set: GuidedLearningSet | null
): (GuidedLearningVideoTrim | null)[] {
  if (!set) return [];
  return set.imageUrls.map((_, i) => set.videoTrims?.[i] ?? null);
}

export function documentFromSet(set: GuidedLearningSet | null): EditorDocument {
  return {
    title: set?.title ?? '',
    description: set?.description ?? '',
    mode: set?.mode ?? 'structured',
    imageUrls: set?.imageUrls ?? [],
    imageKinds: kindsForSet(set),
    videoTrims: trimsForSet(set),
    steps: set?.steps ?? [],
    hotspotPulse: set?.hotspotPulse ?? 'consistent',
    imageTransition: set?.imageTransition ?? 'none',
    welcomeEnabled: Boolean(set?.welcomeEnabled),
    welcomeMessage: set?.welcomeMessage ?? '',
    watchPace: set?.watchPace,
    tourSetupWidgets: set?.tourSetup?.widgets ?? [],
  };
}

export function initialHistory(doc: EditorDocument): EditorHistoryState {
  return {
    past: [],
    present: doc,
    future: [],
    retiredMedia: [],
    gestureBase: null,
    lastCoalesce: null,
  };
}

function pushPast(
  state: EditorHistoryState,
  entry: HistoryEntry
): Pick<EditorHistoryState, 'past' | 'retiredMedia'> {
  const past = [...state.past, entry];
  if (past.length <= HISTORY_LIMIT) {
    return { past, retiredMedia: state.retiredMedia };
  }
  const trimmed = past.splice(0, past.length - HISTORY_LIMIT);
  return {
    past,
    retiredMedia: [...state.retiredMedia, ...trimmed.flatMap((e) => e.media)],
  };
}

/** True while the tagged edit is the newest undoable one and nothing was undone since. */
export function isLatestEdit(state: EditorHistoryState, tag: object): boolean {
  return (
    !state.gestureBase &&
    state.future.length === 0 &&
    state.past[state.past.length - 1]?.tag === tag
  );
}

export function editorHistoryReducer(
  state: EditorHistoryState,
  action: EditorHistoryAction
): EditorHistoryState {
  switch (action.type) {
    case 'apply': {
      const next = action.update(state.present);
      if (next === state.present) return state;
      if (state.gestureBase) return { ...state, present: next };
      const at = action.at ?? Date.now();
      const key = action.coalesceKey;
      const coalesce =
        key !== undefined &&
        state.lastCoalesce?.key === key &&
        at - state.lastCoalesce.at < COALESCE_MS &&
        state.past.length > 0 &&
        state.future.length === 0;
      const lastCoalesce = key !== undefined ? { key, at } : null;
      if (coalesce) return { ...state, present: next, lastCoalesce };
      return {
        ...state,
        ...pushPast(state, {
          doc: state.present,
          media: [],
          ...(action.tag ? { tag: action.tag } : {}),
        }),
        present: next,
        future: [],
        lastCoalesce,
      };
    }
    case 'undoIfLatest':
      if (!isLatestEdit(state, action.tag)) return state;
      return editorHistoryReducer(state, { type: 'undo' });
    case 'undo': {
      if (state.gestureBase || state.past.length === 0) return state;
      const entry = state.past[state.past.length - 1];
      return {
        ...state,
        past: state.past.slice(0, -1),
        present: entry.doc,
        future: [{ doc: state.present, media: entry.media }, ...state.future],
        lastCoalesce: null,
      };
    }
    case 'redo': {
      if (state.gestureBase || state.future.length === 0) return state;
      const [entry, ...future] = state.future;
      return {
        ...state,
        ...pushPast(state, { doc: state.present, media: entry.media }),
        present: entry.doc,
        future,
        lastCoalesce: null,
      };
    }
    case 'beginGesture':
      if (state.gestureBase) return state;
      return { ...state, gestureBase: state.present, lastCoalesce: null };
    case 'endGesture': {
      const base = state.gestureBase;
      if (!base) return state;
      if (base === state.present) return { ...state, gestureBase: null };
      return {
        ...state,
        ...pushPast(state, { doc: base, media: [] }),
        future: [],
        gestureBase: null,
      };
    }
    case 'queueMedia': {
      if (state.past.length === 0) {
        return { ...state, retiredMedia: [...state.retiredMedia, action.ref] };
      }
      const last = state.past[state.past.length - 1];
      return {
        ...state,
        past: [
          ...state.past.slice(0, -1),
          { ...last, media: [...last.media, action.ref] },
        ],
      };
    }
    case 'rebase': {
      const present = action.convert(state.present);
      if (!present) return state;
      const past: HistoryEntry[] = [];
      let dropped: HistoryEntry[] = [];
      for (let i = state.past.length - 1; i >= 0; i--) {
        const doc = action.convert(state.past[i].doc);
        if (!doc) {
          dropped = state.past.slice(0, i + 1);
          break;
        }
        past.unshift({ ...state.past[i], doc });
      }
      const future: HistoryEntry[] = [];
      for (const entry of state.future) {
        const doc = action.convert(entry.doc);
        if (!doc) break;
        future.push({ ...entry, doc });
      }
      return {
        ...state,
        past,
        present,
        future,
        retiredMedia: [
          ...state.retiredMedia,
          ...dropped.flatMap((e) => e.media),
        ],
        gestureBase: state.gestureBase
          ? (action.convert(state.gestureBase) ?? present)
          : null,
      };
    }
    case 'reset':
      return initialHistory(action.doc);
  }
}

/** Deletions still owed: every one whose edit is live or no longer undoable. */
export function pendingMediaDeletions(
  state: EditorHistoryState
): MediaDeletionRef[] {
  return [...state.retiredMedia, ...state.past.flatMap((e) => e.media)];
}
