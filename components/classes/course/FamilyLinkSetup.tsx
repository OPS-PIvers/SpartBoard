// Thread E owns this file: the family link switch and its confirms (D10, D13, D14, D23).
import React, { useContext, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Copy, Loader2 } from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import { Toggle } from '@/components/common/Toggle';
import { primaryBtn, secondaryBtn } from '@/components/common/lightChrome';
import { tourAttr } from '@/config/tourAnchors';
import { AuthContext } from '@/context/AuthContextValue';
import { useGoogleDrive } from '@/hooks/useGoogleDrive';
import type { Course } from '@/utils/course/contract';
import { emailDomain } from '@/utils/course/deckSharing';
import { familyPageUrl } from '@/components/family/familyPageModel';
import {
  turnFamilyLinkOff,
  turnFamilyLinkOn,
  type FamilyLinkDeps,
  type FamilyLinkProblem,
} from './familyLinkActions';
import type { CourseGroupProps } from './types';

type Confirm = 'on' | 'off' | null;

export interface FamilyLinkControlProps extends FamilyLinkDeps {
  course: Course;
  /** The site's origin, for the address the teacher copies. */
  origin: string;
}

/** The switch, copy button and confirms for one saved Course; the dev harness renders it with fakes. */
export const FamilyLinkControl: React.FC<FamilyLinkControlProps> = ({
  course,
  origin,
  ...deps
}) => {
  const { t } = useTranslation();
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [unshare, setUnshare] = useState(true);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<FamilyLinkProblem | null>(null);
  const [copied, setCopied] = useState(false);
  const labelId = useId();
  const unshareId = useId();
  const on = course.familyLink?.on === true;
  const shareId = course.familyLink?.shareId;
  const hasDeck = !!course.agenda;

  const run = async () => {
    const turningOn = confirm === 'on';
    setBusy(true);
    setProblem(null);
    const result = turningOn
      ? await turnFamilyLinkOn(course, deps)
      : await turnFamilyLinkOff(course, unshare, deps);
    setBusy(false);
    setConfirm(null);
    setProblem(result);
  };

  const copy = async () => {
    if (!shareId) return;
    try {
      await navigator.clipboard.writeText(familyPageUrl(origin, shareId));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div data-testid="family-link-setup" className="px-2 pb-2">
      <div className="flex items-center gap-2 pl-8">
        <span
          id={labelId}
          className="flex-1 min-w-0 text-xs font-semibold text-slate-600"
        >
          {t('course.family.label')}
        </span>
        {on && shareId && (
          <button
            type="button"
            onClick={() => void copy()}
            {...tourAttr('classes.family-link-copy')}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-brand-blue-primary hover:bg-brand-blue-lighter touch-target-expand"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {copied ? t('course.family.copied') : t('course.family.copy')}
          </button>
        )}
        {busy && (
          <Loader2
            role="status"
            aria-label={t('course.family.saving')}
            className="h-4 w-4 animate-spin text-slate-400 motion-reduce:animate-none"
          />
        )}
        <Toggle
          checked={on}
          disabled={busy}
          size="xs"
          showLabels={false}
          label={t('course.family.label')}
          describedBy={labelId}
          anchor={tourAttr('classes.family-link-toggle')}
          onChange={(next) => {
            setProblem(null);
            setUnshare(true);
            setConfirm(next ? 'on' : 'off');
          }}
        />
      </div>
      {problem && (
        <p role="alert" className="mt-1 pl-8 text-xs text-brand-red-primary">
          {t(`course.family.problem.${problem}`)}
        </p>
      )}
      <Modal
        isOpen={confirm !== null}
        onClose={() => {
          if (!busy) setConfirm(null);
        }}
        title={
          confirm === 'on'
            ? t('course.family.confirmOn.title')
            : t('course.family.confirmOff.title')
        }
        footer={
          <div className="flex justify-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirm(null)}
              {...tourAttr('classes.family-link-cancel')}
              className={secondaryBtn}
            >
              {t('course.family.cancel')}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void run()}
              {...tourAttr('classes.family-link-confirm')}
              className={`${primaryBtn} inline-flex items-center gap-1.5`}
            >
              {busy && (
                <Loader2
                  className="h-4 w-4 animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
              )}
              {confirm === 'on'
                ? t('course.family.confirmOn.action')
                : t('course.family.confirmOff.action')}
            </button>
          </div>
        }
      >
        {confirm === 'on' ? (
          <div className="space-y-2 text-sm text-slate-600">
            <p>{t('course.family.confirmOn.body')}</p>
            {hasDeck && (
              <p className="font-semibold text-slate-900">
                {t('course.family.confirmOn.deck')}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3 text-sm text-slate-600">
            <p>{t('course.family.confirmOff.body')}</p>
            {hasDeck && (
              <label
                htmlFor={unshareId}
                className="flex items-start gap-2 text-slate-900"
              >
                <input
                  id={unshareId}
                  type="checkbox"
                  checked={unshare}
                  onChange={(e) => setUnshare(e.target.checked)}
                  {...tourAttr('classes.family-link-deck-private')}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-blue-primary"
                />
                <span>{t('course.family.confirmOff.unshare')}</span>
              </label>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

const FamilyLinkWithDrive: React.FC<{
  course: Course;
  saveCourse: CourseGroupProps['saveCourse'];
  email: string | null | undefined;
}> = ({ course, saveCourse, email }) => {
  const { driveService } = useGoogleDrive();
  return (
    <FamilyLinkControl
      course={course}
      saveCourse={saveCourse}
      drive={driveService}
      domain={emailDomain(email)}
      origin={window.location.origin}
    />
  );
};

/** One Course's family link in My Classes; a class with no saved Course has nothing to share yet. */
export const FamilyLinkSetup: React.FC<CourseGroupProps> = ({
  group,
  saveCourse,
}) => {
  // Read without useAuth so the class list still renders where no AuthProvider is mounted (its tests).
  const auth = useContext(AuthContext);
  if (!auth?.user || !group.course) return null;
  return (
    <FamilyLinkWithDrive
      course={group.course}
      saveCourse={saveCourse}
      email={auth.user.email}
    />
  );
};
