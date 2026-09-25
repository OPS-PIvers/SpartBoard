// Sync-or-copy picker for adding a PLC assignment template to your board.

import React from 'react';
import { useTranslation } from 'react-i18next';
import { ClipboardList, X } from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import { PlcImportModeOptions } from './PlcImportModeOptions';
import type { SharedAssignmentImportMode } from '@/hooks/useQuizAssignments';

interface PlcAssignmentImportModalProps {
  /** Title of the PLC assignment template, displayed under the modal header. */
  quizTitle: string;
  /** Optional originator name (the teacher who shared the template). */
  sharedByName?: string;
  onPick: (mode: SharedAssignmentImportMode) => void;
  onClose: () => void;
}

export const PlcAssignmentImportModal: React.FC<
  PlcAssignmentImportModalProps
> = ({ quizTitle, sharedByName, onPick, onClose }) => {
  const { t } = useTranslation();
  return (
    <Modal
      isOpen
      onClose={onClose}
      ariaLabel={t('plcDashboard.assignmentImportModal.ariaLabel', {
        defaultValue: 'Choose how to import this assignment',
      })}
      maxWidth="max-w-md"
      contentClassName=""
      customHeader={
        <div className="flex items-start justify-between px-5 pt-5 pb-3 border-b border-slate-100">
          <div className="flex items-start gap-3">
            <div className="shrink-0 w-9 h-9 rounded-lg bg-brand-blue-lighter/40 text-brand-blue-primary flex items-center justify-center">
              <ClipboardList className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {t('plcDashboard.assignmentImportModal.title', {
                  defaultValue: 'Add to my board',
                })}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5 truncate max-w-[20rem]">
                {sharedByName
                  ? t('plcDashboard.assignmentImportModal.subtitleWithSharer', {
                      title: quizTitle,
                      name: sharedByName,
                      defaultValue: '{{title}} · shared by {{name}}',
                    })
                  : quizTitle}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('plcDashboard.assignmentImportModal.close', {
              defaultValue: 'Close',
            })}
            className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      }
    >
      <div className="px-5 pb-5 pt-4 space-y-3">
        <p className="text-xs text-slate-600">
          {t('plcDashboard.assignmentImportModal.prompt', {
            defaultValue: 'The assignment arrives paused.',
          })}
        </p>
        <PlcImportModeOptions onPick={onPick} />
      </div>
    </Modal>
  );
};
