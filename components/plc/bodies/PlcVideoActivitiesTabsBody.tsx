/**
 * PlcVideoActivitiesTabsBody — Phase 3a video-activity section tab shell.
 *
 * Wraps the video-activity library surface in a three-sub-tab pill bar that
 * mirrors `PlcQuizzesBody` (Library / In-progress / Completed). The
 * In-progress and Completed sub-tabs reuse the shared
 * `PlcAssignmentsInProgress/CompletedSubTab` components, scoped to
 * `kind === 'video-activity'` so quiz rows never leak into the Video
 * Activities section.
 *
 * Sub-tabs:
 *
 *   - Library     — the existing `PlcVideoActivitiesBody` (PLC video-activity
 *                   templates awaiting pickup + share flow). Unchanged
 *                   internals.
 *   - In-progress — `plcs/{plcId}/assignment_index` filtered to
 *                   `status in ['active','paused']` AND
 *                   `kind === 'video-activity'`.
 *   - Completed   — same index filtered to `status === 'inactive'` AND
 *                   `kind === 'video-activity'`. Read-only history.
 */

import React, { useCallback, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BookOpen,
  History,
  Play,
  PlayCircle,
  type LucideIcon,
} from 'lucide-react';
import { Plc } from '@/types';
import { useAuth } from '@/context/useAuth';
import { useVideoActivity } from '@/hooks/useVideoActivity';
import { PlcVideoActivitiesBody } from './PlcVideoActivitiesBody';
import { PlcAssignmentsInProgressSubTab } from '../tabs/PlcAssignmentsInProgressSubTab';
import { PlcAssignmentsCompletedSubTab } from '../tabs/PlcAssignmentsCompletedSubTab';
import { PlcNewVideoActivityAssignmentModal } from '../PlcNewVideoActivityAssignmentModal';

type SubTabId = 'library' | 'inProgress' | 'completed';

interface SubTabDef {
  id: SubTabId;
  icon: LucideIcon;
  labelKey: string;
  labelDefault: string;
}

const SUB_TABS: readonly SubTabDef[] = [
  {
    id: 'library',
    icon: BookOpen,
    labelKey: 'plcDashboard.videoActivitiesSubTabs.library',
    labelDefault: 'Library',
  },
  {
    id: 'inProgress',
    icon: Play,
    labelKey: 'plcDashboard.videoActivitiesSubTabs.inProgress',
    labelDefault: 'In-progress',
  },
  {
    id: 'completed',
    icon: History,
    labelKey: 'plcDashboard.videoActivitiesSubTabs.completed',
    labelDefault: 'Completed',
  },
] as const;

interface PlcVideoActivitiesTabsBodyProps {
  plc: Plc;
}

export const PlcVideoActivitiesTabsBody: React.FC<
  PlcVideoActivitiesTabsBodyProps
