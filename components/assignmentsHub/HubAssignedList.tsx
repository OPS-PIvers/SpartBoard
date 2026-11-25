import React, { useContext, useEffect, useMemo, useState } from 'react';
import {
  pickedClassSizes,
  pickedStudents,
  type PickedStudents,
} from '@/utils/assignedStudents';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { tourFieldAttr, type TourAnchorAttrs } from '@/config/tourAnchors';
import { useAuth } from '@/context/useAuth';
import { useShowPickedStudents } from '@/hooks/useShowPickedStudents';
import { useDashboard } from '@/context/useDashboard';
import type {
  ClassRoster,
  FlashcardProgress,
  GuidedLearningResponse,
  QuizMetadata,
  StudentTargetRef,
  VideoActivityResponse,
  WritingResponse,
} from '@/types';
import {
  AssignedList,
  AssignedReopenDialog,
  AssignedRow,
  assignedMenu,
  mainActionLabel,
  type ClassActionKind,
} from '@/components/common/library/assigned';
import {
  QuizAssignedRowHost,
  useQuizAssignedRows,
  type QuizAssignedRowModel,
} from '@/components/widgets/QuizWidget/components/QuizAssignedTab';
import { useQuiz } from '@/hooks/useQuiz';
import { todaysBell } from '@/hooks/usePeriodAccess';
import { usePeriodRunner } from '@/hooks/usePeriodRunner';
import { useSetAssignmentTargets } from '@/hooks/useSetAssignmentTargets';
import {
  restoreRun,
  useAssignmentClassActions,
  type AssignmentClassCollections,
  type AssignmentLifecycle,
  type AssignmentRun,
} from '@/hooks/useAssignmentClassActions';
import {
  SESSIONS_COLLECTION_BY_KIND,
  SUBCOLLECTION_BY_KIND,
} from '@/hooks/useAssignmentRosterStatus';
import {
  VIDEO_ACTIVITY_RUN_COLLECTIONS,
  videoActivityLifecycle,
} from '@/components/widgets/VideoActivityWidget/videoActivityLifecycle';
import {
  MINI_APP_CLASS_COLLECTIONS,
  miniAppLifecycle,
} from '@/components/widgets/MiniApp/utils/miniAppClassLifecycle';
import {
  GL_CLASS_COLLECTIONS,
  guidedLearningLifecycle,
} from '@/components/widgets/GuidedLearning/utils/glClassLifecycle';
import {
  FLASHCARD_CLASS_COLLECTIONS,
  flashcardLifecycle,
} from '@/components/widgets/Flashcards/utils/flashcardClassLifecycle';
import {
  WRITING_CLASS_COLLECTIONS,
  writingLifecycle,
} from '@/components/widgets/Writing/utils/writingClassLifecycle';
import {
  deriveAssignedStatus,
  runStatus,
  type AssignedActionKind,
  type AssignedExtras,
  type AssignedInput,
  type AssignedResponse,
  type AssignedStatus,
} from '@/utils/assignedStatus';
import {
  flashcardAssignedInput,
  flashcardAssignedResponse,
  guidedLearningAssignedInput,
  guidedLearningAssignedResponse,
  miniAppAssignedInput,
  miniAppAssignedResponse,
  videoActivityAssignedInput,
  videoActivityAssignedResponse,
  writingAssignedInput,
  writingAssignedResponse,
} from '@/utils/assignedAdapters';
import { logError } from '@/utils/logError';
import {
  UnifiedAssignmentsFixture,
  type AssignmentKind,
  type UnifiedAssignmentRow,
  type UnifiedAssignmentSources,
} from './useUnifiedAssignments';

const HUB = 'assignments-hub';
/** The hub has no monitor or grader of its own, so its main button only lets a class in or shows the roster. */
const HUB_MAIN_KINDS: readonly AssignedActionKind[] = [
  'open',
  'resume',
  'monitor',
  'choose-class',
];

type OtherKind = Exclude<AssignmentKind, 'quiz'>;

