// Pure PLC Home v2 layout helpers: the starter set, slice union and hero resolution.

import {
  PLC_HOME_TILE_KINDS,
  PLC_HOME_TILE_SLICES,
  type PlcHomeSignals,
  type PlcHomeSlice,
  type PlcHomeTileInstance,
  type PlcHomeTileKind,
} from './tileTypes';

/** Stable ids so a member who never customized keeps the same hero across visits. */
export const PLC_HOME_STARTER_TILES: readonly PlcHomeTileInstance[] = [
  { id: 'starter-results', kind: 'results' },
  { id: 'starter-meeting', kind: 'meeting' },
  { id: 'starter-actionsActivity', kind: 'actionsActivity' },
  { id: 'starter-docs', kind: 'docs' },
];

export function homeSlicesFor(
  tiles: readonly PlcHomeTileInstance[]
): ReadonlySet<PlcHomeSlice> {
  const out = new Set<PlcHomeSlice>();
  for (const tile of tiles) {
    for (const slice of PLC_HOME_TILE_SLICES[tile.kind] ?? []) out.add(slice);
  }
  return out;
}

/** Positive score = this tile wants to be the hero right now. */
export function heroScoreFor(
  kind: PlcHomeTileKind,
  signals: PlcHomeSignals
): number {
  if (kind === 'meeting') return signals.meetingDayActive ? 2 : 0;
  if (kind === 'results') return signals.newResults ? 1 : 0;
  return 0;
}

/** D4: live meeting, else the spotlight, else the best smart default, else none. */
export function resolveHero(params: {
  tiles: readonly PlcHomeTileInstance[];
  heroTileId: string | null | undefined;
  signals: PlcHomeSignals;
}): string | null {
  const { tiles, heroTileId, signals } = params;
  if (signals.meetingInProgress) {
    const meeting = tiles.find((t) => t.kind === 'meeting');
    if (meeting) return meeting.id;
  }
  if (heroTileId && tiles.some((t) => t.id === heroTileId)) return heroTileId;
  let best: { id: string; score: number } | null = null;
  for (const tile of tiles) {
    const score = heroScoreFor(tile.kind, signals);
    if (score > 0 && (!best || score > best.score)) {
      best = { id: tile.id, score };
    }
  }
  return best?.id ?? null;
}

/** The member's saved Home layout, as stored at users/{uid}/plc_layouts/{plcId}. */
export interface PlcHomeLayout {
  /** Whether the doc exists, so a first write knows to include tiles. */
  exists: boolean;
  /** Null = no v2 layout yet; the starter set applies. */
  tiles: PlcHomeTileInstance[] | null;
  heroTileId: string | null;
  seenCounts: Record<string, number> | null;
}

export const EMPTY_PLC_HOME_LAYOUT: PlcHomeLayout = {
  exists: false,
  tiles: null,
  heroTileId: null,
  seenCounts: null,
};

/** Rules cap the tiles list at 50; seenCounts is capped to match. */
export const PLC_HOME_MAX_TILES = 50;
export const PLC_HOME_MAX_SEEN_COUNTS = 200;

const KNOWN_KINDS = new Set<string>(PLC_HOME_TILE_KINDS);

function parseTile(raw: unknown): PlcHomeTileInstance | null {
  if (!raw || typeof raw !== 'object') return null;
  const t = raw as Record<string, unknown>;
  if (typeof t.id !== 'string' || !t.id) return null;
  if (typeof t.kind !== 'string' || !KNOWN_KINDS.has(t.kind)) return null;
  const tile: PlcHomeTileInstance = {
    id: t.id,
    kind: t.kind as PlcHomeTileKind,
  };
  const options = t.options as Record<string, unknown> | undefined;
  if (options && typeof options.assessmentId === 'string') {
    tile.options = { assessmentId: options.assessmentId };
  }
  return tile;
}

/** Legacy bento docs carry tiles without ids; those fall back to the starter set. */
export function parsePlcHomeLayout(
  data: Record<string, unknown> | null | undefined
): PlcHomeLayout {
  if (!data) return EMPTY_PLC_HOME_LAYOUT;
  let tiles: PlcHomeTileInstance[] | null = null;
  if (Array.isArray(data.tiles)) {
    const parsed: PlcHomeTileInstance[] = [];
    const seen = new Set<string>();
    for (const raw of data.tiles) {
      const tile = parseTile(raw);
      if (tile && !seen.has(tile.id)) {
        seen.add(tile.id);
        parsed.push(tile);
      }
    }
    tiles = data.tiles.length > 0 && parsed.length === 0 ? null : parsed;
  }
  const seenCounts: Record<string, number> = {};
  let hasSeen = false;
  if (data.seenCounts && typeof data.seenCounts === 'object') {
    for (const [id, n] of Object.entries(
      data.seenCounts as Record<string, unknown>
    )) {
      if (typeof n === 'number' && Number.isFinite(n)) {
        seenCounts[id] = n;
        hasSeen = true;
      }
    }
  }
  return {
    exists: true,
    tiles,
    heroTileId: typeof data.heroTileId === 'string' ? data.heroTileId : null,
    seenCounts: hasSeen || data.seenCounts ? seenCounts : null,
  };
}

export function effectiveTiles(layout: PlcHomeLayout): PlcHomeTileInstance[] {
  return layout.tiles ?? [...PLC_HOME_STARTER_TILES];
}

/** D27: an assessment's scored count rose since the counts frozen at this visit's start. */
export function hasNewResults(
  current: Readonly<Record<string, number>>,
  seen: Readonly<Record<string, number>> | null
): boolean {
  if (!seen) return false;
  return Object.entries(current).some(([id, n]) => n > (seen[id] ?? 0));
}

/** assessmentId → scoredStudentCount for the live assessments (prunes deleted ones). */
export function currentScoredCounts(
  aggregates: readonly {
    assessmentId: string;
    scoredStudentCount?: number;
    studentCount: number;
  }[],
  liveAssessmentIds: ReadonlySet<string>
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const agg of aggregates) {
    if (!liveAssessmentIds.has(agg.assessmentId)) continue;
    if (Object.keys(out).length >= PLC_HOME_MAX_SEEN_COUNTS) break;
    out[agg.assessmentId] = agg.scoredStudentCount ?? agg.studentCount;
  }
  return out;
}