> = ({ plc }) => {
  const { t } = useTranslation();
  const { user, getAssignmentMode } = useAuth();
  const [activeSubTab, setActiveSubTab] = useState<SubTabId>('library');
  // Wizard modal state for the top-level "+ Assign Video" CTA. Ported from
  // `PlcAssignmentsBody` as the standalone Assignments page is collapsed
  // into this section.
  const [newVideoOpen, setNewVideoOpen] = useState(false);
  // Stable id so the screen-reader-only disabled-reason text can be
  // associated with the CTA via `aria-describedby`. Native `disabled`
  // strips a button from the tab order, so we use `aria-disabled` + a
  // click guard instead so the control stays focusable and announces why.
  const videoCtaReasonId = useId();

  // Library counts + Drive-connect status feed the CTA disabled state.
  // Gated on `activeSubTab === 'library'` so the personal-library Firestore
  // listener (and Drive-token snapshot) only mounts when the CTA is
  // actually visible — In-progress / Completed don't render the CTA, so
  // paying for the listener there is wasted reads. `useVideoActivity`
  // early-returns when `userId` is undefined, so passing `undefined` is the
  // "off" switch.
  const ctaActive = activeSubTab === 'library';
  const { activities, isDriveConnected: videoDriveConnected } =
    useVideoActivity(ctaActive ? user?.uid : undefined);

  const openVideoWizard = useCallback(() => {
    setNewVideoOpen(true);
  }, []);

  // Snapshot the video-activity widget's org-wide assignment mode for the
  // wizard. Quiz and VA are gated by independent feature permissions.
  const videoAssignmentMode = getAssignmentMode('videoActivity');

  // CTA disabled-reason resolution. Drive-disconnect outranks empty library
  // because reconnecting Drive is a single immediate action; the empty
  // library requires authoring content first.
  const videoCtaDisabledReason: string | undefined = !videoDriveConnected
    ? t('plcDashboard.newAssignment.video.ctaDisabledDrive', {
        defaultValue: 'Connect Google Drive to assign a video activity.',
      })
    : activities.length === 0
      ? t('plcDashboard.newAssignment.video.ctaDisabledEmpty', {
          defaultValue:
            'You have no video activities in your personal library yet. Create one in the Video Activity widget first.',
        })
      : undefined;

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div
          role="tablist"
          aria-label={t('plcDashboard.videoActivitiesSubTabs.label', {
            defaultValue: 'Video activity views',
          })}
          className="flex flex-wrap gap-1 p-1 bg-slate-100 rounded-xl self-start"
        >
          {SUB_TABS.map((tab) => {
            const isActive = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                type="button"
                onClick={() => setActiveSubTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xxs font-bold uppercase tracking-wider transition-colors ${
                  isActive
                    ? 'bg-white text-brand-blue-dark shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <tab.icon className="w-3.5 h-3.5" aria-hidden="true" />
                {t(tab.labelKey, { defaultValue: tab.labelDefault })}
              </button>
            );
          })}
        </div>
        {activeSubTab === 'library' && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={
                videoCtaDisabledReason !== undefined
                  ? undefined
                  : openVideoWizard
              }
              aria-disabled={videoCtaDisabledReason !== undefined}
              aria-describedby={
                videoCtaDisabledReason !== undefined
                  ? videoCtaReasonId
                  : undefined
              }
              title={
                videoCtaDisabledReason ??
                t('plcDashboard.newAssignment.video.ctaTooltip', {
                  defaultValue:
                    'Create a PLC video activity assignment from your personal library.',
                })
              }
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-blue-primary text-white text-xs font-bold hover:bg-brand-blue-dark transition-colors aria-disabled:opacity-40 aria-disabled:cursor-not-allowed aria-disabled:hover:bg-brand-blue-primary"
            >
              <PlayCircle className="w-3.5 h-3.5" aria-hidden="true" />
              {t('plcDashboard.newAssignment.video.ctaLabel', {
                defaultValue: 'Assign Video',
              })}
            </button>
            {videoCtaDisabledReason !== undefined && (
              <span id={videoCtaReasonId} className="sr-only">
                {videoCtaDisabledReason}
              </span>
            )}
          </div>
        )}
      </div>
      <div className="flex-1 min-h-0">
        {activeSubTab === 'library' && <PlcVideoActivitiesBody plc={plc} />}
        {activeSubTab === 'inProgress' && (
          <PlcAssignmentsInProgressSubTab
            plc={plc}
            kindFilter="video-activity"
          />
        )}
        {activeSubTab === 'completed' && (
          <PlcAssignmentsCompletedSubTab
            plc={plc}
            kindFilter="video-activity"
          />
        )}
      </div>
      {newVideoOpen && (
        <PlcNewVideoActivityAssignmentModal
          plc={plc}
          assignmentMode={videoAssignmentMode}
          onClose={() => setNewVideoOpen(false)}
          onCreated={() => {
            // VA assignments don't have a Library template writer today —
            // only Quiz does. Without this nudge the teacher would land back
            // on the Library sub-tab with no visible change, even though
            // `assignment_index` now carries the new row. Jump to In-progress
            // so they see the freshly-created entry.
            setActiveSubTab('inProgress');
          }}
        />
      )}
    </div>
  );
};
