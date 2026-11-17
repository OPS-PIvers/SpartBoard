// Thread B owns this file: the Agenda deck, its sharing, pinned links and the Class page link (D6 to D12, D18, D24).
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Presentation } from 'lucide-react';
import { FirebaseError } from 'firebase/app';
import { tourAttr } from '@/config/tourAnchors';
import { useAuth } from '@/context/useAuth';
import { useDialog } from '@/context/useDialog';
import { useGooglePicker } from '@/hooks/useGooglePicker';
import { copyText } from '@/utils/copyText';
import { isDriveAuthError } from '@/utils/driveAuthErrors';
import { logError } from '@/utils/logError';
import {
  DeckStillPublicError,
  emailDomain,
  readDeckState,
  setDeckSharing,
} from '@/utils/course/deckSharing';
import type {
  Course,
  CourseAgenda,
  CourseInput,
  CoursePinnedLink,
} from '@/utils/course/contract';
import { DeckAccessError, DeckDrive } from './agenda/deckDrive';
import { AgendaDialog } from './agenda/AgendaDialog';
import { useDeckCheck } from './agenda/useDeckCheck';
import { useAgendaStatus } from './agenda/agendaStatus';
import {
  classPageLink,
  courseSaveInput,
  neededSharing,
  sharingProblem,
  slidesIdFromText,
} from './agenda/agendaLogic';
import type { CourseGroupProps } from './types';

type TFn = ReturnType<typeof useTranslation>['t'];

function saveErrorText(t: TFn, err: unknown): string {
  if (
    err instanceof FirebaseError &&
    err.code === 'functions/failed-precondition'
  )
    return t('course.agenda.changedElsewhere', {
      defaultValue: 'This course changed. Try again.',
    });
  return t('course.agenda.saveFailed', {
    defaultValue: "Couldn't save. Try again.",
  });
}

function shareErrorText(t: TFn, err: unknown): string | null {
  if (err instanceof DeckStillPublicError)
    return t('course.agenda.stillPublic', {
      defaultValue:
        'The deck is still public. Check its sharing in Google Slides.',
    });
  if (err instanceof DeckAccessError) {
    if (err.reason === 'policy')
      return t('course.agenda.sharePolicy', {
        defaultValue:
          "Your district's Google settings don't allow this sharing.",
      });
    return t('course.agenda.shareNoAccess', {
      defaultValue: "Only the deck's owner can change its sharing.",
    });
  }
  // The sign-in toast already fired for this one.
  if (isDriveAuthError(err)) return null;
  if (err instanceof Error && err.name.startsWith('Dev')) return err.message;
  return t('course.agenda.shareFailed', {
    defaultValue: "Couldn't change sharing. Try again.",
  });
}

export const AgendaSetup: React.FC<
  CourseGroupProps & { courses?: readonly Course[] }
