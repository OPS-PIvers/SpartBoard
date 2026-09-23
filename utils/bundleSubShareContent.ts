/**
 * Collects, at share time, the widget data a substitute cannot reach.
 *
 * Runs on the teacher's own client, which is the only place that can read
 * their `users/` tree. Anything that fails to read is reported rather than
 * shipped empty, so the teacher finds out at share time instead of the sub
 * finding out mid-lesson.
 */

import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { logError } from '@/utils/logError';
import { subShareContentId } from '@/utils/subShareContent';
import { RUNS_COLLECTION, runIdFor } from '@/utils/projectRunWrites';
import { normalizeActivityWallLibraryEntry } from '@/utils/activityWallNormalize';
import type {
  ActivityWallConfig,
  ActivityWallLibraryEntry,
  CalendarConfig,
  CalendarEvent,
  CustomWidgetConfig,
  CustomWidgetDoc,
  Dashboard,
  DrawableObject,
  DrawingPage,
  NotebookItem,
  ProjectGroup,
  ProjectRun,
  ProjectsConfig,
  SmartNotebookConfig,
  SubShareActivityWallPayload,
  SubShareActivityWallView,
  SubShareCalendarPayload,
  SubShareContentDoc,
  SubShareContentKind,
  SubShareCustomWidgetPayload,
  SubShareDrawingPayload,
  SubShareNotebookPayload,
  SubShareProjectGroupView,
  SubShareProjectPayload,
  WidgetData,
} from '@/types';

export interface SubShareBundleItem {
  id: string;
  doc: SubShareContentDoc;
}

export interface SubShareBundleFailure {
  kind: SubShareContentKind;
  itemId: string;
  /** What to call it in front of the teacher, e.g. "Drawing on Warm up". */
  label: string;
}

export interface SubShareBundle {
  items: SubShareBundleItem[];
  failures: SubShareBundleFailure[];
}

/**
 * What the teacher's client can reach and this module cannot. Firestore reads
 * go through `db` directly; a Google API read needs a token only the signed-in
 * teacher's session can mint, so the caller passes the reader in. Omitting one
 * is not an error — the widgets that need it report a bundling failure, which
 * the teacher sees on the share screen.
 */
export interface SubShareBundleServices {
  /** Reads one of the teacher's own Google Calendars. */
  readCalendar?: (
    calendarId: string,
    timeMin: string,
    timeMax: string
  ) => Promise<CalendarEvent[]>;
}

interface DrawingConfig {
  pages?: DrawingPage[];
  subcollectionMigrated?: boolean;
}

/** Drawing widgets whose strokes moved to their own subcollection. */
function migratedDrawings(board: Dashboard): WidgetData[] {
  return (board.widgets ?? []).filter((w) => {
    if (w.type !== 'drawing') return false;
    return (
      (w.config as DrawingConfig | undefined)?.subcollectionMigrated === true
    );
  });
}

async function bundleDrawing(
  hostUid: string,
  board: Dashboard,
  widget: WidgetData
): Promise<SubShareDrawingPayload> {
  const pages = (widget.config as DrawingConfig | undefined)?.pages ?? [];
  const bundled: SubShareDrawingPayload['pages'] = [];
  for (const page of pages) {
    const snap = await getDocs(
      collection(
        db,
        'users',
        hostUid,
        'dashboards',
        board.id,
        'drawings',
        widget.id,
        'pages',
        page.id,
        'objects'
      )
    );
    const objects = snap.docs
      .map((d) => d.data() as DrawableObject)
      .sort((a, b) => a.z - b.z);
    bundled.push({ pageId: page.id, objects });
  }
  return { pages: bundled };
}

/** The notebook each Smart Notebook widget on the board is open on. */
function openNotebookIds(board: Dashboard): string[] {
  const ids: string[] = [];
  for (const widget of board.widgets ?? []) {
    if (widget.type !== 'smartNotebook') continue;
    const id = (widget.config as SmartNotebookConfig | undefined)
      ?.activeNotebookId;
    if (id) ids.push(id);
  }
  return ids;
}

