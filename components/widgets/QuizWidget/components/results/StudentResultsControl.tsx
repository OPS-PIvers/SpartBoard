import React, { useState } from 'react';
import type { TourAnchorAttrs, TourAnchorId } from '@/config/tourAnchors';
import {
  Eye,
  EyeOff,
  Loader2,
  LockOpen,
  MoreVertical,
  Users,
} from 'lucide-react';
import { OverflowMenu, SessionBadge } from '@/components/common/sessionViews';
import type { OverflowMenuItem } from '@/components/common/sessionViews';
import { PUBLISH_LEVEL_OPTIONS } from '@/components/common/library/publishScoreLevels';
import type {
  QuizResultsOverride,
  QuizScoreVisibility,
  ResultsProtection,
  Toast,
} from '@/types';
import { resultsOverrideState } from '@/utils/quizResultsVisibility';
import { logError } from '@/utils/logError';
import { tourFieldAttr } from '@/config/tourAnchors';
import { ShowResultsDialog } from './ShowResultsDialog';
import type { StudentResultsActions } from './studentResultsSelection';

const FOLLOW_CLASS_TIP =
  "Remove this student's override so they see what the class sees.";

const SHORT_LEVEL: Record<Exclude<QuizScoreVisibility, 'none'>, string> = {
  'score-only': 'score',
  'score-and-responses': 'responses',
  'score-responses-and-answers': 'answers',
};

const levelTitle = (v: QuizScoreVisibility): string =>
  PUBLISH_LEVEL_OPTIONS.find((o) => o.id === v)?.title ?? 'Not published';

const formatExpiry = (ms: number): string =>
  new Date(ms).toLocaleString(undefined, {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });

/** Row badge for a student whose results differ from the class; null when they follow it. */
export const ResultsOverrideBadge: React.FC<{
  override: QuizResultsOverride | undefined;
}> = ({ override }) => {
  const state = resultsOverrideState(override);
  if (!override || state === 'follows') return null;
  if (state === 'expired') {
    return <SessionBadge tone="neutral" label="Expired" />;
  }
  if (override.mode === 'hidden') {
    return <SessionBadge tone="warn" icon={EyeOff} label="Hidden" />;
  }
  return (
    <SessionBadge
      tone="info"
      icon={Eye}
      label={`Shown · ${SHORT_LEVEL[override.visibility]}`}
    />
  );
};

export interface StudentResultsControlProps {
  /** Response doc id under `/responses`. */
  responseKey: string;
  override: QuizResultsOverride | undefined;
  /** Only a finished response can be shown. */
  completed: boolean;
  displayName: string;
  /** The class-wide level, so "Follow class" can say what that means. */
  classVisibility: QuizScoreVisibility;
  actions: StudentResultsActions;
  addToast: (message: string, type?: Toast['type']) => void;
  /** 'menu' is the row kebab; 'panel' is the expanded-row control. */
  layout?: 'menu' | 'panel';
  /** Kebab trigger styling, for dark surfaces. */
  triggerClassName?: string;
  /** Offers Unlock in the menu when the student is locked out of their results. */
  onUnlock?: () => Promise<void>;
  /** Live-tour anchors for the kebab trigger and its items (menu layout). */
  triggerAnchor?: TourAnchorAttrs;
  tourId?: TourAnchorId;
  tourScope?: string;
}