> = ({ group, saveCourse, courses = [] }) => {
  const { t } = useTranslation();
  const { user, googleAccessToken, refreshGoogleToken } = useAuth();
  const { showConfirm } = useDialog();
  const { openPicker } = useGooglePicker();
  const [status, setStatus] = useAgendaStatus(group.rosters[0]?.id ?? '');
  const [copied, setCopied] = useState(false);
  const { open, error } = status;
  const setOpen = (next: boolean) => setStatus({ open: next });
  const setError = (next: string | null) => setStatus({ error: next });

  const course = group.course;
  // Stays busy until the saved Course arrives, so the next save sends its new updatedAt.
  const busy =
    status.busy ||
    (status.creating && !course) ||
    (status.savedFrom !== null &&
      (course?.updatedAt ?? null) === status.savedFrom);
  useEffect(() => {
    if (course && status.creating) setStatus({ creating: false });
  }, [course, status.creating, setStatus]);
  const agenda = course?.agenda ?? null;
  const domain = emailDomain(user?.email);
  const drive = useMemo(
    () =>
      googleAccessToken
        ? new DeckDrive(googleAccessToken, () => refreshGoogleToken())
        : null,
    [googleAccessToken, refreshGoogleToken]
  );
  const { state, recheck } = useDeckCheck(course, drive, domain, saveCourse);
  const needed = neededSharing(course);
  const problem = agenda
    ? sharingProblem(
        state?.sharing ?? course?.deckCheck?.sharing ?? null,
        needed
      )
    : null;
  const pageLink = classPageLink(course, window.location.origin);

  const save = async (
    patch: Pick<CourseInput, 'agenda' | 'pinnedLinks'>
  ): Promise<boolean> => {
    try {
      await saveCourse({
        action: 'save',
        course: courseSaveInput(group, patch),
      });
      // A new Course keeps the controls busy until it arrives, so a second save can't create another.
      setStatus({ savedFrom: course?.updatedAt ?? null, creating: !course });
      return true;
    } catch (err) {
      logError('AgendaSetup.save', err);
      setError(saveErrorText(t, err));
      return false;
    }
  };

  const share = async (
    fileId: string,
    title: string,
    level: 'domain' | 'anyone'
  ): Promise<boolean> => {
    if (!drive || !domain) return false;
    const ok = await showConfirm(
      level === 'anyone'
        ? t('course.agenda.shareAnyoneMessage', {
            title,
            defaultValue:
              'Anyone with the link, outside Orono too, will see every slide in {{title}}, past days included.',
          })
        : t('course.agenda.shareOronoMessage', {
            title,
            defaultValue:
              'Anyone in Orono with the link will be able to view {{title}}. Nothing else changes.',
          }),
      {
        title:
          level === 'anyone'
            ? t('course.agenda.shareAnyoneTitle', {
                defaultValue: 'Share with anyone?',
              })
            : t('course.agenda.shareOronoTitle', {
                defaultValue: 'Share with Orono?',
              }),
        confirmLabel: t('course.agenda.shareConfirm', {
          defaultValue: 'Share',
        }),
      }
    );
    if (!ok) return false;
    try {
      await setDeckSharing(drive, fileId, level, domain);
      return true;
    } catch (err) {
      if (!(err instanceof DeckAccessError)) logError('AgendaSetup.share', err);
      setError(shareErrorText(t, err));
      return false;
    }
  };

  // Default plan: a replaced public deck gets the D23 offer to go back to Orono only.
  const offerStopSharing = async (old: CourseAgenda) => {
    if (!drive || !domain) return;
    // Another Course's families still need the deck public.
    if (
      courses.some(
        (c) =>
          c.id !== course?.id &&
          c.agenda?.fileId === old.fileId &&
          c.familyLink?.on
      )
    )
      return;
    const { sharing } = await readDeckState(drive, old.fileId, domain);
    if (sharing !== 'anyone') return;
    const ok = await showConfirm(
      t('course.agenda.stopSharingMessage', {
        title: old.title,
        defaultValue:
          '{{title}} is shared with anyone who has the link. Set it back to anyone in Orono with the link?',
      }),
      {
        title: t('course.agenda.stopSharingTitle', {
          defaultValue: 'Stop sharing the old deck outside Orono?',
        }),
        confirmLabel: t('course.agenda.stopSharing', {
          defaultValue: 'Stop sharing',
        }),
        cancelLabel: t('course.agenda.keepSharing', {
          defaultValue: 'Keep sharing',
        }),
      }
    );
    if (!ok) return;
    try {
      await setDeckSharing(drive, old.fileId, 'domain', domain);
    } catch (err) {
      if (!(err instanceof DeckAccessError))
        logError('AgendaSetup.stopSharing', err);
      setError(shareErrorText(t, err));
    }
  };

  const run = async (work: () => Promise<void>) => {
    setStatus({ busy: true, error: null });
    try {
      await work();
    } finally {
      setStatus({ busy: false });
    }
  };

  // Saves the chosen deck, offers the sharing it needs, then offers to un-share the one it replaced.
  const applyDeck = async (next: CourseAgenda) => {
    if (next.fileId === agenda?.fileId) return true;
    const old = agenda;
    if (!(await save({ agenda: next }))) return false;
    if (drive && domain) {
      const { sharing } = await readDeckState(drive, next.fileId, domain);
      const fix = sharingProblem(sharing, needed);
      if (fix === 'students' || fix === 'families')
        await share(next.fileId, next.title, needed);
    }
    if (old) await offerStopSharing(old);
    recheck();
    return true;
  };

  const openDeckPicker = async (fileIds?: string[]) => {
    try {
      return await openPicker({ mode: 'slides', fileIds });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    }
  };

  const pickDeck = async () => {
    let done = false;
    await run(async () => {
      const picked = await openDeckPicker();
      if (picked)
        done = await applyDeck({ fileId: picked.id, title: picked.name });
    });
    return done;
  };

  // A pasted link this app hasn't opened yet needs one Picker click, since Drive only lets it see files picked there.
  const pasteDeck = async (text: string) => {
    let done = false;
    await run(async () => {
      const fileId = slidesIdFromText(text);
      if (!fileId) {
        setError(
          t('course.agenda.badSlidesLink', {
            defaultValue: 'Paste a Google Slides link.',
          })
        );
        return;
      }
      let title: string | null = null;
      if (drive) {
        try {
          const info = await drive.getDeckInfo(fileId);
          if (!info.isSlides) {
            setError(
              t('course.agenda.notSlides', {
                defaultValue: "That link isn't a Google Slides deck.",
              })
            );
            return;
          }
          title = info.name;
        } catch (err) {
          if (!(err instanceof DeckAccessError)) {
            if (!isDriveAuthError(err)) setError(saveErrorText(t, err));
            return;
          }
        }
      }
      if (title === null) {
        const picked = await openDeckPicker([fileId]);
        if (!picked) return;
        if (picked.id !== fileId) return;
        title = picked.name;
      }
      done = await applyDeck({ fileId, title: title || 'Agenda' });
    });
    return done;
  };

  const removeDeck = () =>
    run(async () => {
      const old = agenda;
      if (!old || !(await save({ agenda: null }))) return;
      await offerStopSharing(old);
    });

  const fixSharing = () =>
    run(async () => {
      if (!agenda) return;
      if (await share(agenda.fileId, agenda.title, needed)) recheck();
    });

  const saveLinks = async (links: CoursePinnedLink[]) => {
    setStatus({ busy: true, error: null });
    try {
      return await save({ pinnedLinks: links });
    } finally {
      setStatus({ busy: false });
    }
  };

  const copyPageLink = async () => {
    if (!pageLink) return;
    if (await copyText(pageLink)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } else {
      setError(
        t('course.agenda.copyFailed', {
          defaultValue: "Couldn't copy the link.",
        })
      );
    }
  };

  const warn = problem === 'students' || problem === 'families';
  const dialogTitle = course?.name ?? group.rosters[0]?.name ?? '';

  return (
    <div className="pl-9 pr-2 pb-2 -mt-1.5">
      <button
        type="button"
        onClick={() => setOpen(true)}
        {...tourAttr('classes.agenda-open')}
        className={`flex max-w-full items-center gap-1.5 rounded py-0.5 text-left text-xs hover:text-brand-blue-primary ${
          warn ? 'text-amber-700' : agenda ? 'text-slate-500' : 'text-slate-400'
        }`}
      >
        {warn ? (
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        ) : (
          <Presentation className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        )}
        <span className="min-w-0 truncate">
          {warn
            ? problem === 'families'
              ? t('course.agenda.lineFamiliesCantOpen', {
                  defaultValue: "Families can't open the agenda",
                })
              : t('course.agenda.lineStudentsCantOpen', {
                  defaultValue: "Students can't open the agenda",
                })
            : agenda
              ? agenda.title
              : t('course.agenda.add', { defaultValue: 'Add agenda' })}
        </span>
      </button>
      <AgendaDialog
        isOpen={open}
        onClose={() => setStatus({ open: false, error: null })}
        title={dialogTitle}
        agenda={agenda}
        problem={problem}
        sharingOk={
          !!agenda &&
          !problem &&
          (state?.sharing ?? course?.deckCheck?.sharing ?? null) !== null
        }
        needed={needed}
        canFix={!!drive && !!domain}
        links={course?.pinnedLinks ?? []}
        pageLink={pageLink}
        copied={copied}
        busy={busy}
        error={error}
        onPick={pickDeck}
        onPaste={pasteDeck}
        onRemove={() => void removeDeck()}
        onFix={() => void fixSharing()}
        onSaveLinks={saveLinks}
        onCopy={() => void copyPageLink()}
      />
    </div>
  );
};
