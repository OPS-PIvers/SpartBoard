import React from 'react';
import { Plc, PlcBentoTileKind, PlcFeatureSettings } from '@/types';
import type { PlcDashboardTabId } from '../PlcDashboard';
import { MembersTile } from './tiles/MembersTile';
import { PlcInfoTile } from './tiles/PlcInfoTile';
import { CompletedAssignmentsTile } from './tiles/CompletedAssignmentsTile';
import { NotesTile } from './tiles/NotesTile';
import { TodosTile } from './tiles/TodosTile';
import { SharedSheetTile } from './tiles/SharedSheetTile';
import { QuickActionsTile } from './tiles/QuickActionsTile';
import { QuizLibraryTile } from './tiles/QuizLibraryTile';
import { ActiveAssignmentsTile } from './tiles/ActiveAssignmentsTile';
import { VideoActivitiesTile } from './tiles/VideoActivitiesTile';
import { ComingSoonTile } from './tiles/ComingSoonTile';

export interface TileContext {
  plc: Plc;
  onNavigateTab: (tabId: PlcDashboardTabId) => void;
}

/**
 * Some tile kinds gate on a `PlcFeatureSettings` flag — when the feature is
 * off (toggled in the Settings tab), the tile is hidden from the grid AND
 * its corresponding tab. Returning `null` means "always visible."
 */
export function tileFeatureGate(
  kind: PlcBentoTileKind
): keyof PlcFeatureSettings | null {
  switch (kind) {
    case 'notes':
      return 'notes';
    case 'todos':
      return 'todos';
    case 'quizLibrary':
      return 'quizzes';
    case 'activeAssignments':
      return 'assignments';
    case 'videoActivities':
      return 'videoActivities';
    case 'sharedBoards':
      return 'sharedBoards';
    case 'plcInfo':
    case 'members':
    case 'completedAssignments':
    case 'sharedSheet':
    case 'quickActions':
      return null;
  }
}

/**
 * Switchboard for tile content. Each tile kind maps to a small component
 * that renders inside `PlcBentoTile`'s content slot. Adding a new tile =
 * a new case here + an entry in `PLC_BENTO_TILE_KINDS` (`types.ts`).
 *
 * "Coming soon" placeholders for unshipped phases route through
 * `ComingSoonTile` — when those phases ship, swap the case for the real
 * tile component and the layout doesn't have to change.
 */
export function renderTileContent(
  kind: PlcBentoTileKind,
  ctx: TileContext
): React.ReactNode {
  switch (kind) {
    case 'plcInfo':
      return <PlcInfoTile plc={ctx.plc} onNavigateTab={ctx.onNavigateTab} />;
    case 'members':
      return <MembersTile plc={ctx.plc} />;
    case 'completedAssignments':
      return <CompletedAssignmentsTile plc={ctx.plc} />;
    case 'notes':
      return <NotesTile plc={ctx.plc} onNavigateTab={ctx.onNavigateTab} />;
    case 'todos':
      return <TodosTile plc={ctx.plc} onNavigateTab={ctx.onNavigateTab} />;
    case 'sharedSheet':
      return <SharedSheetTile plc={ctx.plc} />;
    case 'quickActions':
      return <QuickActionsTile onNavigateTab={ctx.onNavigateTab} />;
    case 'quizLibrary':
      return (
        <QuizLibraryTile plc={ctx.plc} onNavigateTab={ctx.onNavigateTab} />
      );
    case 'activeAssignments':
      return (
        <ActiveAssignmentsTile
          plc={ctx.plc}
          onNavigateTab={ctx.onNavigateTab}
        />
      );
    case 'videoActivities':
      return (
        <VideoActivitiesTile plc={ctx.plc} onNavigateTab={ctx.onNavigateTab} />
      );
    case 'sharedBoards':
      return (
        <ComingSoonTile
          kind="sharedBoards"
          phase={6}
          onNavigateTab={() => ctx.onNavigateTab('sharedBoards')}
        />
      );
  }
}
