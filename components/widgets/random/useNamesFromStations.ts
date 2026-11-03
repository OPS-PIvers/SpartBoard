import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  Dashboard,
  RandomConfig,
  StationsConfig,
  WidgetData,
} from '@/types';
import { useDashboard } from '@/context/useDashboard';
import { followLeaderId } from '@/utils/connectionEngine';
import { stationNamesForRandom } from '@/components/widgets/Stations/nexus';
import { combineRosterNames } from '@/utils/rosterNameLists';

type DrawState = Pick<
  RandomConfig,
  | 'lastResult'
  | 'remainingStudents'
  | 'doneNames'
  | 'lockedNames'
  | 'unassignedNames'
  | 'jigsawHomeGroups'
  | 'jigsawExpertGroups'
>;

const FRESH_DRAW: DrawState = {
  lastResult: null,
  remainingStudents: [],
  doneNames: [],
  lockedNames: [],
  unassignedNames: [],
  jigsawHomeGroups: null,
  jigsawExpertGroups: null,
};

// Carries the current draw over to the new names: a renamed station keeps its place; a removed one drops out.
export const followDrawPatch = (
  config: RandomConfig,
  next: string[]
): Partial<DrawState> => {
  const prev = combineRosterNames(
    config.firstNames ?? '',
    config.lastNames ?? ''
  );
  const rename = new Map<string, string>();
  if (prev.length === next.length)
    prev.forEach((n, i) => rename.set(n, next[i]));
  const kept = new Set(next);
  const map = (n: string): string | null => {
    const m = rename.get(n) ?? n;
    return kept.has(m) ? m : null;
  };
  const list = (names: string[] | undefined) =>
    names?.flatMap((n) => {
      const m = map(n);
      return m === null ? [] : [m];
    });
  const groups = (gs: RandomConfig['jigsawHomeGroups']) =>
    gs?.map((g) => ({ ...g, names: list(g.names) ?? [] }));
  const r = config.lastResult;
  let lastResult: RandomConfig['lastResult'] = r ?? null;
  if (typeof r === 'string') lastResult = map(r);
  else if (
    Array.isArray(r) &&
    r.length > 0 &&
    r.every((x) => typeof x === 'string')
  ) {
    const shuffled = list(r) ?? [];
    lastResult = [...shuffled, ...next.filter((n) => !shuffled.includes(n))];
  } else if (Array.isArray(r) && r.length > 0) {
    lastResult =
      groups(r as NonNullable<RandomConfig['jigsawHomeGroups']>) ?? null;
  }
  const patch: Partial<DrawState> = { lastResult };
  if (config.remainingStudents)
    patch.remainingStudents = list(config.remainingStudents);
  if (config.doneNames) patch.doneNames = list(config.doneNames);
  if (config.lockedNames) patch.lockedNames = list(config.lockedNames);
  if (config.unassignedNames)
    patch.unassignedNames = list(config.unassignedNames);
  if (config.jigsawHomeGroups)
    patch.jigsawHomeGroups = groups(config.jigsawHomeGroups);
  if (config.jigsawExpertGroups)
    patch.jigsawExpertGroups = groups(config.jigsawExpertGroups);
  return patch;
};

/** The Stations widget a Randomizer Follows, when Connections are on. */
export const followedStations = (
  board: Pick<Dashboard, 'connections' | 'widgets'> | null | undefined,
  widgetId: string,
  connectionsOn: boolean
): WidgetData | null => {
  if (!connectionsOn || !board) return null;
  const id = followLeaderId(board.connections, board.widgets, widgetId);
  const leader = id ? board.widgets.find((w) => w.id === id) : undefined;
  return leader?.type === 'stations' ? leader : null;
};

// Writes the followed Stations' names into the Randomizer, the same change "Send to Randomizer" makes.
export const useNamesFromStations = (
  widget: WidgetData,
  connectionsOn: boolean
): WidgetData | null => {
  const { t } = useTranslation();
  const { activeDashboard, updateWidget, isActiveBoardReadOnly } =
    useDashboard();
  const readOnly = isActiveBoardReadOnly === true;
  const stations = followedStations(activeDashboard, widget.id, connectionsOn);
  const config = widget.config as RandomConfig;
  const names = stations
    ? stationNamesForRandom(
        (stations.config as StationsConfig).stations,
        (number) => t('widgetSettings.stations.stationNumber', { number })
      ).join('\n')
    : null;
  const stale =
    !!names &&
    (config.firstNames !== names ||
      (config.lastNames ?? '') !== '' ||
      config.rosterMode !== 'custom');

  // The names this Randomizer last took from the Stations; only those carry a draw over.
  const synced = useRef<string | null>(null);
  useEffect(() => {
    if (names === null) return;
    if (!stale) {
      synced.current = names;
      return;
    }
    if (readOnly) return;
    const carry =
      synced.current !== null && synced.current === config.firstNames;
    synced.current = names;
    updateWidget(widget.id, {
      config: {
        ...(carry ? followDrawPatch(config, names.split('\n')) : FRESH_DRAW),
        firstNames: names,
        lastNames: '',
        rosterMode: 'custom',
      },
    });
  }, [stale, readOnly, names, updateWidget, widget.id, config]);

  return stations;
};
