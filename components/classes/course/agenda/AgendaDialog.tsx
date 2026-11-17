// The Agenda dialog for one class or Course: deck, who can open it, links and the Class page link.
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  Check,
  CircleHelp,
  ExternalLink,
  Link2,
  Trash2,
} from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import {
  chromeMuted,
  iconBtn,
  primaryBtn,
  secondaryBtn,
} from '@/components/common/lightChrome';
import { tourAttr } from '@/config/tourAnchors';
import type { CourseAgenda, CoursePinnedLink } from '@/utils/course/contract';
import { PinnedLinksEditor } from './PinnedLinksEditor';
import { DeckChooser } from './DeckChooser';
import { deckUrl, type SharingProblem } from './agendaLogic';

interface AgendaDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  agenda: CourseAgenda | null;
  /** Null while the deck's sharing is fine or not read yet. */
  problem: SharingProblem;
  /** True once a reading says students (and families, when needed) can open it. */
  sharingOk: boolean;
  needed: 'domain' | 'anyone';
  canFix: boolean;
  links: readonly CoursePinnedLink[];
  pageLink: string | null;
  copied: boolean;
  busy: boolean;
  error: string | null;
  /** Each resolves true once a deck is saved. */
  onPick: () => Promise<boolean>;
  onPaste: (text: string) => Promise<boolean>;
  onRemove: () => void;
  onFix: () => void;
  onSaveLinks: (links: CoursePinnedLink[]) => Promise<boolean>;
  onCopy: () => void;
}

const sectionLabel =
  'text-xxs font-bold uppercase tracking-widest text-slate-400';

export const AgendaDialog: React.FC<AgendaDialogProps> = ({
  isOpen,
  onClose,
  title,
  agenda,
  problem,
  sharingOk,
  needed,
  canFix,
  links,
  pageLink,
  copied,
  busy,
  error,
  onPick,
  onPaste,
  onRemove,
  onFix,
  onSaveLinks,
  onCopy,
}) => {
  const { t } = useTranslation();
  const [changing, setChanging] = useState(false);

  const sharingText =
    problem === 'students'
      ? t('course.agenda.studentsCantOpen', {
          defaultValue: "Students can't open this deck.",
        })
      : problem === 'families'
        ? t('course.agenda.familiesCantOpen', {
            defaultValue: "Families can't open this deck.",
          })
        : problem === 'unknown'
          ? t('course.agenda.cantCheckHint', {
              defaultValue:
                "Only the deck's owner can see and change who can open it.",
            })
          : needed === 'anyone'
            ? t('course.agenda.sharedAnyone', {
                defaultValue: 'Anyone with the link can view it.',
              })
            : t('course.agenda.sharedOrono', {
                defaultValue: 'Anyone in Orono with the link can view it.',
              });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      maxWidth="max-w-md"
      footer={
        <div className="flex justify-center">
          <button
            type="button"
            onClick={onClose}
            {...tourAttr('classes.agenda-done')}
            className={primaryBtn}
          >
            {t('course.agenda.done', { defaultValue: 'Done' })}
          </button>
        </div>
      }
    >
      <div className="divide-y divide-slate-200 text-sm">
        <section className="pb-4">
          <h3 className={sectionLabel}>
            {t('course.agenda.label', { defaultValue: 'Agenda' })}
          </h3>
          {agenda ? (
            <div className="mt-2 flex items-center gap-2">
              <a
                href={deckUrl(agenda.fileId)}
                target="_blank"
                rel="noopener noreferrer"
                {...tourAttr('classes.agenda-open-deck')}
                className="flex min-w-0 flex-1 items-center gap-1.5 font-semibold text-slate-900 hover:text-brand-blue-primary"
              >
                <span className="truncate">{agenda.title}</span>
                <ExternalLink
                  className="h-3.5 w-3.5 shrink-0 text-slate-400"
                  aria-hidden="true"
                />
              </a>
              <button
                type="button"
                disabled={busy}
                onClick={() => setChanging((v) => !v)}
                aria-expanded={changing}
                {...tourAttr('classes.agenda-change')}
                className={`${secondaryBtn} shrink-0 disabled:opacity-50`}
              >
                {t('course.agenda.change', { defaultValue: 'Change' })}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={onRemove}
                aria-label={t('course.agenda.remove', {
                  defaultValue: 'Remove deck',
                })}
                title={t('course.agenda.remove', {
                  defaultValue: 'Remove deck',
                })}
                {...tourAttr('classes.agenda-remove')}
                className={`${iconBtn} shrink-0 hover:text-brand-red-primary disabled:opacity-50`}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ) : null}
          {(!agenda || changing) && (
            <DeckChooser
              busy={busy}
              onPick={async () => {
                if (await onPick()) setChanging(false);
              }}
              onPaste={async (text) => {
                const ok = await onPaste(text);
                if (ok) setChanging(false);
                return ok;
              }}
            />
          )}
          <p className={`mt-2 text-xs ${chromeMuted}`}>
            {t('course.agenda.firstSlide', {
              defaultValue:
                'Students see the first slide. Add each new day at the top.',
            })}
          </p>
          {agenda && (problem !== null || sharingOk) && (
            <div
              role="status"
              className={`mt-3 flex items-center gap-2 text-xs ${
                problem === 'students' || problem === 'families'
                  ? 'text-amber-800'
                  : 'text-slate-600'
              }`}
            >
              {problem === 'students' || problem === 'families' ? (
                <AlertTriangle
                  className="h-4 w-4 shrink-0 text-amber-600"
                  aria-hidden="true"
                />
              ) : problem === 'unknown' ? (
                <CircleHelp
                  className="h-4 w-4 shrink-0 text-slate-400"
                  aria-hidden="true"
                />
              ) : (
                <Check
                  className="h-4 w-4 shrink-0 text-emerald-600"
                  aria-hidden="true"
                />
              )}
              <span className="min-w-0 flex-1">{sharingText}</span>
              {(problem === 'students' || problem === 'families') && canFix && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={onFix}
                  {...tourAttr('classes.agenda-fix-sharing')}
                  className={`${secondaryBtn} shrink-0 text-xs disabled:opacity-50`}
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
        </section>

        <section className="py-4">
          <h3 className={sectionLabel}>
            {t('course.agenda.links', { defaultValue: 'Links' })}
          </h3>
          <PinnedLinksEditor links={links} busy={busy} onSave={onSaveLinks} />
        </section>

        {pageLink && (
          <section className="flex items-center gap-2 pt-4">
            <div className="min-w-0 flex-1">
              <h3 className={sectionLabel}>
                {t('course.agenda.pageLinkLabel', {
                  defaultValue: 'Class page link',
                })}
              </h3>
              <p className={`mt-1 truncate text-xs ${chromeMuted}`}>
                {pageLink}
              </p>
            </div>
            <button
              type="button"
              onClick={onCopy}
              {...tourAttr('classes.agenda-copy-link')}
              className={`${secondaryBtn} inline-flex shrink-0 items-center gap-1.5`}
            >
              {copied ? (
                <Check className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Link2 className="h-4 w-4" aria-hidden="true" />
              )}
              {copied
                ? t('course.agenda.copied', { defaultValue: 'Copied' })
                : t('course.agenda.copyLink', { defaultValue: 'Copy link' })}
            </button>
          </section>
        )}
      </div>
      {error && (
        <p role="alert" className="pt-3 text-xs text-brand-red-primary">
          {error}
        </p>
      )}
    </Modal>
  );
};
