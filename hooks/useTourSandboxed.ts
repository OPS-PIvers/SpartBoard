import { useEffect, useLayoutEffect, useRef } from 'react';
import type {
  ActivityWallLibraryEntry,
  GuidedLearningAssignment,
  GuidedLearningSet,
  GuidedLearningSetMetadata,
  MiniAppItem,
  QuizData,
  QuizMetadata,
  TourMaterialContent,
  TourMaterialKind,
  VideoActivityData,
  VideoActivityMetadata,
} from '@/types';
import {
  fakeJoinCode,
  isSandboxed,
  mergeSandboxList,
  registerSandboxKeeper,
  sandboxApi,
  sandboxFind,
  sandboxGet,
  sandboxId,
  sandboxPut,
  sandboxRemove,
  useTourSandbox,
} from '@/utils/tourSandbox';
import type { UseQuizResult } from './useQuiz';
import type { UseVideoActivityResult } from './useVideoActivity';
import type { UseGuidedLearningResult } from './useGuidedLearning';
import type { UseActivityWallLibraryResult } from './useActivityWallLibrary';
import type { UseQuizAssignmentsResult } from './useQuizAssignments';
import type { UseVideoActivitySessionTeacherResult } from './useVideoActivitySession';
import type { UseVideoActivityAssignmentsResult } from './useVideoActivityAssignments';
import type { UseGuidedLearningSessionTeacherResult } from './useGuidedLearningSession';
import type { UseGuidedLearningAssignmentsResult } from './useGuidedLearningAssignments';
import type { UseMiniAppSessionTeacherResult } from './useMiniAppSession';
import type { UseMiniAppAssignmentsResult } from './useMiniAppAssignments';

const SANDBOX_FILE = 'sandbox:';
const asRecord = (v: object) => v as unknown as Record<string, unknown>;
const origin = () =>
  typeof window === 'undefined' ? '' : window.location.origin;

/** Registers a widget's real save so a teacher can keep a tour's item. */
const useKeeper = (
  kind: TourMaterialKind,
  keep: (content: TourMaterialContent) => Promise<void>
) => {
  const ref = useRef(keep);
  useLayoutEffect(() => {
    ref.current = keep;
  });
  useEffect(
    () => registerSandboxKeeper(kind, (content) => ref.current(content)),
    [kind]
  );
};

/** Content from the sandbox, else the real library. */
const loadEither = async <D>(
  kind: TourMaterialKind,
  driveFileId: string,
  real: (id: string) => Promise<D>
): Promise<D> => {
  const hit = sandboxFind(kind, (m) => m.driveFileId === driveFileId);
  return hit ? (hit[1].data as unknown as D) : real(driveFileId);
};

/** A sandbox entry for an item saved during the tour; real items become copies. */
const putDriveItem = <M extends { id: string; driveFileId: string }>(
  kind: TourMaterialKind,
  meta: M,
  data: object,
  realIds: ReadonlySet<string>
): M => {
  sandboxPut(
    kind,
    meta.id,
    { meta: asRecord(meta), data: asRecord(data) },
    realIds.has(meta.id) ? 'copy' : 'created'
  );
  return meta;
};

/** The library entry a sandboxed quiz save would have written. */
const quizMetaOf = (
  quiz: QuizData,
  real: readonly QuizMetadata[]
): QuizMetadata => {
  const prev =
    (sandboxGet('quiz', quiz.id)?.meta as unknown as
      | QuizMetadata
      | undefined) ?? real.find((q) => q.id === quiz.id);
  const now = Date.now();
  return {
    ...prev,
    id: quiz.id,
    title: quiz.title,
    driveFileId: prev?.driveFileId ?? `${SANDBOX_FILE}${quiz.id}`,
    questionCount: quiz.questions.length,
    createdAt: prev?.createdAt ?? now,
    updatedAt: now,
  };
};

const activityMetaOf = (
  a: VideoActivityData,
  real: readonly VideoActivityMetadata[]
): VideoActivityMetadata => {
  const prev =
    (sandboxGet('video-activity', a.id)?.meta as unknown as
      | VideoActivityMetadata
      | undefined) ?? real.find((x) => x.id === a.id);
  const now = Date.now();
  return {
    ...prev,
    id: a.id,
    title: a.title,
    youtubeUrl: a.youtubeUrl,
    driveFileId: prev?.driveFileId ?? `${SANDBOX_FILE}${a.id}`,
    questionCount: a.questions.length,
    createdAt: prev?.createdAt ?? now,
    updatedAt: now,
  };
};

