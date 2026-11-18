// D24: re-reads the Agenda deck's sharing and slide shape when My Classes opens and records them on the Course.
import { useCallback, useEffect, useEffectEvent, useState } from 'react';
import type { DeckState } from '@/utils/course/deckSharing';
import type { Course } from '@/utils/course/contract';
import type { UseCoursesResult } from '@/hooks/useCourses';
import { logError } from '@/utils/logError';
import { isAuthBypass } from '@/config/firebase';
import { viewAsSuppressesBackgroundWrites } from '@/utils/viewAsTab';
import { readDeckForCheck, type DeckDrive } from './deckDrive';
import { shouldRecordCheck } from './agendaLogic';
import { aspectChanged } from '@/utils/course/agendaFrame';

export interface DeckCheckResult {
  /** The live reading, or null before the first one comes back. */
  state: DeckState | null;
  /** Reads the deck again, as after a sharing change. */
  recheck: () => void;
}

export function useDeckCheck(
  course: Course | null,
  drive: DeckDrive | null,
  domain: string | null,
  saveCourse: UseCoursesResult['saveCourse']
): DeckCheckResult {
  const courseId = course?.id ?? null;
  const fileId = course?.agenda?.fileId ?? null;
  const key =
    courseId && fileId && drive && domain ? `${courseId}:${fileId}` : null;
  const [reading, setReading] = useState<{
    key: string;
    state: DeckState;
  } | null>(null);
  const [round, setRound] = useState(0);

  const record = useEffectEvent((state: DeckState) => {
    if (isAuthBypass || viewAsSuppressesBackgroundWrites()) return;
    if (!course || !shouldRecordCheck(course.deckCheck, state, Date.now()))
      return;
    saveCourse({
      action: 'recordDeckCheck',
      courseId: course.id,
      modifiedAt: state.modifiedAt,
      sharing: state.sharing,
    }).catch((err: unknown) => logError('AgendaSetup.recordDeckCheck', err));
  });

  useEffect(() => {
    if (!key || !drive || !fileId || !domain) return;
    let live = true;
    void readDeckForCheck(drive, fileId, domain).then((state) => {
      if (!live || !state) return;
      setReading({ key, state });
      record(state);
    });
    return () => {
      live = false;
    };
  }, [key, drive, fileId, domain, round]);

  // A deck saved before its shape was read, or resized since, gets its shape saved so every frame fits it.
  const saveAspect = useEffectEvent((forFileId: string, aspect: number) => {
    if (isAuthBypass || viewAsSuppressesBackgroundWrites()) return;
    const agenda = course?.agenda;
    if (!course || !agenda || agenda.fileId !== forFileId) return;
    if (!aspectChanged(agenda.aspect, aspect)) return;
    saveCourse({
      action: 'save',
      course: {
        id: course.id,
        agenda: { ...agenda, aspect },
        expectedUpdatedAt: course.updatedAt,
      },
    }).catch((err: unknown) => logError('AgendaSetup.saveAspect', err));
  });

  useEffect(() => {
    if (!key || !drive || !fileId) return;
    let live = true;
    void drive.getDeckAspect(fileId).then((aspect) => {
      if (live && aspect !== null) saveAspect(fileId, aspect);
    });
    return () => {
      live = false;
    };
  }, [key, drive, fileId]);

  const recheck = useCallback(() => setRound((n) => n + 1), []);
  return {
    state: reading && reading.key === key ? reading.state : null,
    recheck,
  };
}
