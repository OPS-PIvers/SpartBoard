// PLC Home v2 tile contract: kinds, instances, and the slices each kind needs (no React).

import type { ReactNode } from 'react';
import type { Plc } from '@/types';
import type { PlcSectionId } from '@/components/plc/sections';

export type PlcHomeTileKind =
  | 'results'
  | 'meeting'
  | 'actionsActivity'
  | 'docs'
  | 'participation';

export const PLC_HOME_TILE_KINDS: readonly PlcHomeTileKind[] = [
  'results',
  'meeting',
  'actionsActivity',
  'docs',
  'participation',
];

/** Provider subcollections a tile can ask to open while Home is active. */
export type PlcHomeSlice = 'notes' | 'docs' | 'meetings';

export interface PlcHomeTileOptions {
  /** Which assessment a tile charts; latest when absent. */
  assessmentId?: string;
}

export interface PlcHomeTileInstance {
  id: string;
  kind: PlcHomeTileKind;
  options?: PlcHomeTileOptions;
}

export const PLC_HOME_TILE_SLICES: Record<
  PlcHomeTileKind,
  readonly PlcHomeSlice[]
> = {
  // Meetings feed the Start/Resume state of the featured assessment.
  results: ['meetings'],
  meeting: ['meetings'],
  actionsActivity: ['notes'],
  docs: ['notes', 'docs'],
  participation: [],
};

/** Signals the hero resolver and each tile's hero score read. */
export interface PlcHomeSignals {
  meetingInProgress: boolean;
  /** Meeting day, until today's meeting is done (D26). */
  meetingDayActive: boolean;
  /** A result count rose or a phase reached ready since the last visit (D27). */
  newResults: boolean;
}

/** Everything a tile needs from Home that isn't a provider selector. */
export interface PlcHomeTileContext {
  plc: Plc;
  uid: string | null;
  /** Captured once per Home mount. */
  now: number;
  onNavigate: (id: PlcSectionId) => void;
  /** Opens a shared doc in the Notes & Docs embed. */
  onOpenDoc: (docId: string) => void;
  /** Activity cursor frozen at Home mount. */
  lastSeenAt: number | null;
  signals: PlcHomeSignals;
}

export interface PlcHomeTileProps {
  tile: PlcHomeTileInstance;
  ctx: PlcHomeTileContext;
  /** Hero renders the expanded read-only view; otherwise compact. */
  hero: boolean;
  /** Header controls Home supplies (spotlight, Customize remove). */
  controls?: ReactNode;
  /** Saves this tile's options. */
  onOptionsChange?: (options: PlcHomeTileOptions) => void;
}