async function bundleNotebook(
  hostUid: string,
  notebookId: string
): Promise<SubShareNotebookPayload> {
  const snap = await getDoc(doc(db, 'users', hostUid, 'notebooks', notebookId));
  if (!snap.exists()) throw new Error('notebook not found');
  const data = snap.data();
  // Page images are Storage download URLs, which carry their own token, so the
  // sub can load them without a rule of their own.
  const notebook: NotebookItem = {
    id: snap.id,
    title: (data.title as string) ?? 'Untitled',
    pageUrls: (data.pageUrls as string[]) ?? [],
    pagePaths: (data.pagePaths as string[]) ?? [],
    assetUrls: (data.assetUrls as string[]) ?? [],
    createdAt: (data.createdAt as number) ?? 0,
    sections: data.sections as NotebookItem['sections'],
    objectLinks: data.objectLinks as NotebookItem['objectLinks'],
    hiddenPages: data.hiddenPages as number[] | undefined,
  };
  return { notebook };
}

/** The custom widget each Custom Widget on the board points at. */
function customWidgetIds(board: Dashboard): string[] {
  const ids: string[] = [];
  for (const widget of board.widgets ?? []) {
    if (widget.type !== 'custom-widget') continue;
    const id = (widget.config as CustomWidgetConfig | undefined)
      ?.customWidgetId;
    if (id) ids.push(id);
  }
  return ids;
}

async function bundleCustomWidget(
  id: string
): Promise<SubShareCustomWidgetPayload> {
  // Read as the teacher, who can read a beta-gated widget the sub cannot.
  const snap = await getDoc(doc(db, 'custom_widgets', id));
  if (!snap.exists()) throw new Error('custom widget not found');
  const data = snap.data();
  // Field by field, not a spread: the raw doc carries `betaUsers`, and
  // `content/` is readable by any verified district account with the share.
  return {
    doc: {
      id: snap.id,
      title: (data.title as string) ?? 'Custom Widget',
      mode: (data.mode as CustomWidgetDoc['mode']) ?? 'block',
      updatedAt: (data.updatedAt as number) ?? 0,
      gridDefinition: data.gridDefinition as CustomWidgetDoc['gridDefinition'],
      codeContent: data.codeContent as string | undefined,
    },
  };
}

/** The project each Projects widget on the board has open. */
function openProjectIds(board: Dashboard): string[] {
  const ids: string[] = [];
  for (const widget of board.widgets ?? []) {
    if (widget.type !== 'projects') continue;
    const id = (widget.config as ProjectsConfig | undefined)?.projectId;
    if (id) ids.push(id);
  }
  return ids;
}

async function bundleProject(
  hostUid: string,
  projectId: string
): Promise<SubShareProjectPayload> {
  // D13 — one run per project, so its id is derivable rather than stored.
  const runId = runIdFor(hostUid, projectId);
  const snap = await getDoc(doc(db, RUNS_COLLECTION, runId));
  if (!snap.exists()) throw new Error('project run not started');
  const data = snap.data();
  const groupSnap = await getDocs(
    collection(db, RUNS_COLLECTION, runId, 'groups')
  );
  // Field by field, not a spread: a group carries `memberUids` and work links
  // the tracker never draws, and `content/` is broadly readable.
  const groups: SubShareProjectGroupView[] = groupSnap.docs.map((groupDoc) => {
    const group = groupDoc.data() as ProjectGroup;
    return {
      id: groupDoc.id,
      name: group.name ?? 'Group',
      classId: group.classId ?? '',
      order: group.order ?? 0,
      stepStates: group.stepStates ?? {},
      needsSupport: group.needsSupport === true,
    };
  });
  return {
    run: {
      id: snap.id,
      projectId: (data.projectId as string) ?? projectId,
      title: (data.title as string) ?? 'Project',
      steps: (data.steps as ProjectRun['steps']) ?? [],
    },
    groups,
  };
}