const setMetaOf = (
  set: GuidedLearningSet,
  real: readonly GuidedLearningSetMetadata[]
): GuidedLearningSetMetadata => {
  const prev =
    (sandboxGet('guided-learning', set.id)?.meta as unknown as
      | GuidedLearningSetMetadata
      | undefined) ?? real.find((s) => s.id === set.id);
  const now = Date.now();
  return {
    ...prev,
    id: set.id,
    title: set.title,
    stepCount: set.steps.length,
    mode: set.mode,
    imageUrl: set.imageUrls[0] ?? '',
    driveFileId: prev?.driveFileId ?? `${SANDBOX_FILE}${set.id}`,
    createdAt: prev?.createdAt ?? now,
    updatedAt: now,
  };
};

/** Assignments made during this tour on a teacher's picked material; their writes are real. */
const realTourAssignments = new Set<string>();
const keepReal = <R>(id: string | undefined, result: R): R => {
  if (id) realTourAssignments.add(id);
  return result;
};

type AnyFn = (...args: unknown[]) => unknown;

/** Calls on an assignment run only when its material is one the teacher picked for the tour. */
const guardAssignmentCalls = <T extends object>(
  api: T,
  materialOf: (assignmentId: string) => string | undefined,
  keys: readonly (keyof T & string)[],
  fallbacks: Partial<Record<keyof T, unknown>> = {}
): Partial<T> =>
  Object.fromEntries(
    keys.map((key) => {
      const fn = api[key] as unknown as AnyFn;
      const guarded = (...args: unknown[]) => {
        const id = typeof args[0] === 'string' ? args[0] : '';
        const real =
          realTourAssignments.has(id) || !isSandboxed(materialOf(id));
        return real ? fn(...args) : Promise.resolve(fallbacks[key]);
      };
      return [key, guarded];
    })
  ) as unknown as Partial<T>;

const fakeGlAssignment = (
  input: { sessionId: string; setId: string; setTitle: string },
  teacherUid: string | undefined
): GuidedLearningAssignment => {
  const now = Date.now();
  return {
    id: input.sessionId,
    sessionId: input.sessionId,
    setId: input.setId,
    setTitle: input.setTitle,
    teacherUid: teacherUid ?? '',
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };
};

export function useSandboxedQuiz(api: UseQuizResult): UseQuizResult {
  const sandbox = useTourSandbox();
  useKeeper('quiz', async ({ data }) => {
    await api.saveQuiz({
      ...(data as unknown as QuizData),
      id: crypto.randomUUID(),
    });
  });
  if (!sandbox.active) return api;
  const realIds = new Set(api.quizzes.map((q) => q.id));
  const metaOf = (quiz: QuizData) => quizMetaOf(quiz, api.quizzes);
  return sandboxApi(api, {
    quizzes: mergeSandboxList(api.quizzes, 'quiz', sandbox),
    saveQuiz: (quiz, fileId, behavior) =>
      isSandboxed(quiz.id)
        ? Promise.resolve(putDriveItem('quiz', metaOf(quiz), quiz, realIds))
        : api.saveQuiz(quiz, fileId, behavior),
    loadQuizData: (fileId) => loadEither('quiz', fileId, api.loadQuizData),
    saveDriveSnapshot: () => Promise.resolve(`${SANDBOX_FILE}${sandboxId()}`),
    deleteQuiz: (id, fileId) => {
      if (!isSandboxed(id)) return api.deleteQuiz(id, fileId);
      sandboxRemove('quiz', id);
      return Promise.resolve();
    },
    duplicateQuiz: async (meta) => {
      if (!isSandboxed(meta.id)) return api.duplicateQuiz(meta);
      const data = await loadEither('quiz', meta.driveFileId, api.loadQuizData);
      const id = sandboxId();
      const copy = { ...data, id, title: `${data.title} (Copy)` };
      return putDriveItem('quiz', metaOf(copy), copy, realIds);
    },
    shareQuiz: (meta, load) =>
      isSandboxed(meta.id)
        ? Promise.resolve(`${origin()}/share/${sandboxId()}`)
        : api.shareQuiz(meta, load),
    createQuizTemplate: () => Promise.resolve(`${origin()}/sandbox-sheet`),
    importSharedQuiz: () => Promise.resolve(),
    attachSyncLinkage: (id, linkage) =>
      isSandboxed(id) ? Promise.resolve() : api.attachSyncLinkage(id, linkage),
    pullSyncedQuiz: (meta) =>
      isSandboxed(meta.id) ? Promise.resolve(meta) : api.pullSyncedQuiz(meta),
    detachSyncedQuiz: (meta) =>
      isSandboxed(meta.id) ? Promise.resolve(meta) : api.detachSyncedQuiz(meta),
  });
}

