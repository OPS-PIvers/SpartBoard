// Sync-or-copy picker for adding a PLC item to your own library.

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Cloud, X } from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import { PlcImportModeOptions } from './PlcImportModeOptions';
import type { SharedVideoActivityImportMode } from '@/hooks/useVideoActivityAssignments';

interface PlcVideoActivityImportModalProps {
  /** Title of the PLC video activity being imported. */
  activityTitle: string;
  /** Optional originator name (the teacher who first shared the activity). */
  sharedByName?: string;
  onPick: (mode: SharedVideoActivityImportMode) => void;
  onClose: () => void;
}

export const PlcVideoActivityImportModal: React.FC<
  PlcVideoActivityImportModalProps
> = ({ activityTitle, sharedByName, onPick, onClose }) => {
  const { t } = useTranslation();
  return (
    <Modal
      isOpen
      onClose={onClose}
      ariaLabel={t('plcDashboard.videoActivityImportModal.ariaLabel', {
        defaultValue: 'Choose how to import this video activity',
      })}
      maxWidth="max-w-md"
      contentClassName=""
      customHeader={
        <div className="flex items-start justify-between px-5 pt-5 pb-3 border-b border-slate-100">
          <div className="flex items-start gap-3">
            <div className="shrink-0 w-9 h-9 rounded-lg bg-brand-blue-lighter/40 text-brand-blue-primary flex items-center justify-center">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {t('plcDashboard.videoActivityImportModal.title', {
                  defaultValue: 'Add to my library',
                })}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5 truncate max-w-[20rem]">
                {sharedByName
                  ? t(
                      'plcDashboard.videoActivityImportModal.subtitleWithSharer',
                      {
                        title: activityTitle,
                        name: sharedByName,
                        defaultValue: '{{title}} · shared by {{name}}',
                      }
                    )
                  : activityTitle}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('plcDashboard.videoActivityImportModal.close', {
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
        <PlcImportModeOptions onPick={onPick} />
      </div>
    </Modal>
  );
};
