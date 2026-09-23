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
  FlashcardSet,
  FlashcardsConfig,
  GuidedLearningConfig,
  GuidedLearningSet,
  GuidedLearningSetMetadata,
  GuidedLearningStep,
  NotebookItem,
  ProjectGroup,
  ProjectRun,
  ProjectsConfig,
  QuizConfig,
  QuizData,
  SmartNotebookConfig,
  SubShareActivityWallPayload,
  SubShareActivityWallView,
  SubShareCalendarPayload,
  SubShareContentDoc,
  SubShareContentKind,
  SubShareCustomWidgetPayload,
  SubShareDrawingPayload,
  SubShareFlashcardPayload,
  SubShareFlashcardSetView,
  SubShareGuidedLearningPayload,
  SubShareGuidedLearningView,
  SubShareNotebookPayload,
  SubShareProjectGroupView,
  SubShareProjectPayload,
  SubShareQuizPayload,
  SubShareQuizView,
  SubShareVideoActivityPayload,
  SubShareVideoActivityView,
  VideoActivityConfig,
  VideoActivityData,
  VideoActivityMetadata,
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
  /** Answer keys and full activity copies, for `keys/` rather than `content/`. */
  keys: SubShareBundleItem[];
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
  /** Reads a video activity's JSON out of the teacher's own Drive. */
  loadVideoActivity?: (driveFileId: string) => Promise<VideoActivityData>;
  /** Reads a guided learning set's JSON out of the teacher's own Drive. */
  loadGuidedLearningSet?: (driveFileId: string) => Promise<GuidedLearningSet>;
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

/** The set each Flashcards widget on the board is presenting. */
function presentedFlashcardSetIds(board: Dashboard): string[] {
  const ids: string[] = [];
  for (const widget of board.widgets ?? []) {
    if (widget.type !== 'flashcards') continue;
    const id = (widget.config as FlashcardsConfig | undefined)?.presentSetId;
    if (id) ids.push(id);
  }
  return ids;
}

async function bundleFlashcardSet(
  hostUid: string,
  setId: string
): Promise<SubShareFlashcardPayload> {
  const snap = await getDoc(doc(db, 'users', hostUid, 'flashcard_sets', setId));
  if (!snap.exists()) throw new Error('flashcard set not found');
  const data = snap.data() as Partial<FlashcardSet>;
  // Field by field, not a spread: the raw doc carries `publicShareId`, a link
  // anyone holding the share could then open, and `content/` is broadly
  // readable.
  const set: SubShareFlashcardSetView = {
    id: snap.id,
    title: data.title ?? 'Untitled set',
    termLanguage: data.termLanguage ?? 'en',
    definitionLanguage: data.definitionLanguage ?? 'en',
    cards: data.cards ?? [],
    ...(data.description ? { description: data.description } : {}),
  };
  return { set };
}

/**
 * Whether any board carries a personal-calendar widget, so a share with none
 * does not pay for a token round-trip it will never use.
 */
export function subShareNeedsCalendar(boards: Dashboard[]): boolean {
  return boards.some((board) => personalCalendarWidgets(board).length > 0);
}

