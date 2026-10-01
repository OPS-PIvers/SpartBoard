// PLC Home v2 tile registry: label, icon, availability and component per tile kind.

import type React from 'react';
import {
  BarChart3,
  CalendarDays,
  FileText,
  ListChecks,
  Target,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import type { GlobalFeature, Plc } from '@/types';
import { ResultsTile } from './ResultsTile';
import { MeetingTile } from './MeetingTile';
import { ActionsActivityTile } from './ActionsActivityTile';
import { DocsTile } from './DocsTile';
import { ParticipationTile } from './ParticipationTile';
import { GoalsTile } from './GoalsTile';
import {
  PLC_HOME_TILE_KINDS,
  PLC_HOME_TILE_SLICES,
  type PlcHomeSlice,
  type PlcHomeTileInstance,
  type PlcHomeTileKind,
  type PlcHomeTileProps,
} from './tileTypes';

export interface PlcHomeTileDef {
  kind: PlcHomeTileKind;
  labelKey: string;
  labelDefault: string;
  descriptionKey: string;
  descriptionDefault: string;
  /** A kind that takes options can sit on Home more than once. */
  multiple?: boolean;
  icon: LucideIcon;
  slices: readonly PlcHomeSlice[];
  /** Preview flag the tile sits behind. */
  feature?: GlobalFeature;
  isAvailable: (plc: Plc) => boolean;
  Component: React.FC<PlcHomeTileProps>;
}

const always = (): boolean => true;

export const PLC_HOME_TILE_DEFS: Partial<
  Record<PlcHomeTileKind, PlcHomeTileDef>
> = {
  results: {
    kind: 'results',
    labelKey: 'plcDashboard.home.results.title',
    descriptionKey: 'plcDashboard.home.results.description',
    labelDefault: 'Results',
    descriptionDefault:
      'Mastery by learning target and the latest common assessment',
    icon: BarChart3,
    slices: PLC_HOME_TILE_SLICES.results,
    isAvailable: always,
    Component: ResultsTile,
  },
  meeting: {
    kind: 'meeting',
    labelKey: 'plcDashboard.home.meeting.title',
    descriptionKey: 'plcDashboard.home.meeting.description',
    labelDefault: 'Meeting',
    descriptionDefault: 'The next meeting and what the last one decided',
    icon: CalendarDays,
    slices: PLC_HOME_TILE_SLICES.meeting,
    isAvailable: always,
    Component: MeetingTile,
  },
  actionsActivity: {
    kind: 'actionsActivity',
    labelKey: 'plcDashboard.home.actionsActivity.title',
    descriptionKey: 'plcDashboard.home.actionsActivity.description',
    labelDefault: 'Action items and activity',
    descriptionDefault: 'What you owe and what changed since your last visit',
    icon: ListChecks,
    slices: PLC_HOME_TILE_SLICES.actionsActivity,
    isAvailable: always,
    Component: ActionsActivityTile,
  },
  docs: {
    kind: 'docs',
    labelKey: 'plcDashboard.home.docs.title',
    descriptionKey: 'plcDashboard.home.docs.description',
    labelDefault: 'Docs and notes',
    descriptionDefault: 'The newest shared docs and notes',
    icon: FileText,
    slices: PLC_HOME_TILE_SLICES.docs,
    isAvailable: always,
    Component: DocsTile,
  },
  participation: {
    kind: 'participation',
    labelKey: 'plcDashboard.home.participation.title',
    descriptionKey: 'plcDashboard.home.participation.description',
    labelDefault: 'Participation',
    descriptionDefault: 'How many teachers ran each common assessment',
    icon: UsersRound,
    slices: PLC_HOME_TILE_SLICES.participation,
    isAvailable: always,
    Component: ParticipationTile,
  },
  goals: {
    kind: 'goals',
    labelKey: 'plcGoals.title',
    descriptionKey: 'plcGoals.description',
    labelDefault: 'Goals',
    descriptionDefault: "The group's goals and the practices behind them",
    icon: Target,
    slices: PLC_HOME_TILE_SLICES.goals,
    feature: 'my-groups',
    isAvailable: always,
    Component: GoalsTile,
  },
};

/** Available in this group and not behind a flag the viewer lacks. */
export function isPlcHomeTileShown(
  def: PlcHomeTileDef | undefined,
  plc: Plc,
  canAccessFeature: (feature: GlobalFeature) => boolean
): def is PlcHomeTileDef {
  return (
    !!def &&
    def.isAvailable(plc) &&
    (!def.feature || canAccessFeature(def.feature))
  );
}

export function getPlcHomeTileDef(
  kind: PlcHomeTileKind
): PlcHomeTileDef | undefined {
  return PLC_HOME_TILE_DEFS[kind];
}

/** Catalog entries: available here and not already on Home (unless repeatable). */
export function listAddableTileDefs(
  plc: Plc,
  tiles: readonly PlcHomeTileInstance[],
  canAccessFeature: (feature: GlobalFeature) => boolean
): PlcHomeTileDef[] {
  const present = new Set(tiles.map((t) => t.kind));
  return PLC_HOME_TILE_KINDS.map((kind) => PLC_HOME_TILE_DEFS[kind])
    .filter((def): def is PlcHomeTileDef =>
      isPlcHomeTileShown(def, plc, canAccessFeature)
    )
    .filter((def) => def.multiple === true || !present.has(def.kind));
}
