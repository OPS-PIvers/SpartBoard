import React from 'react';
import { useTranslation } from 'react-i18next';

interface FooterProps {
  allDone: boolean;
}

export const Footer: React.FC<FooterProps> = ({ allDone }) => {
  const { t } = useTranslation();

  if (!allDone) return null;

  return (
    <div
      className="shrink-0 bg-green-600/20 border-t border-green-500/20 text-center"
      style={{ padding: 'min(8px, 2cqmin)' }}
    >
      <span
        className="text-green-300 font-bold"
        style={{ fontSize: 'min(11px, 3cqmin)' }}
      >
        {t('widgets.onboarding.footer')}
      </span>
    </div>
  );
};