/** Whether any board carries a video activity whose JSON needs a Drive read. */
export function subShareNeedsDrive(boards: Dashboard[]): boolean {
  return boards.some(
    (board) =>
      openVideoActivityIds(board).length > 0 ||
      openGuidedLearningSetIds(board).length > 0
  );
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

/** The quiz each Quiz widget on the board has open. */
function openQuizIds(board: Dashboard): string[] {
  const ids: string[] = [];
  for (const widget of board.widgets ?? []) {
    if (widget.type !== 'quiz') continue;
    const id = (widget.config as QuizConfig | undefined)?.selectedQuizId;
    if (id) ids.push(id);
  }
  return ids;
}

/**
 * The teacher's quiz, field by field. The raw doc carries the PLC linkage,
 * sync state and bank slots pointing at banks the sub cannot read, and this
 * one lands in `keys/`, so only what a sub reads off the screen travels.
 */
async function bundleQuiz(
  hostUid: string,
  quizId: string
): Promise<SubShareQuizPayload> {
  const snap = await getDoc(doc(db, 'users', hostUid, 'quizzes', quizId));
  if (!snap.exists()) throw new Error('quiz not found');
  const data = snap.data() as Partial<QuizData>;
  const quiz: SubShareQuizView = {
    id: snap.id,
    title: data.title ?? 'Quiz',
    questions: data.questions ?? [],
    createdAt: data.createdAt ?? 0,
    updatedAt: data.updatedAt ?? 0,
    ...(data.stimuli ? { stimuli: data.stimuli } : {}),
    ...(data.language ? { language: data.language } : {}),
  };
  return { quiz };
}

/** The video activity each Video Activity widget on the board has open. */
function openVideoActivityIds(board: Dashboard): string[] {
  const ids: string[] = [];
  for (const widget of board.widgets ?? []) {
    if (widget.type !== 'video-activity') continue;
    const id = (widget.config as VideoActivityConfig | undefined)
      ?.selectedActivityId;
    if (id) ids.push(id);
  }
  return ids;
}

/**
 * The teacher's video activity. Firestore holds only metadata, so the
 * questions come from the JSON file in the teacher's own Drive, which is why
 * this one needs a reader passed in. Copied field by field: the raw metadata
 * carries the PLC sync linkage and the folder it sits in, and the raw Drive
 * blob is whatever an older client wrote.
 */
async function bundleVideoActivity(
  hostUid: string,
  activityId: string,
  loadVideoActivity: NonNullable<SubShareBundleServices['loadVideoActivity']>
): Promise<SubShareVideoActivityPayload> {
  const snap = await getDoc(
    doc(db, 'users', hostUid, 'video_activities', activityId)
  );
  if (!snap.exists()) throw new Error('video activity not found');
  const meta = snap.data() as Partial<VideoActivityMetadata>;
  if (!meta.driveFileId) throw new Error('video activity has no Drive file');
  const data = await loadVideoActivity(meta.driveFileId);
  const activity: SubShareVideoActivityView = {
    id: snap.id,
    title: data.title ?? meta.title ?? 'Video activity',
    youtubeUrl: data.youtubeUrl ?? meta.youtubeUrl ?? '',
    questions: data.questions ?? [],
    createdAt: data.createdAt ?? meta.createdAt ?? 0,
    updatedAt: data.updatedAt ?? meta.updatedAt ?? 0,
    ...(data.videoDuration ? { videoDuration: data.videoDuration } : {}),
  };
  return { activity };
}

/** The guided learning set each Guided Learning widget has open in its player. */
function openGuidedLearningSetIds(board: Dashboard): string[] {
  const ids: string[] = [];
  for (const widget of board.widgets ?? []) {
    if (widget.type !== 'guided-learning') continue;
    const id = (widget.config as GuidedLearningConfig | undefined)?.playerSetId;
    if (id) ids.push(id);
  }
  return ids;
}

/** A step without the live-tour binding, which `types.ts` calls teacher-only. */
function stepForSub(
  step: GuidedLearningStep
): Omit<GuidedLearningStep, 'tour'> {
  const { tour: _tour, ...rest } = step;
  return rest;
}

/**
 * The teacher's guided learning set, answers included: it lands in `keys/`,
 * which only the subs this share names may read, and a sub covering the lesson
 * needs to know what is right — the same call the Quiz and Video Activity
 * slices make. Firestore holds only metadata, so the set itself comes from the
 * teacher's Drive. A building set is not bundled at all: it lives in a
 * top-level collection any signed-in user can read, so the sub reads it
 * directly as they do today.
 */
async function bundleGuidedLearning(
  hostUid: string,
  setId: string,
  loadSet: NonNullable<SubShareBundleServices['loadGuidedLearningSet']>
): Promise<SubShareGuidedLearningPayload | null> {
  const snap = await getDoc(
    doc(db, 'users', hostUid, 'guided_learning', setId)
  );
  if (!snap.exists()) {
    const building = await getDoc(doc(db, 'building_guided_learning', setId));
    if (building.exists()) return null;
    throw new Error('guided learning set not found');
  }
  const meta = snap.data() as Partial<GuidedLearningSetMetadata>;
  if (!meta.driveFileId)
    throw new Error('guided learning set has no Drive file');
  const data = await loadSet(meta.driveFileId);
  const {
    authorUid: _authorUid,
    imagePaths: _imagePaths,
    steps,
    ...rest
  } = data;
  const set: SubShareGuidedLearningView = {
    ...rest,
    id: snap.id,
    title: data.title ?? meta.title ?? 'Guided activity',
    steps: (steps ?? []).map(stepForSub),
  };
  return { set };
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
  const keys: SubShareBundleItem[] = [];
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

    for (const id of presentedFlashcardSetIds(board)) {
      const contentId = subShareContentId('flashcards', id);
      if (done.has(contentId)) continue;
      done.add(contentId);
      try {
        const payload = await bundleFlashcardSet(hostUid, id);
        items.push({
          id: contentId,
          doc: { kind: 'flashcards', itemId: id, bundledAt, payload },
        });
      } catch (err) {
        logError('bundleSubShareContent.flashcards', err, {
          boardId: board.id,
          setId: id,
        });
        failures.push({
          kind: 'flashcards',
          itemId: id,
          label: `Flashcards on ${board.name}`,
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

    for (const id of openQuizIds(board)) {
      const contentId = subShareContentId('quiz', id);
      if (done.has(contentId)) continue;
      done.add(contentId);
      try {
        const payload = await bundleQuiz(hostUid, id);
        keys.push({
          id: contentId,
          doc: { kind: 'quiz', itemId: id, bundledAt, payload },
        });
      } catch (err) {
        logError('bundleSubShareContent.quiz', err, {
          boardId: board.id,
          quizId: id,
        });
        failures.push({
          kind: 'quiz',
          itemId: id,
          label: `Quiz on ${board.name}`,
        });
      }
    }

    for (const id of openVideoActivityIds(board)) {
      const contentId = subShareContentId('videoActivity', id);
      if (done.has(contentId)) continue;
      done.add(contentId);
      try {
        if (!services?.loadVideoActivity) {
          throw new Error('no Drive reader for video activities');
        }
        const payload = await bundleVideoActivity(
          hostUid,
          id,
          services.loadVideoActivity
        );
        keys.push({
          id: contentId,
          doc: { kind: 'videoActivity', itemId: id, bundledAt, payload },
        });
      } catch (err) {
        logError('bundleSubShareContent.videoActivity', err, {
          boardId: board.id,
          activityId: id,
        });
        failures.push({
          kind: 'videoActivity',
          itemId: id,
          label: `Video activity on ${board.name}`,
        });
      }
    }

    for (const id of openGuidedLearningSetIds(board)) {
      const contentId = subShareContentId('guidedLearning', id);
      if (done.has(contentId)) continue;
      done.add(contentId);
      try {
        if (!services?.loadGuidedLearningSet) {
          throw new Error('no Drive reader for guided learning');
        }
        const payload = await bundleGuidedLearning(
          hostUid,
          id,
          services.loadGuidedLearningSet
        );
        // A building set bundles to nothing on purpose; the sub reads it.
        if (!payload) continue;
        keys.push({
          id: contentId,
          doc: { kind: 'guidedLearning', itemId: id, bundledAt, payload },
        });
      } catch (err) {
        logError('bundleSubShareContent.guidedLearning', err, {
          boardId: board.id,
          setId: id,
        });
        failures.push({
          kind: 'guidedLearning',
          itemId: id,
          label: `Guided activity on ${board.name}`,
        });
      }
    }
  }

  return { items, keys, failures };
}