export function useSandboxedVideoActivity(
  api: UseVideoActivityResult
): UseVideoActivityResult {
  const sandbox = useTourSandbox();
  useKeeper('video-activity', async ({ data }) => {
    await api.saveActivity({
      ...(data as unknown as VideoActivityData),
      id: crypto.randomUUID(),
    });
  });
  if (!sandbox.active) return api;
  const realIds = new Set(api.activities.map((a) => a.id));
  const metaOf = (a: VideoActivityData) => activityMetaOf(a, api.activities);
  return sandboxApi(api, {
    activities: mergeSandboxList(api.activities, 'video-activity', sandbox),
    saveActivity: (a, fileId, behavior) =>
      isSandboxed(a.id)
        ? Promise.resolve(putDriveItem('video-activity', metaOf(a), a, realIds))
        : api.saveActivity(a, fileId, behavior),
    loadActivityData: (fileId) =>
      loadEither('video-activity', fileId, api.loadActivityData),
    deleteActivity: (id, fileId) => {
      if (!isSandboxed(id)) return api.deleteActivity(id, fileId);
      sandboxRemove('video-activity', id);
      return Promise.resolve();
    },
    duplicateActivity: async (meta) => {
      if (!isSandboxed(meta.id)) return api.duplicateActivity(meta);
      const data = await loadEither(
        'video-activity',
        meta.driveFileId,
        api.loadActivityData
      );
      const copy = { ...data, id: sandboxId(), title: `${data.title} (Copy)` };
      return putDriveItem('video-activity', metaOf(copy), copy, realIds);
    },
    attachSyncLinkage: (id, linkage) =>
      isSandboxed(id) ? Promise.resolve() : api.attachSyncLinkage(id, linkage),
    pullSyncedVideoActivity: (meta) =>
      isSandboxed(meta.id)
        ? Promise.resolve(meta)
        : api.pullSyncedVideoActivity(meta),
    reorderActivities: () => Promise.resolve(),
    createTemplateSheet: () => Promise.resolve(`${origin()}/sandbox-sheet`),
  });
}

export function useSandboxedGuidedLearning(
  api: UseGuidedLearningResult
): UseGuidedLearningResult {
  const sandbox = useTourSandbox();
  useKeeper('guided-learning', async ({ data }) => {
    await api.saveSet({
      ...(data as unknown as GuidedLearningSet),
      id: crypto.randomUUID(),
    });
  });
  if (!sandbox.active) return api;
  const realIds = new Set(api.sets.map((s) => s.id));
  const metaOf = (set: GuidedLearningSet) => setMetaOf(set, api.sets);
  return sandboxApi(api, {
    sets: mergeSandboxList(api.sets, 'guided-learning', sandbox),
    saveSet: (set, fileId, guard) =>
      isSandboxed(set.id)
        ? Promise.resolve(
            putDriveItem('guided-learning', metaOf(set), set, realIds)
          )
        : api.saveSet(set, fileId, guard),
    loadSetData: (fileId) =>
      loadEither('guided-learning', fileId, api.loadSetData),
    deleteSet: (id, fileId, open) => {
      if (!isSandboxed(id)) return api.deleteSet(id, fileId, open);
      sandboxRemove('guided-learning', id);
      return Promise.resolve();
    },
    duplicateSet: async (meta) => {
      if (!isSandboxed(meta.id)) return api.duplicateSet(meta);
      const data = await loadEither(
        'guided-learning',
        meta.driveFileId,
        api.loadSetData
      );
      const copy = { ...data, id: sandboxId(), title: `${data.title} (Copy)` };
      return putDriveItem('guided-learning', metaOf(copy), copy, realIds);
    },
    saveBuildingSet: () => Promise.resolve(),
    deleteBuildingSet: () => Promise.resolve(),
  });
}