/** Show, hide, or return one student's results to the class setting. */
export const StudentResultsControl: React.FC<StudentResultsControlProps> = ({
  responseKey: key,
  override,
  completed,
  displayName,
  classVisibility,
  actions,
  addToast,
  layout = 'menu',
  triggerClassName = 'rounded-md text-brand-gray-primary hover:bg-brand-gray-lightest hover:text-brand-blue-dark',
  onUnlock,
  triggerAnchor,
  tourId,
  tourScope,
}) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busy, setBusy] = useState<'hide' | 'clear' | 'unlock' | null>(null);
  const state = resultsOverrideState(override);
  const canShow = completed;

  const run = async (kind: 'hide' | 'clear' | 'unlock') => {
    setBusy(kind);
    try {
      if (kind === 'unlock') {
        await onUnlock?.();
        addToast(`Results unlocked for ${displayName}.`, 'success');
      } else if (kind === 'hide') {
        await actions.hide([key]);
        addToast(`Results hidden from ${displayName}.`, 'success');
      } else {
        await actions.clear([key]);
        addToast(`${displayName} now follows the class setting.`, 'success');
      }
    } catch (err) {
      logError(`StudentResultsControl.${kind}`, err);
      addToast(`Could not update ${displayName}. Try again.`, 'error');
    } finally {
      setBusy(null);
    }
  };

  const handleShow = async (
    visibility: Exclude<QuizScoreVisibility, 'none'>,
    expiresAt: number | null,
    protection: ResultsProtection | undefined
  ) => {
    try {
      await actions.publish([key], visibility, expiresAt, protection);
      addToast(`Results shown to ${displayName}.`, 'success');
      setDialogOpen(false);
    } catch (err) {
      logError('StudentResultsControl.publish', err);
      addToast(`Could not show results to ${displayName}. Try again.`, 'error');
    }
  };

  const showLabel =
    state === 'shown' ? 'Change results shown…' : 'Show results to student…';
  const canHide = state !== 'hidden';
  const canClear = state !== 'follows';

  const dialog = dialogOpen && (
    <ShowResultsDialog
      targetLabel={displayName}
      initialVisibility={
        override?.mode === 'shown' ? override.visibility : classVisibility
      }
      initialProtection={
        override?.mode === 'shown' ? override.protection : undefined
      }
      onClose={() => setDialogOpen(false)}
      onConfirm={handleShow}
    />
  );

  if (layout === 'menu') {
    const items: OverflowMenuItem[] = [];
    if (onUnlock)
      items.push({
        id: 'unlock',
        label: 'Unlock results',
        icon: LockOpen,
        loading: busy === 'unlock',
        onClick: () => void run('unlock'),
      });
    if (canShow)
      items.push({
        id: 'show',
        label: showLabel,
        icon: Eye,
        onClick: () => setDialogOpen(true),
      });
    if (canHide)
      items.push({
        id: 'hide',
        label: 'Hide results from student',
        icon: EyeOff,
        loading: busy === 'hide',
        onClick: () => void run('hide'),
      });
    if (canClear)
      items.push({
        id: 'clear',
        label: 'Follow class setting',
        title: FOLLOW_CLASS_TIP,
        icon: Users,
        loading: busy === 'clear',
        onClick: () => void run('clear'),
      });
    if (items.length === 0) return null;
    return (
      <>
        <OverflowMenu
          items={items}
          ariaLabel={`Results options for ${displayName}`}
          triggerIcon={MoreVertical}
          triggerProps={tourFieldAttr(
            'quiz-results.student-results-menu',
            'quiz',
            key
          )}
          triggerClassName={triggerClassName}
          triggerAnchor={triggerAnchor}
          tourId={tourId}
          tourScope={tourScope}
        />
        {dialog}
      </>
    );
  }

  const classLabel =
    classVisibility === 'none'
      ? 'class results not published'
      : `class sees ${levelTitle(classVisibility).toLowerCase()}`;
  let status: string;
  if (state === 'shown' && override?.mode === 'shown') {
    status = `Shown: ${levelTitle(override.visibility)}${
      typeof override.expiresAt === 'number'
        ? ` until ${formatExpiry(override.expiresAt)}`
        : ''
    }`;
  } else if (state === 'hidden') {
    status = 'Hidden from this student';
  } else if (state === 'expired') {
    status = `Expired; follows class (${classLabel})`;
  } else {
    status = `Follows class (${classLabel})`;
  }

  const buttonCls =
    'inline-flex items-center rounded-md border border-brand-gray-lighter bg-white font-sans font-semibold text-brand-blue-primary hover:border-brand-blue-light disabled:opacity-50 transition-colors';
  const buttonStyle = {
    gap: 'min(4px, 1cqmin)',
    padding: 'min(4px, 1cqmin) min(10px, 2.5cqmin)',
    fontSize: 'min(11px, 3.5cqmin)',
  };
  const iconStyle = { width: 'min(12px, 4cqmin)', height: 'min(12px, 4cqmin)' };

  return (
    <div
      className="flex flex-wrap items-center rounded-lg bg-brand-gray-lightest/60"
      style={{
        gap: 'min(6px, 1.5cqmin)',
        padding: 'min(6px, 1.5cqmin) min(10px, 2.5cqmin)',
      }}
    >
      <p
        className="flex-1 min-w-0 font-sans text-brand-gray-dark"
        style={{ fontSize: 'min(12px, 4cqmin)' }}
      >
        <span className="font-semibold">Results for this student: </span>
        {status}
      </p>
      {canShow && (
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          disabled={busy !== null}
          {...tourFieldAttr('quiz-results.student-show', 'quiz', key)}
          className={buttonCls}
          style={buttonStyle}
        >
          <Eye style={iconStyle} />
          {state === 'shown' ? 'Change' : 'Show results'}
        </button>
      )}
      {canHide && (
        <button
          type="button"
          onClick={() => void run('hide')}
          disabled={busy !== null}
          {...tourFieldAttr('quiz-results.student-hide', 'quiz', key)}
          className={buttonCls}
          style={buttonStyle}
        >
          {busy === 'hide' ? (
            <Loader2 className="animate-spin" style={iconStyle} />
          ) : (
            <EyeOff style={iconStyle} />
          )}
          Hide
        </button>
      )}
      {canClear && (
        <button
          type="button"
          onClick={() => void run('clear')}
          disabled={busy !== null}
          title={FOLLOW_CLASS_TIP}
          {...tourFieldAttr('quiz-results.student-follow-class', 'quiz', key)}
          className={buttonCls}
          style={buttonStyle}
        >
          {busy === 'clear' ? (
            <Loader2 className="animate-spin" style={iconStyle} />
          ) : (
            <Users style={iconStyle} />
          )}
          Follow class
        </button>
      )}
      {dialog}
    </div>
  );
};
