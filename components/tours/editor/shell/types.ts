import type React from 'react';
import type { LucideIcon } from 'lucide-react';
import type { tourAttr } from '@/config/tourAnchors';
import type { TourPublishStatus } from '@/components/tours/tourSnapshot';
import type { TourKind, TourMainAction, TourMainState } from './tourMainAction';

export type TourShellSaveState = 'saved' | 'saving' | 'error' | 'conflict';

/** One outline row; the kind decides its title and any status under it. */
export interface TourShellStep {
  id: string;
  title: string;
  /** Exposed as data-status on the row, for tests and tools. */
  status?: string;
  subtitle?: {
    text: string;
    tone: 'muted' | 'warn' | 'error' | 'busy' | 'action';
  } | null;
}

/** Ids a kind can put in the ⋯ menu; only what that kind supports today. */
export type TourShellMenuId =
  | 'rewrite-all'
  | 'copy-link'
  | 'duplicate'
  | 'delete'
  | 'copy-for-claude'
  | 'read-aloud'
  | 'swap-side';

/** The `data-tour` attributes a control spreads, as `tourAttr` returns them. */
export type TourAnchorAttrs = ReturnType<typeof tourAttr>;

/** Shell controls whose anchor a kind can replace, so its saved tour ids keep rendering. */
export type TourShellAnchorSlot =
  'main' | 'play' | 'menu' | 'add-step' | 'record' | 'step-more';

export interface TourShellMenuItem {
  id: TourShellMenuId;
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
  /** A toggle item: shown checked when true. */
  pressed?: boolean;
  /** Replaces the shared menu-item anchor. */
  anchor?: TourAnchorAttrs;
}

/** Everything the shell needs from a tour kind (Live today, web from slice 4). */
export interface TourShellAdapter {
  kind: TourKind;
  title: string;
  saveState: TourShellSaveState;
  /** null while the published copy loads. */
  publish: TourPublishStatus | null;
  main: TourMainAction;
  /** A publish is in flight; the main button says so. */
  publishing?: boolean;
  onMain: (state: TourMainState) => void;
  onPlay?: () => void;
  playDisabled?: boolean;
  /** Tooltip naming what Play does for this kind. */
  playHint?: string;
  menu: readonly TourShellMenuItem[];
  /** Slot at the foot of the ⋯ menu for the public-link switch (S6, slice 7). */
  menuFooter?: React.ReactNode;
  steps: readonly TourShellStep[];
  selected: number;
  onSelect: (index: number) => void;
  /** Drag reorder; absent means rows don't drag. */
  onMove?: (stepId: string, toIndex: number) => void;
  /** The selected step's card, rendered under its row. */
  renderCard: (stepId: string, index: number) => React.ReactNode;
  /** A small action shown on the selected row (e.g. Copy for Claude). */
  rowAction?: (stepId: string) => React.ReactNode;
  onAddStep?: () => void;
  onRecord?: () => void;
  /** Overrides the Record button's label, e.g. "Stop receiving steps". */
  recordLabel?: string;
  recording?: boolean;
  /** Replaces the shared tour-editor anchors on the shell's controls. */
  anchors?: Partial<Record<TourShellAnchorSlot, TourAnchorAttrs>>;
  undo?: {
    onUndo: () => void;
    onRedo: () => void;
    canUndo: boolean;
    canRedo: boolean;
  };
}
