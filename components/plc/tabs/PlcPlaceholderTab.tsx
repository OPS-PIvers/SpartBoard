import React from 'react';
import { useTranslation } from 'react-i18next';
import { LucideIcon } from 'lucide-react';

interface PlcPlaceholderTabProps {
  icon: LucideIcon;
  title: string;
  description: string;
}

/**
 * Inert placeholder for PLC Dashboard tabs that aren't built yet.
 * Phase 1 ships the shell with the navigation already in place; later
 * phases swap each placeholder for the real implementation.
 */
export const PlcPlaceholderTab: React.FC<PlcPlaceholderTabProps> = ({
  icon: Icon,
  title,
  description,
}) => {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[300px] px-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-brand-blue-lighter flex items-center justify-center mb-5">
        <Icon className="w-7 h-7 text-brand-blue-primary" />
      </div>
      <h3 className="text-lg font-bold text-slate-800 mb-2">{title}</h3>
      <p className="text-sm text-slate-500 max-w-md leading-relaxed">
        {description}
      </p>
      <span className="mt-5 text-xxs font-bold uppercase tracking-widest text-brand-blue-primary bg-brand-blue-lighter px-3 py-1 rounded-full">
        {t('plcDashboard.placeholder.comingSoon', {
          defaultValue: 'Coming soon',
        })}
      </span>
    </div>
  );
};