/** The wall each Activity Wall widget on the board has open. */
function openActivityWallIds(board: Dashboard): string[] {
  const ids: string[] = [];
  for (const widget of board.widgets ?? []) {
    if (widget.type !== 'activity-wall') continue;
    const id = (widget.config as ActivityWallConfig | undefined)
      ?.activeActivityId;
    if (id) ids.push(id);
  }
  return ids;
}

async function bundleActivityWall(
  hostUid: string,
  activityId: string
): Promise<SubShareActivityWallPayload> {
  const snap = await getDoc(
    doc(db, 'users', hostUid, 'activity_wall_activities', activityId)
  );
  if (!snap.exists()) throw new Error('activity wall not found');
  // Normalized first, so a wall predating the redesign reaches the sub with
  // the same derived layout and appearance the teacher sees.
  const data = normalizeActivityWallLibraryEntry(
    snap.id,
    snap.data() as Partial<ActivityWallLibraryEntry>
  );
  // Then field by field, never the normalizer's own object: it spreads the raw
  // doc, which carries the ClassLink class and roster ids the wall never draws,
  // and `content/` is broadly readable. The student posts are not bundled at
  // all — they are the students' own words.
  const entry: SubShareActivityWallView = {
    id: data.id,
    title: data.title,
    prompt: data.prompt,
    mode: data.mode,
    moderationEnabled: data.moderationEnabled,
    identificationMode: data.identificationMode,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    layout: data.layout,
    sections: data.sections,
    tableRows: data.tableRows,
    tableCols: data.tableCols,
    mapCenter: data.mapCenter,
    allowedTypes: data.allowedTypes,
    appearance: data.appearance,
    allowGuests: data.allowGuests,
    showNames: data.showNames,
    maxPostsPerStudent: data.maxPostsPerStudent,
    allowStudentEdit: data.allowStudentEdit,
    allowStudentDelete: data.allowStudentDelete,
    acceptingResponses: data.acceptingResponses,
    studentsCanSeePosts: data.studentsCanSeePosts,
    allowLikes: data.allowLikes,
    allowComments: data.allowComments,
    allowCommentResponses: data.allowCommentResponses,
  };
  return { entry, hostUid };
}

/** Calendar widgets with a personal Google Calendar the sub cannot read. */
function personalCalendarWidgets(board: Dashboard): WidgetData[] {
  return (board.widgets ?? []).filter((w) => {
    if (w.type !== 'calendar') return false;
    const ids = (w.config as CalendarConfig | undefined)?.personalCalendarIds;
    return Array.isArray(ids) && ids.length > 0;
  });
}

/** How far ahead a share reaches, per the plan's §3.3 Calendar row. */
const CALENDAR_BUNDLE_DAYS = 14;

async function bundleCalendar(
  widget: WidgetData,
  readCalendar: NonNullable<SubShareBundleServices['readCalendar']>
): Promise<SubShareCalendarPayload> {
  const ids =
    (widget.config as CalendarConfig | undefined)?.personalCalendarIds ?? [];
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start);
  end.setDate(start.getDate() + CALENDAR_BUNDLE_DAYS);
  const perCalendar = await Promise.all(
    ids.map((id) => readCalendar(id, start.toISOString(), end.toISOString()))
  );
  // Which calendar an event came from is the teacher's own business, so the
  // sub gets one flat list, as the widget already merges them for display.
  return { events: perCalendar.flat() };
}

