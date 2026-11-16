// D24: re-checks the shown Course's deck sharing when the widget opens and records it on the Course.
import { useEffect, useEffectEvent } from 'react';
import { useAuth } from '@/context/useAuth';
import { useGoogleDrive } from '@/hooks/useGoogleDrive';
import { isAuthBypass } from '@/config/firebase';
import { viewAsSuppressesBackgroundWrites } from '@/utils/viewAsTab';
import { logError } from '@/utils/logError';
import type { Course, SaveCourseRequest } from '@/utils/course/contract';
import { emailDomain, readDeckState } from '@/utils/course/deckSharing';
import { shouldCheckDeck } from './agendaWidgetState';

export function useAgendaDeckCheck(
  course: Course | null,
  saveCourse: (request: SaveCourseRequest) => Promise<unknown>
): void {
  const { user } = useAuth();
  const { driveService } = useGoogleDrive();
  const domain = emailDomain(user?.email);
  const courseId = course?.id ?? null;
  const fileId = course?.agenda?.fileId ?? null;

  const isDue = useEffectEvent(() => shouldCheckDeck(course, Date.now()));
  const stillShows = useEffectEvent(
    (id: string) => course?.agenda?.fileId === id
  );

  useEffect(() => {
    if (!driveService || !domain || !courseId || !fileId) return;
    if (isAuthBypass || viewAsSuppressesBackgroundWrites() || !isDue()) return;
    let cancelled = false;
    void (async () => {
      try {
        const state = await readDeckState(driveService, fileId, domain);
        // A deck swapped while reading must not get this deck's result.
        if (cancelled || !stillShows(fileId)) return;
        await saveCourse({
          action: 'recordDeckCheck',
          courseId,
          modifiedAt: state.modifiedAt,
          sharing: state.sharing,
        });
      } catch (err) {
        logError('agenda deck check', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [driveService, domain, courseId, fileId, saveCourse]);
}