/** A non-quiz assignment doc as the hub reads it. */
type OtherRun = AssignmentRun & {
  scoreVisibility?: string | null;
  sessionId?: string;
  rosterIds?: string[];
  resultsVersion?: number;
  targetMode?: 'class' | 'students';
  targetStudents?: StudentTargetRef[];
};

interface OtherRowModel {
  id: string;
  kind: OtherKind;
  title: string;
  status: AssignedStatus;
  run: OtherRun;
  picked: PickedStudents | null;
}

type HubItem =
  | { id: string; status: AssignedStatus; quiz: QuizAssignedRowModel }
  | { id: string; status: AssignedStatus; other: OtherRowModel };

/** Rows still being worked; mirrors the Quiz tab's live-data test for any kind. */
function wantsLiveData(run: OtherRun): boolean {
  const ended = runStatus(run.status) === 'inactive';
  const published = !!run.scoreVisibility && run.scoreVisibility !== 'none';
  if (ended && (run.doneAt != null || published)) return false;
  return (
    !ended ||
    run.closedAt != null ||
    Object.values(run.periodAccess ?? {}).some((r) => r.closedAt != null)
  );
}

/** A Mini App assigned to several classes: its submissions can't be placed in one. */
const miniAppByClass = (kind: OtherKind, run: OtherRun) =>
  kind === 'mini-app' && Object.keys(run.periodAccess ?? {}).length > 1;

const pathOf = (kind: OtherKind, sessionId: string) =>
  `${SESSIONS_COLLECTION_BY_KIND[kind]}/${sessionId}/${SUBCOLLECTION_BY_KIND[kind]}`;

/** Response docs per session path, one listener per live row. */
function useResponsesByPath(paths: readonly string[]) {
  const key = paths.join('|');
  const [byPath, setByPath] = useState<Record<string, unknown[]>>({});
  const [subs] = useState(() => new Map<string, () => void>());
  useEffect(() => {
    const wanted = new Set(key ? key.split('|') : []);
    for (const [p, unsub] of subs)
      if (!wanted.has(p)) {
        unsub();
        subs.delete(p);
      }
    for (const p of wanted) {
      if (subs.has(p)) continue;
      subs.set(
        p,
        onSnapshot(
          collection(db, p),
          (snap) =>
            setByPath((prev) => ({
              ...prev,
              [p]: snap.docs.map((d) => d.data()),
            })),
          (err) => {
            logError('HubAssignedList.responses', err, { path: p });
            setByPath((prev) => ({ ...prev, [p]: [] }));
          }
        )
      );
    }
  }, [key, subs]);
  useEffect(
    () => () => {
      for (const unsub of subs.values()) unsub();
      subs.clear();
    },
    [subs]
  );
  return byPath;
}

/** One kind's responses as the row counts them, plus how many await a grade (null when unknown). */
function tally(
  kind: OtherKind,
  docs: readonly unknown[],
  /** The one class a Mini App's classless submissions belong to, when it has just one. */
  onlyClass?: string
): { responses: AssignedResponse[]; needsGrading: number | null } {
  switch (kind) {
    case 'video-activity': {
      const responses = (docs as VideoActivityResponse[]).map(
        videoActivityAssignedResponse
      );
      // Written answers need the questions to tell; the Video Activity tab owns that count.
      return {
        responses,
        needsGrading: responses.some((r) => r.submitted) ? null : 0,
      };
    }
    case 'guided-learning':
      return {
        responses: (docs as GuidedLearningResponse[]).map(
          guidedLearningAssignedResponse
        ),
        needsGrading: 0,
      };
    case 'mini-app':
      return {
        responses: docs.map(() => miniAppAssignedResponse(onlyClass)),
        needsGrading: 0,
      };
    case 'flashcards':
      return {
        responses: (docs as FlashcardProgress[]).map(flashcardAssignedResponse),
        needsGrading: 0,
      };
    case 'writing':
      return {
        responses: (docs as WritingResponse[]).map(writingAssignedResponse),
        needsGrading: (docs as WritingResponse[]).filter(
          (r) => r.status === 'turned-in'
        ).length,
      };
  }
}

