/**
 * PlcSyncConflictPrompt — the "Synced copy changed — keep yours / pull theirs"
 * prompt for the §5.2 auto-pull model (Decision 5.2).
 *
 * The auto-pull machinery ({@link usePlcAutoPullSync}) silently reconciles a
 * teacher's local replica with a teammate's published edit whenever the local
 * replica is clean. When the local replica has unsaved edits and the canonical
 * advanced, an auto-pull would clobber those edits — so instead the hook
 * surfaces a conflict and this modal asks the teacher to choose:
 *
 *   - "Keep yours"  → dismiss; acknowledge the teammate's version without
 *                     overwriting local edits (no re-prompt for that version).
 *   - "Pull theirs" → overwrite the local replica with canonical, discarding
 *                     the unsaved edits (the teacher's explicit choice).
 *
 * Both bodies (quiz + video activity) render this identically; it is purely
 * presentational and routes the choice back through `onResolve`.
 *
 * Surface: rendered over the PLC light-surface library (white card on slate),
 * so muted text uses the light-surface palette (`text-slate-600`) per the
 * project's contrast guidance. Both actions carry focus rings; this reuses the
 * shared `Modal` so Escape / backdrop-dismiss + focus management come for free
 * (Escape / backdrop dismiss == "keep yours", the non-destructive default).
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import type {
  PlcSyncConflict,
  PlcSyncConflictChoice,
} from '@/hooks/usePlcAutoPullSync';

interface PlcSyncConflictPromptProps {
  conflict: PlcSyncConflict;
  onResolve: (groupId: string, choice: PlcSyncConflictChoice) => void;
}

export const PlcSyncConflictPrompt: React.FC<PlcSyncConflictPromptProps> = ({
  conflict,
  onResolve,
}) => {
  const { t } = useTranslation();

  // Escape / backdrop dismiss is the non-destructive choice — keep local edits.
  const keepMine = () => onResolve(conflict.groupId, 'mine');
  const pullTheirs = () => onResolve(conflict.groupId, 'theirs');

  return (
    <Modal
      isOpen
      onClose={keepMine}
      title={t('plcDashboard.sync.conflictTitle', {
        defaultValue: 'Synced copy changed',
      })}
      maxWidth="max-w-md"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={keepMine}
            className="px-4 py-2 rounded-lg text-sm font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400/50"
          >
            {t('plcDashboard.sync.keepMine', { defaultValue: 'Keep yours' })}
          </button>
          <button
            type="button"
            onClick={pullTheirs}
            className="px-4 py-2 rounded-lg text-sm font-bold text-white bg-brand-blue-primary hover:bg-brand-blue-dark transition-colors focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/50"
          >
            {t('plcDashboard.sync.pullTheirs', { defaultValue: 'Pull theirs' })}
          </button>
        </div>
      }
    >
      <div className="flex items-start gap-3 pb-2">
        <div className="shrink-0 w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
          <AlertTriangle
            className="w-5 h-5 text-amber-600"
            aria-hidden="true"
          />
        </div>
        <p className="text-sm text-slate-600 leading-relaxed">
          {t('plcDashboard.sync.conflictBody', {
            title: conflict.title,
            defaultValue:
              'A teammate published a new version of "{{title}}" while you have unsaved edits. Keep your edits, or pull their version (your unsaved edits will be discarded)?',
          })}
        </p>
      </div>
    </Modal>
  );
};