export async function bundleSubShareContent({
  hostUid,
  boards,
  services,
}: {
  hostUid: string;
  boards: Dashboard[];
  services?: SubShareBundleServices;
}): Promise<SubShareBundle> {
  const items: SubShareBundleItem[] = [];
  const failures: SubShareBundleFailure[] = [];
  const bundledAt = Date.now();

  // One item shared by two boards is bundled once.
  const done = new Set<string>();

  for (const board of boards) {
    for (const widget of migratedDrawings(board)) {
      try {
        const payload = await bundleDrawing(hostUid, board, widget);
        items.push({
          id: subShareContentId('drawing', widget.id),
          doc: {
            kind: 'drawing',
            itemId: widget.id,
            bundledAt,
            payload,
          },
        });
      } catch (err) {
        logError('bundleSubShareContent.drawing', err, {
          boardId: board.id,
          widgetId: widget.id,
        });
        failures.push({
          kind: 'drawing',
          itemId: widget.id,
          label: `Drawing on ${board.name}`,
        });
      }
    }

    for (const id of openNotebookIds(board)) {
      const contentId = subShareContentId('notebook', id);
      if (done.has(contentId)) continue;
      done.add(contentId);
      try {
        const payload = await bundleNotebook(hostUid, id);
        items.push({
          id: contentId,
          doc: { kind: 'notebook', itemId: id, bundledAt, payload },
        });
      } catch (err) {
        logError('bundleSubShareContent.notebook', err, {
          boardId: board.id,
          notebookId: id,
        });
        failures.push({
          kind: 'notebook',
          itemId: id,
          label: `Notebook on ${board.name}`,
        });
      }
    }

    for (const id of openActivityWallIds(board)) {
      const contentId = subShareContentId('activityWall', id);
      if (done.has(contentId)) continue;
      done.add(contentId);
      try {
        const payload = await bundleActivityWall(hostUid, id);
        items.push({
          id: contentId,
          doc: { kind: 'activityWall', itemId: id, bundledAt, payload },
        });
      } catch (err) {
        logError('bundleSubShareContent.activityWall', err, {
          boardId: board.id,
          activityId: id,
        });
        failures.push({
          kind: 'activityWall',
          itemId: id,
          label: `Activity Wall on ${board.name}`,
        });
      }
    }

    for (const id of openProjectIds(board)) {
      const contentId = subShareContentId('project', id);
      if (done.has(contentId)) continue;
      done.add(contentId);
      try {
        const payload = await bundleProject(hostUid, id);
        items.push({
          id: contentId,
          doc: { kind: 'project', itemId: id, bundledAt, payload },
        });
      } catch (err) {
        logError('bundleSubShareContent.project', err, {
          boardId: board.id,
          projectId: id,
        });
        failures.push({
          kind: 'project',
          itemId: id,
          label: `Project on ${board.name}`,
        });
      }
    }

    for (const widget of personalCalendarWidgets(board)) {
      const readCalendar = services?.readCalendar;
      try {
        if (!readCalendar) throw new Error('no calendar reader');
        const payload = await bundleCalendar(widget, readCalendar);
        items.push({
          id: subShareContentId('calendar', widget.id),
          doc: { kind: 'calendar', itemId: widget.id, bundledAt, payload },
        });
      } catch (err) {
        logError('bundleSubShareContent.calendar', err, {
          boardId: board.id,
          widgetId: widget.id,
        });
        failures.push({
          kind: 'calendar',
          itemId: widget.id,
          label: `Calendar on ${board.name}`,
        });
      }
    }

    for (const id of customWidgetIds(board)) {
      const contentId = subShareContentId('customWidget', id);
      if (done.has(contentId)) continue;
      done.add(contentId);
      try {
        const payload = await bundleCustomWidget(id);
        items.push({
          id: contentId,
          doc: { kind: 'customWidget', itemId: id, bundledAt, payload },
        });
      } catch (err) {
        logError('bundleSubShareContent.customWidget', err, {
          boardId: board.id,
          customWidgetId: id,
        });
        failures.push({
          kind: 'customWidget',
          itemId: id,
          label: `Custom widget on ${board.name}`,
        });
      }
    }
  }

  return { items, failures };
}
