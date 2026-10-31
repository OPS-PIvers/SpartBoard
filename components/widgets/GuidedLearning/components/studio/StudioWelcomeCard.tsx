import React from 'react';
import { useTranslation } from 'react-i18next';
import { DoorOpen, Pin } from 'lucide-react';
import { tourAttr } from '@/config/tourAnchors';

interface StudioWelcomeCardProps {
  enabled: boolean;
  imageUrl: string;
  selected: boolean;
  onSelect: () => void;
  onEnabledChange: (next: boolean) => void;
}

/** Pinned first card in the filmstrip: opens the welcome screen editor; it never moves. */
export const StudioWelcomeCard: React.FC<StudioWelcomeCardProps> = ({
  enabled,
  imageUrl,
  selected,
  onSelect,
  onEnabledChange,
}) => {
  const { t } = useTranslation();
  return (
    <div className="group relative mb-2" data-testid="gl-studio-welcome-card">
      <button
        type="button"
        {...tourAttr('studio.welcome-card')}
        onClick={onSelect}
        aria-current={selected}
        aria-label={
          enabled ? t('glStudio.welcomeCard') : t('glStudio.welcomeOff')
        }
        title={t('glStudio.welcomePinned')}
        className={`relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-lg border-2 bg-slate-800 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40 ${
          selected
            ? 'border-brand-blue-primary'
            : 'border-transparent hover:border-slate-300'
        }`}
      >
        {imageUrl && (
          <img
            src={imageUrl}
            alt=""
            loading="lazy"
            decoding="async"
            draggable={false}
            className={`pointer-events-none absolute inset-0 h-full w-full object-cover ${
              enabled ? 'opacity-50' : 'opacity-20'
            }`}
          />
        )}
        <span
          className={`relative flex items-center gap-1 text-xs font-bold ${
            enabled ? 'text-white' : 'text-slate-400'
          }`}
        >
          <DoorOpen className="h-4 w-4" aria-hidden="true" />
          {t('glStudio.welcomeCard')}
        </span>
        <Pin
          className="absolute left-1.5 top-1.5 h-3 w-3 text-slate-300"
          aria-hidden="true"
        />
        {!enabled && (
          <span className="absolute bottom-1 left-1 rounded-sm bg-white/90 px-1.5 text-xxs font-bold text-slate-700">
            {t('glStudio.welcomeOff')}
          </span>
        )}
      </button>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={t('glStudio.welcomeToggle')}
        title={t('glStudio.welcomeToggle')}
        {...tourAttr('studio.welcome-toggle')}
        data-testid="gl-studio-welcome-toggle"
        onClick={() => onEnabledChange(!enabled)}
        className={`touch-target-expand absolute bottom-1.5 right-1.5 flex h-4 w-7 items-center rounded-full p-0.5 transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-white ${
          enabled ? 'bg-emerald-500' : 'bg-slate-500'
        }`}
      >
        <span
          aria-hidden="true"
          className={`h-3 w-3 rounded-full bg-white shadow transition-transform ${
            enabled ? 'translate-x-3' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
};