interface HubAssignedListProps {
  /** The hub's filtered rows; the list keeps their order of kinds and ids only. */
  rows: readonly UnifiedAssignmentRow[];
  sources: UnifiedAssignmentSources;
  loading: boolean;
  rosters: ClassRoster[];
  selectedId: string | null;
  /** `open` asks for the roster too, which a phone shows in place of the list. */
  onSelect: (id: string, open?: boolean) => void;
  /** The kind's name, shown after each row's status line. */
  kindLabel: (kind: AssignmentKind) => string;
}

const KindMeta: React.FC<{ label: string }> = ({ label }) => (
  <span className="whitespace-nowrap text-slate-500">· {label}</span>
);

/** The Assignments hub's Assigned list: every kind on the shared rows (ASSIGNED_TAB.md D18). */
export const HubAssignedList: React.FC<HubAssignedListProps> = ({
  rows,
  sources,
  loading,
  rosters,
  selectedId,
  onSelect,
  kindLabel,
}) => {
  const { user, featurePermissions } = useAuth();
  const showPicked = useShowPickedStudents();
  const uid = user?.uid;
  const fixture = useContext(UnifiedAssignmentsFixture);
  const library = useQuiz(fixture ? undefined : uid);
  const quizzes = fixture?.quizzes ?? library.quizzes;
  const loadQuizData = fixture?.loadQuizData ?? library.loadQuizData;
  const loadQuiz = useMemo(
    () => (meta: QuizMetadata) => loadQuizData(meta.driveFileId),
    [loadQuizData]
  );
  const { rows: quizRows, now } = useQuizAssignedRows(
    sources.quiz.assignments,
    quizzes,
    loadQuiz,
    rosters
  );

  const runs = useMemo(() => {
    const out: {
      kind: OtherKind;
      title: string;
      run: OtherRun;
      adapt: (extras: AssignedExtras) => AssignedInput;
    }[] = [];
    for (const a of sources.videoActivity.assignments)
      out.push({
        kind: 'video-activity',
        title: a.activityTitle,
        run: a,
        adapt: (x) => videoActivityAssignedInput(a, x),
      });
    for (const a of sources.guidedLearning.assignments)
      out.push({
        kind: 'guided-learning',
        title: a.setTitle,
        run: a,
        adapt: (x) => guidedLearningAssignedInput(a, x),
      });
    for (const a of sources.miniApp.assignments)
      out.push({
        kind: 'mini-app',
        title: a.assignmentName?.trim() ? a.assignmentName : a.appTitle,
        run: a,
        adapt: (x) => miniAppAssignedInput(a, x),
      });
    for (const a of sources.flashcards.assignments)
      out.push({
        kind: 'flashcards',
        title: a.setTitle,
        run: a,
        adapt: (x) => flashcardAssignedInput(a, x),
      });
    for (const a of sources.writing.records)
      out.push({
        kind: 'writing',
        title: a.title,
        run: a,
        // Grading lives on the session, which the hub doesn't load, so a closed row stays Active.
        adapt: (x) => writingAssignedInput(a, null, x),
      });
    return out;
  }, [
    sources.videoActivity.assignments,
    sources.guidedLearning.assignments,
    sources.miniApp.assignments,
    sources.flashcards.assignments,
    sources.writing.records,
  ]);

  const livePaths = useMemo(
    () =>
      runs
        .filter((r) => wantsLiveData(r.run))
        .map((r) => pathOf(r.kind, r.run.sessionId ?? r.run.id)),
    [runs]
  );
  const responsesByPath = useResponsesByPath(livePaths);

  const otherRows = useMemo<OtherRowModel[]>(
    () =>
      runs.map(({ kind, title, run, adapt }) => {
        const docs = wantsLiveData(run)
          ? (responsesByPath[pathOf(kind, run.sessionId ?? run.id)] ?? null)
          : [];
        const classKeys = Object.keys(run.periodAccess ?? {});
        const counted = docs
          ? tally(kind, docs, classKeys.length === 1 ? classKeys[0] : undefined)
          : null;
        // Submissions carry no class, so a scored per-class Mini App can't tell what's turned in.
        if (counted && miniAppByClass(kind, run) && run.resultsVersion === 2)
          counted.needsGrading = docs && docs.length > 0 ? null : 0;
        const sizeOf = (rosterId: string | undefined) => {
          const r = rosters.find((x) => x.id === rosterId);
          return r && r.students.length > 0 ? r.students.length : undefined;
        };
        const classSizes: Record<string, number> = {};
        for (const [k, row] of Object.entries(run.periodAccess ?? {})) {
          const n = sizeOf(row.rosterId ?? k);
          if (n != null) classSizes[k] = n;
        }
        if (run.rosterIds?.length === 1) {
          const n = sizeOf(run.rosterIds[0]);
          if (n != null) classSizes[''] = n;
        }
        const picked = pickedStudents(run, rosters);
        const extras: AssignedExtras = {
          responses: counted?.responses ?? null,
          needsGrading: counted?.needsGrading ?? null,
          classSizes:
            picked && showPicked
              ? pickedClassSizes(picked, run.periodAccess)
              : classSizes,
          bellFor: (access) =>
            todaysBell(access, rosters, featurePermissions, now),
        };
        const input = adapt(extras);
        return {
          id: run.id,
          kind,
          title,
          run,
          status: deriveAssignedStatus(input, now),
          picked,
        };
      }),
    [runs, responsesByPath, rosters, featurePermissions, showPicked, now]
  );

  const items = useMemo<HubItem[]>(() => {
    const quizById = new Map(quizRows.map((r) => [r.id, r]));
    const otherByKey = new Map(otherRows.map((r) => [`${r.kind}:${r.id}`, r]));
    const out: HubItem[] = [];
    for (const row of rows) {
      if (row.kind === 'quiz') {
        const q = quizById.get(row.id);
        if (q) out.push({ id: `quiz:${q.id}`, status: q.status, quiz: q });
      } else {
        const o = otherByKey.get(`${row.kind}:${row.id}`);
        if (o)
          out.push({ id: `${o.kind}:${o.id}`, status: o.status, other: o });
      }
    }
    return out;
  }, [rows, quizRows, otherRows]);

  const quizLifecycle = useMemo(
    () => ({
      pauseAssignment: sources.quiz.pauseAssignment,
      resumeAssignment: sources.quiz.resumeAssignment,
      deactivateAssignment: sources.quiz.deactivateAssignment,
      reopenAssignment: sources.quiz.reopenAssignment,
    }),
    [
      sources.quiz.pauseAssignment,
      sources.quiz.resumeAssignment,
      sources.quiz.deactivateAssignment,
      sources.quiz.reopenAssignment,
    ]
  );
  const { setAssignmentTargets } = useSetAssignmentTargets();
  const va = sources.videoActivity;
  const vaLifecycle = useMemo(
    () => videoActivityLifecycle(va),
    // The hook's writes are stable callbacks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      va.pauseAssignment,
      va.resumeAssignment,
      va.deactivateAssignment,
      va.reactivateAssignment,
    ]
  );
  const { endAssignment, reactivateAssignment } = sources.miniApp;
  const { archiveAssignment } = sources.guidedLearning;
  const fc = sources.flashcards;
  const kindActions = useMemo<
    Partial<
      Record<
        OtherKind,
        {
          collections: AssignmentClassCollections;
          lifecycle: AssignmentLifecycle;
        }
      >
    >
  >(
    () => ({
      'video-activity': {
        collections: VIDEO_ACTIVITY_RUN_COLLECTIONS,
        lifecycle: vaLifecycle,
      },
      ...(uid
        ? {
            'mini-app': {
              collections: MINI_APP_CLASS_COLLECTIONS,
              lifecycle: miniAppLifecycle(uid, {
                endAssignment,
                reactivateAssignment,
                setAssignmentTargets,
              }),
            },
            'guided-learning': {
              collections: GL_CLASS_COLLECTIONS,
              lifecycle: guidedLearningLifecycle(uid, {
                archiveAssignment,
                setAssignmentTargets,
              }),
            },
            flashcards: {
              collections: FLASHCARD_CLASS_COLLECTIONS,
              lifecycle: flashcardLifecycle(uid, {
                endAssignment: fc.endAssignment,
                reopenAssignment: fc.reopenAssignment,
                setAssignmentTargets,
              }),
            },
            writing: {
              collections: WRITING_CLASS_COLLECTIONS,
              lifecycle: writingLifecycle(uid, { setAssignmentTargets }),
            },
          }
        : {}),
    }),
    [
      uid,
      vaLifecycle,
      endAssignment,
      reactivateAssignment,
      archiveAssignment,
      fc.endAssignment,
      fc.reopenAssignment,
      setAssignmentTargets,
    ]
  );

  const pick = (id: string) => () => onSelect(id);
  const monitor = (id: string) => () => onSelect(id, true);
  // The old list's row anchor carries over to each row's title (it opens the detail pane).
  const rowAnchor = (index: number) =>
    tourFieldAttr('assignments-hub.row', HUB, `row-${index + 1}`);

  return (
    <AssignedList<HubItem>
      items={items}
      titleOf={(i) =>
        'quiz' in i ? i.quiz.assignment.quizTitle : i.other.title
      }
      loading={loading}
      emptyTitle="Nothing active"
      emptySub=""
      tourWidgetType={HUB}
      renderRow={(item, index) =>
        'quiz' in item ? (
          <QuizAssignedRowHost
            row={item.quiz}
            index={index}
            now={now}
            rosters={rosters}
            lifecycle={quizLifecycle}
            onMonitor={monitor(item.quiz.id)}
            onResults={monitor(item.quiz.id)}
            legacyPrimary={() => null}
            menu={() => []}
            tourWidgetType={HUB}
            mainKinds={HUB_MAIN_KINDS}
            meta={<KindMeta label={kindLabel('quiz')} />}
            selected={selectedId === item.quiz.id}
            onSelect={pick(item.quiz.id)}
            selectAnchor={rowAnchor(index)}
          />
        ) : (
          <OtherRowHost
            row={item.other}
            index={index}
            now={now}
            rosters={rosters}
            actions={kindActions[item.other.kind] ?? null}
            meta={<KindMeta label={kindLabel(item.other.kind)} />}
            selected={selectedId === item.other.id}
            onSelect={pick(item.other.id)}
            onMonitor={monitor(item.other.id)}
            selectAnchor={rowAnchor(index)}
          />
        )
      }
    />
  );
};

