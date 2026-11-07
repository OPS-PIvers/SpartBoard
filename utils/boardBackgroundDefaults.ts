import { doc, getDoc } from 'firebase/firestore';
import { db, isAuthBypass, isConfigured } from '@/config/firebase';
import { DEFAULT_BOARD_BACKGROUND } from '@/config/backgrounds';
import { logError } from '@/utils/logError';

/** Admin-set defaults for new boards, at `admin_settings/board_backgrounds` (GETTING_STARTED.md D24). */
export const BOARD_BACKGROUNDS_SETTINGS_DOC = 'board_backgrounds';

export interface BoardBackgroundDefaults {
  /** The district's default; absent = SpartBoard's own. */
  district?: string;
  /** Building id to that building's default, which wins over the district's. */
  buildings: Record<string, string>;
}

export const EMPTY_BOARD_BACKGROUND_DEFAULTS: BoardBackgroundDefaults = {
  buildings: {},
};

// A class list or an image URL, as a board stores it; nothing longer is a background.
const isBackground = (v: unknown): v is string =>
  typeof v === 'string' && v.trim().length > 0 && v.length <= 2000;

export function normalizeBoardBackgroundDefaults(
  raw: unknown
): BoardBackgroundDefaults {
  if (!raw || typeof raw !== 'object') return EMPTY_BOARD_BACKGROUND_DEFAULTS;
  const { district, buildings } = raw as Record<string, unknown>;
  return {
    ...(isBackground(district) ? { district } : {}),
    buildings:
      buildings && typeof buildings === 'object'
        ? Object.fromEntries(
            Object.entries(buildings).filter(
              (entry): entry is [string, string] => isBackground(entry[1])
            )
          )
        : {},
  };
}

/** A new board's background: the first listed building's default, then the district's, then Snowy (D24, D25). */
export const defaultBackgroundFor = (
  defaults: BoardBackgroundDefaults,
  buildingIds: readonly string[]
): string => {
  const building = buildingIds.find((id) => defaults.buildings[id]);
  return (
    (building ? defaults.buildings[building] : undefined) ??
    defaults.district ??
    DEFAULT_BOARD_BACKGROUND
  );
};

let loaded: Promise<BoardBackgroundDefaults> | null = null;

/** Read once per session; a failed read falls back to SpartBoard's own default. */
export function loadBoardBackgroundDefaults(): Promise<BoardBackgroundDefaults> {
  if (isAuthBypass || !isConfigured)
    return Promise.resolve(EMPTY_BOARD_BACKGROUND_DEFAULTS);
  loaded ??= getDoc(doc(db, 'admin_settings', BOARD_BACKGROUNDS_SETTINGS_DOC))
    .then((snap) => normalizeBoardBackgroundDefaults(snap.data()))
    .catch((err: unknown) => {
      logError('loadBoardBackgroundDefaults', err);
      loaded = null;
      return EMPTY_BOARD_BACKGROUND_DEFAULTS;
    });
  return loaded;
}

/** An admin save takes effect for this tab's next board. */
export const forgetBoardBackgroundDefaults = (): void => {
  loaded = null;
};

/** A board this new was just made by the app, so it can still take an admin default. */
export const FRESH_BOARD_MS = 10 * 60 * 1000;

/** The teacher's first board, if it still has SpartBoard's own default; a background they chose is never replaced (D25). */
export const firstBoardOnDefault = <
  B extends { id: string; background: string; createdAt: number },
>(
  boards: readonly B[]
): B | null => {
  const first = [...boards].sort((a, b) => a.createdAt - b.createdAt)[0];
  return first && first.background === DEFAULT_BOARD_BACKGROUND ? first : null;
};
