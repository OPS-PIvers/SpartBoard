// Thread B owns this file: the Agenda deck, its sharing, pinned links and the Class page link (D6 to D12, D18, D24).
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  Check,
  ChevronRight,
  ExternalLink,
  Link2,
  Presentation,
} from 'lucide-react';
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
  CourseAgenda,
  CourseInput,
  CoursePinnedLink,
} from '@/utils/course/contract';
import { DeckAccessError, DeckDrive } from './agenda/deckDrive';
import { PinnedLinksEditor } from './agenda/PinnedLinksEditor';
import { useDeckCheck } from './agenda/useDeckCheck';
import {
  classPageLink,
  courseSaveInput,
  deckUrl,
  neededSharing,
  sharingProblem,
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
  if (isDriveAuthError(err)) return null;
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
  if (err instanceof Error && err.name.startsWith('Dev')) return err.message;
  return t('course.agenda.shareFailed', {
    defaultValue: "Couldn't change sharing. Try again.",
  });
}

export const AgendaSetup: React.FC<CourseGroupProps> = ({
  group,
  saveCourse,
}) => {
  const { t } = useTranslation();
  const { user, googleAccessToken, refreshGoogleToken } = useAuth();
  const { showConfirm } = useDialog();
  const { openPicker } = useGooglePicker();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const course = group.course;
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
    setBusy(true);
    setError(null);
    try {
      await work();
    } finally {
      setBusy(false);
    }
  };

  const pickDeck = () =>
    run(async () => {
      let picked;
      try {
        picked = await openPicker({ mode: 'slides' });
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return;
      }
      if (!picked || picked.id === agenda?.fileId) return;
      const old = agenda;
      const next: CourseAgenda = { fileId: picked.id, title: picked.name };
      if (!(await save({ agenda: next }))) return;
      setOpen(true);
      if (drive && domain) {
        const { sharing } = await readDeckState(drive, next.fileId, domain);
        const fix = sharingProblem(sharing, needed);
        if (fix === 'students' || fix === 'families')
          await share(
            next.fileId,
            next.title,
            fix === 'families' ? 'anyone' : 'domain'
          );
      }
      if (old) await offerStopSharing(old);
      recheck();
    });

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
    setBusy(true);
    setError(null);
    try {
      return await save({ pinnedLinks: links });
    } finally {
      setBusy(false);
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

  const problemText =
    problem === 'students'
      ? t('course.agenda.studentsCantOpen', {
          defaultValue: "Students can't open this deck.",
        })
      : problem === 'families'
        ? t('course.agenda.familiesCantOpen', {
            defaultValue: "Families can't open this deck.",
          })
        : problem === 'unknown'
          ? t('course.agenda.cantCheck', {
              defaultValue: "Can't check who can open this deck.",
            })
          : null;

  return (
    <div className="pl-9 pr-2 pb-2 -mt-1" data-agenda-setup="">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        {...tourAttr('classes.agenda-open')}
        className="w-full flex items-center gap-1.5 py-1 text-left text-xs text-slate-600 hover:text-brand-blue-primary"
      >
        <Presentation
          className="w-3.5 h-3.5 shrink-0 text-slate-400"
          aria-hidden="true"
        />
        <span className="flex-1 min-w-0 truncate">
          {agenda ? (
            <>
              <span className="sr-only">
                {t('course.agenda.label', { defaultValue: 'Agenda' })}:{' '}
              </span>
              {agenda.title}
            </>
          ) : (
            t('course.agenda.add', { defaultValue: 'Add agenda' })
          )}
        </span>
        {problem && problem !== 'unknown' && (
          <AlertTriangle
            className="w-3.5 h-3.5 shrink-0 text-amber-600"
            aria-hidden="true"
          />
        )}
        <ChevronRight
          className={`w-3.5 h-3.5 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-90' : ''}`}
          aria-hidden="true"
        />
      </button>

      {problemText && (problem !== 'unknown' || open) && (
        <div
          role="status"
          className={`flex items-center gap-2 py-1 text-xs ${problem === 'unknown' ? 'text-slate-500' : 'text-amber-700'}`}
        >
          <span
            className="flex-1 min-w-0"
            title={
              problem === 'unknown'
                ? t('course.agenda.cantCheckHint', {
                    defaultValue:
                      "Only the deck's owner can see and change who can open it.",
                  })
                : undefined
            }
          >
            {problemText}
          </span>
          {problem !== 'unknown' && drive && domain && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void fixSharing()}
              {...tourAttr('classes.agenda-fix-sharing')}
              className="shrink-0 px-2 py-0.5 text-xs font-semibold text-brand-blue-primary border border-brand-blue-primary/40 rounded-lg hover:bg-brand-blue-lighter disabled:opacity-50"
            >
              {needed === 'anyone'
                ? t('course.agenda.shareAnyone', {
                    defaultValue: 'Share with anyone',
                  })
                : t('course.agenda.shareOrono', {
                    defaultValue: 'Share with Orono',
                  })}
            </button>
          )}
        </div>
      )}

      {open && (
        <div className="space-y-2 pt-1">
          {agenda ? (
            <div className="flex items-center gap-3 text-xs">
              <a
                href={deckUrl(agenda.fileId)}
                target="_blank"
                rel="noopener noreferrer"
                {...tourAttr('classes.agenda-open-deck')}
                className="flex items-center gap-1 font-semibold text-brand-blue-primary hover:underline"
              >
                <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                {t('course.agenda.openDeck', { defaultValue: 'Open' })}
              </a>
              <button
                type="button"
                disabled={busy}
                onClick={() => void pickDeck()}
                {...tourAttr('classes.agenda-pick')}
                className="font-semibold text-slate-600 hover:text-brand-blue-primary disabled:opacity-50"
              >
                {t('course.agenda.change', { defaultValue: 'Change deck' })}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void removeDeck()}
                {...tourAttr('classes.agenda-remove')}
                className="font-semibold text-slate-600 hover:text-red-600 disabled:opacity-50"
              >
                {t('course.agenda.remove', { defaultValue: 'Remove' })}
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => void pickDeck()}
              {...tourAttr('classes.agenda-pick')}
              className="w-full px-2.5 py-1.5 text-xs font-semibold text-white bg-brand-blue-primary rounded-lg hover:bg-brand-blue-dark disabled:opacity-50"
            >
              {t('course.agenda.pick', {
                defaultValue: 'Select a Google Slides deck',
              })}
            </button>
          )}
          <p className="text-xxs text-slate-500">
            {t('course.agenda.firstSlide', {
              defaultValue:
                'Students see the first slide. Add each new day at the top.',
            })}
          </p>

          <PinnedLinksEditor
            links={course?.pinnedLinks ?? []}
            busy={busy}
            onSave={saveLinks}
          />

          {pageLink && (
            <button
              type="button"
              onClick={() => void copyPageLink()}
              title={pageLink}
              {...tourAttr('classes.agenda-copy-link')}
              className="flex items-center gap-1 py-1 text-xs font-semibold text-slate-600 hover:text-brand-blue-primary"
            >
              {copied ? (
                <Check
                  className="w-3.5 h-3.5 text-emerald-600"
                  aria-hidden="true"
                />
              ) : (
                <Link2 className="w-3.5 h-3.5" aria-hidden="true" />
              )}
              {copied
                ? t('course.agenda.copied', { defaultValue: 'Copied' })
                : t('course.agenda.copyLink', {
                    defaultValue: 'Copy Class page link',
                  })}
            </button>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="py-1 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
};
