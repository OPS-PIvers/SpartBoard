// D24: re-checks the shown Course's deck sharing when the widget opens and records it on the Course.
import { useEffect, useEffectEvent, useMemo } from 'react';
import { useAuth } from '@/context/useAuth';
import { isAuthBypass } from '@/config/firebase';
import { viewAsSuppressesBackgroundWrites } from '@/utils/viewAsTab';
import { logError } from '@/utils/logError';
import type { Course, SaveCourseRequest } from '@/utils/course/contract';
import { emailDomain } from '@/utils/course/deckSharing';
import {
  DeckDrive,
  readDeckForCheck,
} from '@/components/classes/course/agenda/deckDrive';
import { shouldCheckDeck } from './agendaWidgetState';

// One check per Course at a time, shared by every Agenda widget on the board.
const inFlight = new Set<string>();

export function useAgendaDeckCheck(
  course: Course | null,
  saveCourse: (request: SaveCourseRequest) => Promise<unknown>
): void {
  const { user, googleAccessToken, refreshGoogleToken } = useAuth();
  // DeckDrive reads a deck Drive refuses as 'unknown' instead of prompting a reconnect.
  const driveService = useMemo(
    () =>
      googleAccessToken
        ? new DeckDrive(googleAccessToken, () => refreshGoogleToken())
        : null,
    [googleAccessToken, refreshGoogleToken]
  );
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
    const key = `${courseId}/${fileId}`;
    if (inFlight.has(key)) return;
    inFlight.add(key);
    let cancelled = false;
    void (async () => {
      try {
        const state = await readDeckForCheck(driveService, fileId, domain);
        // A deck swapped while reading must not get this deck's result.
        if (!state || cancelled || !stillShows(fileId)) return;
        await saveCourse({
          action: 'recordDeckCheck',
          courseId,
          modifiedAt: state.modifiedAt,
          sharing: state.sharing,
        });
      } catch (err) {
        logError('agenda deck check', err);
      } finally {
        inFlight.delete(key);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [driveService, domain, courseId, fileId, saveCourse]);
}
