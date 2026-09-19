/** The run's writes, shared by both faces: two copies drift out of the `lastStepChange` rule. */

import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteField,
  doc,
  updateDoc,
  type Firestore,
} from 'firebase/firestore';
import type {
  ProjectDefinition,
  ProjectGroupEvent,
  ProjectRun,
  ProjectStepState,
  ProjectWorkLink,
} from '@/types';
import { approvalStepIdsFrom } from '@/components/widgets/Projects/projectSteps';
import { rubricMaxPoints } from '@/utils/rubricPoints';
import { logError } from '@/utils/logError';

export const RUNS_COLLECTION = 'project_runs';

/** D13 — exactly one run per project, so the id is derivable, not stored. */
export const runIdFor = (teacherUid: string, projectId: string): string =>
  `${teacherUid}_${projectId}`;

const groupRef = (db: Firestore, runId: string, groupId: string) =>
  doc(db, RUNS_COLLECTION, runId, 'groups', groupId);

/** D24 — a failed log entry must never roll back the change it describes. */
export async function logProjectEvent(
  db: Firestore,
  runId: string,
  groupId: string,
  actorUid: string | undefined,
  event: Omit<ProjectGroupEvent, 'id' | 'at' | 'actorUid'>
): Promise<void> {
  if (!actorUid) return;
  try {
    await addDoc(
      collection(db, RUNS_COLLECTION, runId, 'groups', groupId, 'events'),
      { ...event, at: Date.now(), actorUid }
    );
  } catch (eventError) {
    logError('projectRunWrites.logEvent', eventError, { runId, groupId });
  }
}

export async function writeStepState(
  db: Firestore,
  runId: string,
  groupId: string,
  stepId: string,
  state: ProjectStepState,
  actor: { uid: string | undefined; role: 'student' | 'teacher' },
  from?: ProjectStepState
): Promise<void> {
  await updateDoc(groupRef(db, runId, groupId), {
    [`stepStates.${stepId}`]: state,
    // The rules check this claim against the real diff, which is what makes
    // the per-step approval ceiling enforceable — see `pjStudentStepWrite`.
    lastStepChange: { stepId, at: Date.now() },
    updatedAt: Date.now(),
  });
  await logProjectEvent(db, runId, groupId, actor.uid, {
    actorRole: actor.role,
    kind: 'stepState',
    stepId,
    ...(from ? { from } : {}),
    to: state,
  });
}

export async function writeNeedsSupport(
  db: Firestore,
  runId: string,
  groupId: string,
  needsSupport: boolean,
  actor: { uid: string | undefined; role: 'student' | 'teacher' }
): Promise<void> {
  await updateDoc(groupRef(db, runId, groupId), {
    needsSupport,
    updatedAt: Date.now(),
  });
  await logProjectEvent(db, runId, groupId, actor.uid, {
    actorRole: actor.role,
    kind: 'needsSupport',
    detail: needsSupport ? 'raised' : 'cleared',
  });
}

export async function writeWorkLink(
  db: Firestore,
  runId: string,
  groupId: string,
  link: ProjectWorkLink,
  actor: { uid: string | undefined; role: 'student' | 'teacher' }
): Promise<void> {
  await updateDoc(groupRef(db, runId, groupId), {
    workLinks: arrayUnion(link),
    updatedAt: Date.now(),
  });
  await logProjectEvent(db, runId, groupId, actor.uid, {
    actorRole: actor.role,
    kind: 'workLink',
    ...(link.stepId ? { stepId: link.stepId } : {}),
    detail: link.url,
  });
}

export async function removeWorkLinkWrite(
  db: Firestore,
  runId: string,
  groupId: string,
  link: ProjectWorkLink
): Promise<void> {
  await updateDoc(groupRef(db, runId, groupId), {
    workLinks: arrayRemove(link),
    updatedAt: Date.now(),
  });
}

/** Opening and closing a run is the whole In Progress ↔ Archive lifecycle (R2). */
export async function setRunAcceptingUpdates(
  db: Firestore,
  runId: string,
  acceptingUpdates: boolean
): Promise<void> {
  await updateDoc(doc(db, RUNS_COLLECTION, runId), {
    acceptingUpdates,
    updatedAt: Date.now(),
  });
}

/**
 * D12/D13 — the run holds a snapshot of the project, so editing a launched
 * project has to push title, steps and rubric onto it. updateDoc cannot clear
 * a key by omitting it, so anything the teacher removed is deleteField()ed.
 */
export async function syncRunFromProject(
  db: Firestore,
  run: ProjectRun,
  project: ProjectDefinition
): Promise<void> {
  const payload: Record<string, unknown> = {
    title: project.title,
    steps: project.steps,
    approvalStepIds: approvalStepIdsFrom(project.steps),
    updatedAt: Date.now(),
  };

  if (project.rubric) {
    payload.rubric = project.rubric;
    payload.rubricMaxPoints =
      project.rubricMaxPoints ?? rubricMaxPoints(project.rubric);
  } else if (run.rubric) {
    payload.rubric = deleteField();
    payload.rubricMaxPoints = deleteField();
  }

  if (project.dueAt !== undefined) payload.dueAt = project.dueAt;
  else if (run.dueAt !== undefined) payload.dueAt = deleteField();

  await updateDoc(doc(db, RUNS_COLLECTION, run.id), payload);
}