export function useSandboxedActivityWalls(
  api: UseActivityWallLibraryResult
): UseActivityWallLibraryResult {
  const sandbox = useTourSandbox();
  useKeeper('activity-wall', async ({ data }) => {
    const now = Date.now();
    await api.saveActivity({
      ...(data as unknown as ActivityWallLibraryEntry),
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    });
  });
  if (!sandbox.active) return api;
  const realIds = new Set(api.activities.map((a) => a.id));
  return sandboxApi(api, {
    activities: mergeSandboxList(api.activities, 'activity-wall', sandbox),
    saveActivity: (entry) => {
      if (!isSandboxed(entry.id)) return api.saveActivity(entry);
      sandboxPut(
        'activity-wall',
        entry.id,
        { meta: asRecord(entry), data: asRecord(entry) },
        realIds.has(entry.id) ? 'copy' : 'created'
      );
      return Promise.resolve();
    },
    deleteActivity: (id) => {
      if (!isSandboxed(id)) return api.deleteActivity(id);
      sandboxRemove('activity-wall', id);
      return Promise.resolve();
    },
  });
}

/** The mini app library with the tour's own apps; writes go through `sandboxMiniAppWrite`. */
export function useSandboxedMiniApps(library: MiniAppItem[]): MiniAppItem[] {
  return mergeSandboxList(library, 'mini-app', useTourSandbox());
}

/** True when a mini app write stayed in the sandbox; `realLibrary` is the unmerged list. */
export const sandboxMiniAppWrite = (
  app: MiniAppItem,
  realLibrary: readonly MiniAppItem[],
  remove = false
): boolean => {
  if (!isSandboxed(app.id)) return false;
  if (remove) sandboxRemove('mini-app', app.id);
  else
    sandboxPut(
      'mini-app',
      app.id,
      { meta: asRecord(app), data: asRecord(app) },
      realLibrary.some((a) => a.id === app.id) ? 'copy' : 'created'
    );
  return true;
};

/** Registers the mini app widget's real save for Keep. */
export const useMiniAppKeeper = (
  save: (app: MiniAppItem) => Promise<void>
): void =>
  useKeeper('mini-app', ({ data }) =>
    save({
      ...(data as unknown as MiniAppItem),
      id: crypto.randomUUID(),
      createdAt: Date.now(),
    })
  );

export function useSandboxedQuizAssignments(
  api: UseQuizAssignmentsResult
): UseQuizAssignmentsResult {
  const { active } = useTourSandbox();
  if (!active) return api;
  const materialOf = (id: string) =>
    api.assignments.find((a) => a.id === id)?.quizId;
  return sandboxApi(api, {
    ...guardAssignmentCalls(
      api,
      materialOf,
      [
        'pauseAssignment',
        'resumeAssignment',
        'deactivateAssignment',
        'reopenAssignment',
        'deleteAssignment',
        'updateAssignmentSettings',
        'setAssignmentRosters',
        'setAssignmentExportUrl',
        'setAssignmentTargetSkippedCount',
        'setAssignmentExportedResponseIds',
        'shareAssignment',
        'syncAssignmentToLatest',
        'publishAssignmentScores',
        'unpublishAssignmentScores',
        'publishResultsForStudents',
        'hideResultsForStudents',
        'clearResultsOverride',
        'shareAssignmentWithPlc',
        'stopSharingAssignmentWithPlc',
      ],
      {
        shareAssignment: `${origin()}/share/${sandboxId()}`,
        syncAssignmentToLatest: {
          updated: false,
          version: 0,
          taggedResponseCount: 0,
        },
        publishAssignmentScores: { responsesUpdated: 0, paperResponses: 0 },
        publishResultsForStudents: { responsesUpdated: 0, skipped: 0 },
      }
    ),
    createAssignment: async (quiz, settings, options) => {
      if (isSandboxed(quiz.id))
        return { id: sandboxId(), code: fakeJoinCode() };
      const made = await api.createAssignment(quiz, settings, options);
      return keepReal(made.id, made);
    },
  });
}

