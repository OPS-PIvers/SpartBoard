import React, { useState } from 'react';
import { Eye, EyeOff, Loader2, MoreVertical, Users } from 'lucide-react';
import { OverflowMenu, SessionBadge } from '@/components/common/sessionViews';
import type { OverflowMenuItem } from '@/components/common/sessionViews';
import { PUBLISH_LEVEL_OPTIONS } from '@/components/common/library/publishScoreLevels';
import type {
  QuizResponse,
  QuizResultsOverride,
  QuizScoreVisibility,
  Toast,
} from '@/types';
import { resultsOverrideState } from '@/utils/quizResultsVisibility';
import { logError } from '@/utils/logError';
import { getResponseDocKey } from '@/hooks/useQuizSession';
import { ShowResultsDialog } from './ShowResultsDialog';
import type { StudentResultsActions } from './studentResultsSelection';

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
  response: QuizResponse;
  displayName: string;
  /** The class-wide level, so "Follow class" can say what that means. */
  classVisibility: QuizScoreVisibility;
  actions: StudentResultsActions;
  addToast: (message: string, type?: Toast['type']) => void;
  /** 'menu' is the row kebab; 'panel' is the expanded-row control. */
  layout?: 'menu' | 'panel';
}

/** Show, hide, or return one student's results to the class setting. */
export const StudentResultsControl: React.FC<StudentResultsControlProps> = ({
  response,
  displayName,
  classVisibility,
  actions,
  addToast,
  layout = 'menu',
}) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busy, setBusy] = useState<'hide' | 'clear' | null>(null);
  const key = getResponseDocKey(response);
  const override = response.resultsOverride;
  const state = resultsOverrideState(override);
  const canShow = response.status === 'completed';

  const run = async (kind: 'hide' | 'clear') => {
    setBusy(kind);
    try {
      if (kind === 'hide') {
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
    expiresAt: number | null
  ) => {
    try {
      await actions.publish([key], visibility, expiresAt);
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
      onClose={() => setDialogOpen(false)}
      onConfirm={handleShow}
    />
  );

  if (layout === 'menu') {
    const items: OverflowMenuItem[] = [];
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
          triggerClassName="rounded-md text-brand-gray-primary hover:bg-brand-gray-lightest hover:text-brand-blue-dark"
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
