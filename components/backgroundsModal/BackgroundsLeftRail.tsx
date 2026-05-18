import React from 'react';
import { useTranslation } from 'react-i18next';
import { Star, Clock } from 'lucide-react';

export type RailSection =
  | { kind: 'favorites' }
  | { kind: 'recent' }
  | { kind: 'category'; name: string }
  | { kind: 'colors' }
  | { kind: 'patterns' }
  | { kind: 'gradients' }
  | { kind: 'uploads' };

export const railSectionKey = (s: RailSection): string =>
  s.kind === 'category' ? `cat:${s.name}` : s.kind;

interface BackgroundsLeftRailProps {
  categories: string[];
  active: RailSection;
  onSelect: (s: RailSection) => void;
}

export const BackgroundsLeftRail: React.FC<BackgroundsLeftRailProps> = ({
  categories,
  active,
  onSelect,
}) => {
  const { t } = useTranslation();
  const isActive = (s: RailSection) =>
    railSectionKey(s) === railSectionKey(active);

  const item = (s: RailSection, label: React.ReactNode, indent = false) => (
    <button
      key={railSectionKey(s)}
      onClick={() => onSelect(s)}
      className={`w-full text-left px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${
        indent ? 'pl-6' : ''
      } ${
        isActive(s)
          ? 'bg-brand-blue-lighter text-brand-blue-dark'
          : 'text-slate-600 hover:bg-slate-100'
      }`}
    >
      {label}
    </button>
  );

  return (
    <nav className="w-44 shrink-0 border-r border-slate-100 p-3 flex flex-col gap-1 overflow-y-auto custom-scrollbar">
      {item(
        { kind: 'favorites' },
        <span className="inline-flex items-center gap-1.5">
          <Star size={12} />{' '}
          {t('backgrounds.favorites', { defaultValue: 'Favorites' })}
        </span>
      )}
      {item(
        { kind: 'recent' },
        <span className="inline-flex items-center gap-1.5">
          <Clock size={12} />{' '}
          {t('backgrounds.recent', { defaultValue: 'Recent' })}
        </span>
      )}

      {categories.length > 0 && (
        <div className="mt-3 px-3 text-xxs font-bold text-slate-400 uppercase tracking-widest">
          {t('backgrounds.media', { defaultValue: 'Media' })}
        </div>
      )}
      {categories.map((c) => item({ kind: 'category', name: c }, c, true))}

      <div className="mt-3 px-3 text-xxs font-bold text-slate-400 uppercase tracking-widest">
        {t('backgrounds.solids', { defaultValue: 'Solids' })}
      </div>
      {item(
        { kind: 'colors' },
        t('backgrounds.colors', { defaultValue: 'Colors' }),
        true
      )}
      {item(
        { kind: 'patterns' },
        t('backgrounds.patterns', { defaultValue: 'Patterns' }),
        true
      )}
      {item(
        { kind: 'gradients' },
        t('backgrounds.gradients', { defaultValue: 'Gradients' }),
        true
      )}

      <div className="mt-3 px-3 text-xxs font-bold text-slate-400 uppercase tracking-widest">
        {t('backgrounds.yours', { defaultValue: 'Yours' })}
      </div>
      {item(
        { kind: 'uploads' },
        t('backgrounds.uploads', { defaultValue: 'My Uploads' }),
        true
      )}
    </nav>
  );
};