const NO_COLLECTIONS: AssignmentClassCollections = {
  sessionCollection: '',
  assignmentCollection: '',
};
const NO_LIFECYCLE: AssignmentLifecycle = {
  end: () => Promise.resolve(),
  reopen: () => Promise.resolve(),
};

interface OtherRowHostProps {
  row: OtherRowModel;
  index: number;
  now: number;
  rosters: ClassRoster[];
  /** Null where a kind has none: the row shows status only. */
  actions: {
    collections: AssignmentClassCollections;
    lifecycle: AssignmentLifecycle;
  } | null;
  meta: React.ReactNode;
  selected: boolean;
  onSelect: () => void;
  onMonitor: () => void;
  selectAnchor: TourAnchorAttrs;
}

/** A Video Activity, Guided Learning, Mini App, Flashcards or Writing row in the hub. */
const OtherRowHost: React.FC<OtherRowHostProps> = ({
  row,
  index,
  now,
  rosters,
  actions,
  meta,
  selected,
  onSelect,
  onMonitor,
  selectAnchor,
}) => {
  const { status, run, title, kind } = row;
  const { addToast } = useDashboard();
  const { user } = useAuth();
  const uid = user?.uid;
  const classActions = useAssignmentClassActions(
    actions ? run : null,
    actions?.collections ?? NO_COLLECTIONS,
    actions?.lifecycle ?? NO_LIFECYCLE,
    rosters
  );
  const hasActions = actions != null;
  // Puts the row back as it was before a Close or Move to Finished.
  const undo = (prev: OtherRun, closeOnly: boolean): Promise<void> | void => {
    // A Writing Close puts back its saved marks; other kinds just let the class back in.
    if (closeOnly && kind !== 'writing')
      return classActions.reopenClass(null).then(() => undefined);
    if (uid && actions)
      return restoreRun(prev, uid, actions.collections, actions.lifecycle);
  };
  const exec = usePeriodRunner('HubAssignedList.class');
  const [busy, setBusy] = useState(false);
  const runBusy = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await exec(fn);
    } finally {
      setBusy(false);
    }
  };

  const onClassAction = (kind: ClassActionKind, key: string | null) => {
    if (kind === 'monitor' || !hasActions) return onMonitor();
    switch (kind) {
      case 'open':
      case 'resume':
        return void runBusy(() => classActions.openClass(key));
      case 'pause':
        return void runBusy(() => classActions.pauseClass(key));
      case 'close':
        if (key == null) return closeSingle();
        return void runBusy(() => classActions.closeClass(key));
      case 'reopen':
        return void runBusy(() => classActions.reopenClass(key));
    }
  };

  const [reopening, setReopening] = useState(false);
  // A single-line Close is the whole assignment, so it offers Undo.
  const closeSingle = () =>
    void runBusy(async () => {
      const prev = run;
      await classActions.closeClass(null);
      addToast(`${title} is closed.`, 'success', {
        label: 'Undo',
        onClick: () => void exec(async () => undo(prev, true)),
      });
    });
  // Close for all classes or Move to Finished, with Undo.
  const closeWithUndo = (moveToDone: boolean) => {
    const prev = run;
    void runBusy(async () => {
      await (moveToDone ? classActions.moveToDone() : classActions.closeAll());
      addToast(
        moveToDone
          ? `${title} moved to Finished.`
          : `${title} is closed for all classes.`,
        'success',
        {
          label: 'Undo',
          onClick: () => void exec(async () => undo(prev, false)),
        }
      );
    });
  };
  const viewOnly = status.line.kind === 'view-only';
  // D5/D10: a row whose grading the hub can't count still has a way out of Active.
  const menuActions = hasActions
    ? assignedMenu({
        status,
        viewOnly,
        items: [],
        published: false,
        onCloseAll: () => closeWithUndo(false),
        onMoveToDone: () => closeWithUndo(true),
        onReopen: viewOnly
          ? () => onClassAction('reopen', null)
          : () => setReopening(true),
        tourWidgetType: HUB,
        busy,
      })
    : [];

  const acts =
    HUB_MAIN_KINDS.includes(status.action.kind) &&
    (hasActions || status.action.kind === 'monitor');
  const onMain = () => {
    const { kind, classKey } = status.action;
    if (kind === 'open' || kind === 'resume') onClassAction(kind, classKey);
    else onMonitor();
  };

  return (
    <>
      {reopening && (
        <AssignedReopenDialog
          title={title}
          status={status}
          onReopen={(key) => runBusy(() => classActions.reopenClass(key))}
          onClose={() => setReopening(false)}
        />
      )}
      <AssignedRow
        title={title}
        status={status}
        nowMs={now}
        mainLabel={acts ? mainActionLabel(status.action, null) : null}
        onMain={onMain}
        onClassAction={onClassAction}
        classControls={hasActions}
        canPause={!!actions?.lifecycle.pause}
        meta={meta}
        menuActions={menuActions}
        busy={busy}
        tourIndex={index}
        tourWidgetType={HUB}
        selected={selected}
        onSelect={onSelect}
        selectAnchor={selectAnchor}
        hideCounts={miniAppByClass(row.kind, run)}
        picked={row.picked}
        periodAccess={run.periodAccess}
      />
    </>
  );
};
