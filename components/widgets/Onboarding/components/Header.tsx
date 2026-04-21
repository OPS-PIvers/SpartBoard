import React from 'react';
import { Rocket } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface HeaderProps {
  allDone: boolean;
}

export const Header: React.FC<HeaderProps> = ({ allDone }) => {
  const { t } = useTranslation();

  return (
    <div
      className="flex items-center gap-2 bg-brand-blue-primary shrink-0"
      style={{ padding: 'min(10px, 2.5cqmin) min(14px, 3cqmin)' }}
    >
      <Rocket
        style={{
          width: 'min(18px, 5cqmin)',
          height: 'min(18px, 5cqmin)',
          color: 'white',
          flexShrink: 0,
        }}
      />
      <span
        className="text-white font-black uppercase tracking-widest"
        style={{ fontSize: 'min(11px, 3.5cqmin)' }}
      >
        {t('widgets.onboarding.title')}
      </span>
      {allDone && (
        <span
          className="ml-auto bg-white/20 text-white rounded-full font-bold"
          style={{
            fontSize: 'min(9px, 2.8cqmin)',
            padding: 'min(2px, 0.6cqmin) min(6px, 1.5cqmin)',
          }}
        >
          {t('widgets.onboarding.allDone')}
        </span>
      )}
    </div>
  );
};
