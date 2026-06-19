/**
 * QuickCreateBar — a horizontal row of quick-create action buttons shown at the
 * top of the PLC Home page (PRD §6.3, Decision 4.2).
 *
 * The three buttons OPEN the existing in-PLC authoring modals directly so a
 * teacher can create real content from Home in one step — no detour through the
 * section first:
 *
 *   - "Assign quiz"           → `PlcNewQuizAssignmentModal` (pick from personal
 *                               library → configure → create paused assignment).
 *   - "Assign video activity" → `PlcNewVideoActivityAssignmentModal`.
 *   - "Add a doc"             → `PlcAddDocModal` (title + URL → `createDoc`).
 *
 * Modal open state is managed locally; the modal props mirror exactly what the
 * Quizzes / Video Activities / Docs bodies pass (assignment mode from
 * `getAssignmentMode`, the live `plc`). After a create commits we navigate to
 * the relevant section so the teacher lands on their fresh content.
 *
 * The two assignment buttons require a connected Drive + a non-empty personal
 * library (the modals enforce this internally, but we mirror the bodies'
 * disabled-reason affordance so the button explains itself before opening).
 *
 * Light-surface modal chrome (Home page) — normal Tailwind sizing, no cqmin.
 */

import React, { useCallback, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BookOpen, Film, FileText, type LucideIcon } from 'lucide-react';
import type { Plc } from '@/types';
import { useAuth } from '@/context/useAuth';
import { useQuiz } from '@/hooks/useQuiz';
import { useVideoActivity } from '@/hooks/useVideoActivity';
import type { PlcSectionId } from '@/components/plc/sections';
import { PlcNewQuizAssignmentModal } from '@/components/plc/PlcNewQuizAssignmentModal';
import { PlcNewVideoActivityAssignmentModal } from '@/components/plc/PlcNewVideoActivityAssignmentModal';
import { PlcAddDocModal } from '@/components/plc/docs/PlcAddDocModal';

interface QuickCreateBarProps {
  plc: Plc;
  onNavigate: (id: PlcSectionId) => void;
}

type QuickCreateModal = 'quiz' | 'video' | 'doc' | null;

interface QuickActionButton {
  key: Exclude<QuickCreateModal, null>;
  label: string;
  icon: LucideIcon;
  color: string;
  /** When set, the action is unavailable; the reason is shown as a tooltip. */
  disabledReason?: string;
}

export const QuickCreateBar: React.FC<QuickCreateBarProps> = ({
  plc,
  onNavigate,
}) => {
  const { t } = useTranslation();
  const { user, getAssignmentMode } = useAuth();

  // Library + Drive status feed the two assignment buttons' disabled reasons —
  // mirrors the Quizzes / Video Activities body CTAs so the affordance is
  // consistent. `useQuiz` / `useVideoActivity` early-return on undefined uid.
  const { quizzes, isDriveConnected: quizDriveConnected } = useQuiz(user?.uid);
  const { activities, isDriveConnected: videoDriveConnected } =
    useVideoActivity(user?.uid);

  const [openModal, setOpenModal] = useState<QuickCreateModal>(null);
  // Stable id so each disabled-reason can associate with its button via
  // aria-describedby (we keep buttons focusable + aria-disabled rather than
  // native-disabled so screen readers announce why).
  const reasonIdBase = useId();

  const quizDisabledReason: string | undefined = !quizDriveConnected
    ? t('plcDashboard.newAssignment.quiz.ctaDisabledDrive', {
        defaultValue: 'Connect Google Drive to assign a quiz.',
      })
    : quizzes.length === 0
      ? t('plcDashboard.newAssignment.quiz.ctaDisabledEmpty', {
          defaultValue:
            'You have no quizzes in your personal library yet. Create one in the Quiz widget first.',
        })
      : undefined;

  const videoDisabledReason: string | undefined = !videoDriveConnected
    ? t('plcDashboard.newAssignment.video.ctaDisabledDrive', {
        defaultValue: 'Connect Google Drive to assign a video activity.',
      })
    : activities.length === 0
      ? t('plcDashboard.newAssignment.video.ctaDisabledEmpty', {
          defaultValue:
            'You have no video activities in your personal library yet. Create one in the Video Activity widget first.',
        })
      : undefined;

  const actions: QuickActionButton[] = [
    {
      key: 'quiz',
      label: t('plcDashboard.home.quickCreate.quiz', {
        defaultValue: 'Assign quiz',
      }),
      icon: BookOpen,
      color:
        'bg-blue-50 text-blue-700 border-blue-100 hover:bg-blue-100 hover:border-blue-200',
      disabledReason: quizDisabledReason,
    },
    {
      key: 'video',
      label: t('plcDashboard.home.quickCreate.video', {
        defaultValue: 'Assign video activity',
      }),
      icon: Film,
      color:
        'bg-violet-50 text-violet-700 border-violet-100 hover:bg-violet-100 hover:border-violet-200',
      disabledReason: videoDisabledReason,
    },
    {
      key: 'doc',
      label: t('plcDashboard.home.quickCreate.doc', {
        defaultValue: 'Add a doc',
      }),
      icon: FileText,
      color:
        'bg-amber-50 text-amber-700 border-amber-100 hover:bg-amber-100 hover:border-amber-200',
    },
  ];

  const handleClick = useCallback((action: QuickActionButton) => {
    if (action.disabledReason !== undefined) return;
    setOpenModal(action.key);
  }, []);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {actions.map((action, index) => {
        const disabled = action.disabledReason !== undefined;
        const reasonId = `${reasonIdBase}-${index}`;
        return (
          <React.Fragment key={action.key}>
            <button
              type="button"
              aria-label={action.label}
              aria-disabled={disabled}
              aria-describedby={disabled ? reasonId : undefined}
              title={disabled ? action.disabledReason : action.label}
              onClick={disabled ? undefined : () => handleClick(action)}
              className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 ${action.color}`}
            >
              <action.icon className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{action.label}</span>
            </button>
            {disabled && (
              <span id={reasonId} className="sr-only">
                {action.disabledReason}
              </span>
            )}
          </React.Fragment>
        );
      })}

      {openModal === 'quiz' && (
        <PlcNewQuizAssignmentModal
          plc={plc}
          assignmentMode={getAssignmentMode('quiz')}
          onClose={() => setOpenModal(null)}
          onCreated={() => {
            setOpenModal(null);
            // Land the teacher on the Quizzes section so they see the new
            // (paused) assignment under In-progress.
            onNavigate('quizzes');
          }}
        />
      )}

      {openModal === 'video' && (
        <PlcNewVideoActivityAssignmentModal
          plc={plc}
          assignmentMode={getAssignmentMode('videoActivity')}
          onClose={() => setOpenModal(null)}
          onCreated={() => {
            setOpenModal(null);
            onNavigate('videoActivities');
          }}
        />
      )}

      {openModal === 'doc' && (
        <PlcAddDocModal
          plc={plc}
          onClose={() => setOpenModal(null)}
          onCreated={() => {
            setOpenModal(null);
            onNavigate('docs');
          }}
        />
      )}
    </div>
  );
};