export function useSandboxedVideoActivitySession(
  api: UseVideoActivitySessionTeacherResult
): UseVideoActivitySessionTeacherResult {
  const { active } = useTourSandbox();
  if (!active) return api;
  return sandboxApi(api, {
    createSession: (activity, ...rest) =>
      isSandboxed(activity.id)
        ? Promise.resolve(sandboxId())
        : api.createSession(activity, ...rest),
  });
}

export function useSandboxedVideoActivityAssignments(
  api: UseVideoActivityAssignmentsResult
): UseVideoActivityAssignmentsResult {
  const { active } = useTourSandbox();
  if (!active) return api;
  const materialOf = (id: string) =>
    api.assignments.find((a) => a.id === id)?.activityId;
  return sandboxApi(api, {
    ...guardAssignmentCalls(
      api,
      materialOf,
      [
        'pauseAssignment',
        'resumeAssignment',
        'deactivateAssignment',
        'reactivateAssignment',
        'deleteAssignment',
        'updateAssignmentSettings',
        'shareAssignment',
        'publishAssignmentScores',
        'unpublishAssignmentScores',
      ],
      {
        shareAssignment: `${origin()}/share/${sandboxId()}`,
        publishAssignmentScores: { responsesUpdated: 0, scoredQuestions: [] },
      }
    ),
    createAssignment: async (activity, ...rest) => {
      if (isSandboxed(activity.id)) return { id: sandboxId() };
      const made = await api.createAssignment(activity, ...rest);
      return keepReal(made.id, made);
    },
  });
}

export function useSandboxedGuidedLearningSession(
  api: UseGuidedLearningSessionTeacherResult
): UseGuidedLearningSessionTeacherResult {
  const { active } = useTourSandbox();
  if (!active) return api;
  return sandboxApi(api, {
    createSession: (set, ...rest) =>
      isSandboxed(set.id)
        ? Promise.resolve(`${origin()}/guided-learning/${sandboxId()}`)
        : api.createSession(set, ...rest),
  });
}

export function useSandboxedGuidedLearningAssignments(
  api: UseGuidedLearningAssignmentsResult,
  teacherUid: string | undefined
): UseGuidedLearningAssignmentsResult {
  const { active } = useTourSandbox();
  if (!active) return api;
  const materialOf = (id: string) =>
    api.assignments.find((a) => a.id === id)?.setId;
  return sandboxApi(api, {
    ...guardAssignmentCalls(
      api,
      materialOf,
      [
        'archiveAssignment',
        'unarchiveAssignment',
        'deleteAssignment',
        'publishAssignmentScores',
        'unpublishAssignmentScores',
      ],
      { publishAssignmentScores: { responsesUpdated: 0 } }
    ),
    createAssignment: async (input) => {
      if (isSandboxed(input.setId)) return fakeGlAssignment(input, teacherUid);
      const made = await api.createAssignment(input);
      return keepReal(made.id, made);
    },
  });
}

export function useSandboxedMiniAppSession(
  api: UseMiniAppSessionTeacherResult
): UseMiniAppSessionTeacherResult {
  const { active } = useTourSandbox();
  if (!active) return api;
  return sandboxApi(api, {
    createSession: (app, ...rest) =>
      isSandboxed(app.id)
        ? Promise.resolve(sandboxId())
        : api.createSession(app, ...rest),
  });
}

export function useSandboxedMiniAppAssignments(
  api: UseMiniAppAssignmentsResult
): UseMiniAppAssignmentsResult {
  const { active } = useTourSandbox();
  if (!active) return api;
  const materialOf = (id: string) =>
    api.assignments.find((a) => a.id === id)?.appId;
  return sandboxApi(api, {
    ...guardAssignmentCalls(api, materialOf, [
      'renameAssignment',
      'endAssignment',
      'reactivateAssignment',
      'deleteAssignment',
      'setTargetSkippedCount',
    ]),
    createAssignment: async (input) => {
      if (isSandboxed(input.app.id)) return sandboxId();
      const made = await api.createAssignment(input);
      return keepReal(made, made);
    },
  });
}
