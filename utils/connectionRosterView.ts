import type {
  ChecklistConfig,
  ClassRoster,
  Dashboard,
  WidgetData,
} from '@/types';
import { rosterGroupMemberIds } from '@/utils/rosterGroups';
import {
  CHECKLIST_ROSTER_ORDER,
  checklistUsesClassRoster,
} from '@/utils/checklistCurrent';

export interface RosterView {
  rosters: ClassRoster[];
  activeRosterId: string | null;
  groupsEnabled: boolean;
  /** False until the saved-groups switch has answered; only matters for a Checklist with a saved group. */
  groupsReady: boolean;
}

const isClassRosterChecklist = (w: WidgetData) =>
  w.type === 'checklist' &&
  checklistUsesClassRoster(w.config as ChecklistConfig);

// The board's widgets as the engine needs them: a class-roster Checklist gets its rows' student ids, in the order the widget shows.
// `waiting` holds class-roster Checklists in a Connection whose class isn't loaded yet; no step may act on them until it is.
export const engineView = (
  board: Dashboard,
  view: RosterView
): { widgets: WidgetData[]; waiting: Set<string> } => {
  const roster = view.rosters.find((r) => r.id === view.activeRosterId);
  const connected = new Set(
    (board.connections ?? []).flatMap((c) =>
      c.kind === 'sequence'
        ? c.steps.flatMap((s) => s.actions.map((a) => a.widgetId))
        : []
    )
  );
  const waiting = new Set(
    board.widgets
      .filter(
        (w) =>
          connected.has(w.id) &&
          isClassRosterChecklist(w) &&
          (!roster ||
            roster.students.length === 0 ||
            (!!(w.config as ChecklistConfig).rosterPoolGroupId &&
              !view.groupsReady))
      )
      .map((w) => w.id)
  );
  const widgets = board.widgets.map((w) => {
    if (waiting.has(w.id)) return w;
    if (w.type !== 'checklist') return w;
    const c = w.config as ChecklistConfig;
    if (!checklistUsesClassRoster(c)) return w;
    const inPool = rosterGroupMemberIds(
      roster,
      c.rosterPoolGroupId,
      view.groupsEnabled
    );
    const order = (roster?.students ?? [])
      .filter((st) => !inPool || inPool.has(st.id))
      .map((st) => st.id);
    return {
      ...w,
      config: { ...c, [CHECKLIST_ROSTER_ORDER]: order },
    };
  });
  return { widgets, waiting };
};

// The engine's widgets, or null while any class roster in a Connection is still loading.
export const engineWidgets = (
  board: Dashboard,
  view: RosterView
): WidgetData[] | null => {
  const { widgets, waiting } = engineView(board, view);
  return waiting.size > 0 ? null : widgets;
};
