import React from 'react';
import { useTranslation } from 'react-i18next';
import { Cloud, Copy } from 'lucide-react';

export type PlcImportMode = 'sync' | 'copy';

interface ModeOptionProps {
  mode: PlcImportMode;
  title: string;
  body: string;
  Icon: React.ComponentType<{ className?: string }>;
  recommendedLabel?: string;
  onPick: (mode: PlcImportMode) => void;
}

const ModeOption: React.FC<ModeOptionProps> = ({
  mode,
  title,
  body,
  Icon,
  recommendedLabel,
  onPick,
}) => (
  <button
    type="button"
    onClick={() => onPick(mode)}
    className="w-full text-left rounded-xl border border-slate-200 bg-white px-4 py-4 transition-all hover:border-brand-blue-primary hover:shadow-md focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40"
  >
    <div className="flex items-start gap-3">
      <div className="shrink-0 w-10 h-10 rounded-lg bg-brand-blue-lighter/40 text-brand-blue-primary flex items-center justify-center">
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="font-bold text-slate-900 text-sm">{title}</h3>
          {recommendedLabel && (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
              {recommendedLabel}
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-slate-600 leading-relaxed">{body}</p>
      </div>
    </div>
  </button>
);

// Sync vs copy choice shared by the PLC quiz, video activity and assignment import modals.
export const PlcImportModeOptions: React.FC<{
  onPick: (mode: PlcImportMode) => void;
}> = ({ onPick }) => {
  const { t } = useTranslation();
  return (
    <>
      <ModeOption
        mode="sync"
        title={t('plcDashboard.quizImportModal.syncTitle', {
          defaultValue: 'Synced',
        })}
        body={t('plcDashboard.quizImportModal.syncBody', {
          defaultValue:
            'Stays linked. Edits by anyone on the team, you included, reach everyone.',
        })}
        Icon={Cloud}
        recommendedLabel={t('plcDashboard.quizImportModal.recommendedLabel', {
          defaultValue: 'Recommended for PLCs',
        })}
        onPick={onPick}
      />
      <ModeOption
        mode="copy"
        title={t('plcDashboard.quizImportModal.copyTitle', {
          defaultValue: 'Make a copy',
        })}
        body={t('plcDashboard.quizImportModal.copyBody', {
          defaultValue: 'Your own copy. Edits stay separate.',
        })}
        Icon={Copy}
        onPick={onPick}
      />
    </>
  );
};
