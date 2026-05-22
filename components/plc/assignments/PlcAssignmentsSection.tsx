/**
 * PlcAssignmentsSection — Stream B (replaces stub from Wave 1).
 *
 * Assignments surface inside the PLC left-rail. Renders:
 *   - Prominent "Create Quiz Assignment" + "Create Video Assignment" CTAs
 *     that open PlcAuthorQuizModal / PlcAuthorVideoActivityModal so teachers
 *     can author brand-new content entirely in-PLC.
 *   - Library / In-Progress / Completed sub-tabs (reusing existing
 *     PlcAssignmentsLibrarySubTab / InProgress / Completed bodies).
 *
 * Props: { plc: Plc }  — no onCloseDashboard board hand-off.
 */

import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ClipboardList,
  History,
  Play,
  PlayCircle,
  Plus,
  type LucideIcon,
} from 'lucide-react';
import { Plc } from '@/types';
import { PlcAssignmentsLibrarySubTab } from '../tabs/PlcAssignmentsLibrarySubTab';
import { PlcAssignmentsInProgressSubTab } from '../tabs/PlcAssignmentsInProgressSubTab';
import { PlcAssignmentsCompletedSubTab } from '../tabs/PlcAssignmentsCompletedSubTab';
import { PlcAuthorQuizModal } from '../authoring/PlcAuthorQuizModal';
import { PlcAuthorVideoActivityModal } from '../authoring/PlcAuthorVideoActivityModal';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
    icon: ClipboardList,
    labelKey: 'plcDashboard.assignmentsSubTabs.library',
    labelDefault: 'Library',
  },
  {
    id: 'inProgress',
    icon: Play,
    labelKey: 'plcDashboard.assignmentsSubTabs.inProgress',
    labelDefault: 'In-progress',
  },
  {
    id: 'completed',
    icon: History,
    labelKey: 'plcDashboard.assignmentsSubTabs.completed',
    labelDefault: 'Completed',
  },
] as const;

/** No-op callback for props that require a function but have no in-PLC action. */
const noop = () => undefined;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface PlcAssignmentsSectionProps {
  plc: Plc;
}

export const PlcAssignmentsSection: React.FC<PlcAssignmentsSectionProps> = ({
  plc,
}) => {
  const { t } = useTranslation();
  const [activeSubTab, setActiveSubTab] = useState<SubTabId>('library');
  const [authorQuizOpen, setAuthorQuizOpen] = useState(false);
  const [authorVideoOpen, setAuthorVideoOpen] = useState(false);

  const openAuthorQuiz = useCallback(() => {
    setAuthorVideoOpen(false);
    setAuthorQuizOpen(true);
  }, []);

  const openAuthorVideo = useCallback(() => {
    setAuthorQuizOpen(false);
    setAuthorVideoOpen(true);
  }, []);

  const handleAuthorQuizClose = useCallback(() => {
    setAuthorQuizOpen(false);
    // Jump to In-progress after creation so the new assignment is visible
    setActiveSubTab('inProgress');
  }, []);

  const handleAuthorVideoClose = useCallback(() => {
    setAuthorVideoOpen(false);
    setActiveSubTab('inProgress');
  }, []);

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Header: Create CTAs + sub-tab pill bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {/* Sub-tab pills */}
        <div
          role="tablist"
          aria-label={t('plcDashboard.assignmentsSubTabs.label', {
            defaultValue: 'Assignment views',
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

        {/* Create CTAs — always visible (in-PLC authoring, no library prerequisite) */}
        {activeSubTab === 'library' && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={openAuthorQuiz}
              title={t('plcDashboard.assignments.createQuizTooltip', {
                defaultValue: 'Author a new quiz and assign it in this PLC.',
              })}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-blue-primary text-white text-xs font-bold hover:bg-brand-blue-dark transition-colors"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              {t('plcDashboard.assignments.createQuizLabel', {
                defaultValue: 'Create Quiz',
              })}
            </button>
            <button
              type="button"
              onClick={openAuthorVideo}
              title={t('plcDashboard.assignments.createVideoTooltip', {
                defaultValue:
                  'Author a new video activity and assign it in this PLC.',
              })}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-blue-primary text-white text-xs font-bold hover:bg-brand-blue-dark transition-colors"
            >
              <PlayCircle className="w-3.5 h-3.5" aria-hidden="true" />
              {t('plcDashboard.assignments.createVideoLabel', {
                defaultValue: 'Create Video',
              })}
            </button>
          </div>
        )}
      </div>

      {/* Sub-tab content */}
      <div className="flex-1 min-h-0">
        {activeSubTab === 'library' && (
          <PlcAssignmentsLibrarySubTab
            plc={plc}
            // No onCloseDashboard — in-PLC flow, no board hand-off.
            // Pass a no-op so the sub-tab's existing "Edit all settings"
            // CTA doesn't crash if it tries to call it. The user stays in
            // the PLC to edit settings via PlcAssignmentConfigModal.
            onCloseDashboard={noop}
            onNewQuizAssignment={openAuthorQuiz}
            onNewVideoActivityAssignment={openAuthorVideo}
          />
        )}
        {activeSubTab === 'inProgress' && (
          <PlcAssignmentsInProgressSubTab plc={plc} />
        )}
        {activeSubTab === 'completed' && (
          <PlcAssignmentsCompletedSubTab plc={plc} />
        )}
      </div>

      {/* Authoring modals */}
      {authorQuizOpen && (
        <PlcAuthorQuizModal plc={plc} isOpen onClose={handleAuthorQuizClose} />
      )}
      {authorVideoOpen && (
        <PlcAuthorVideoActivityModal
          plc={plc}
          isOpen
          onClose={handleAuthorVideoClose}
        />
      )}
    </div>
  );
};
