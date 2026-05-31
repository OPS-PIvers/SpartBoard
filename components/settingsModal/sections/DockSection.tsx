/**
 * DockSection — every dock control in one place. Previously fragmented: dock
 * styling lived in the Style panel while dock *position* lived in Preferences.
 *
 * Scope is genuinely mixed here, so it's tagged per block rather than once in
 * the header:
 *  - transparency / corners / text  → per-board (GlobalStyle, shared editor)
 *  - position                       → account-wide (account preferences)
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { CheckSquare, Minimize } from 'lucide-react';
import { DockPosition, GlobalStyle } from '@/types';
import { useAuth } from '@/context/useAuth';
import { GlobalStyleEditor } from '@/hooks/useGlobalStyleEditor';
import { SettingsSectionHeader } from '@/components/settingsModal/SettingsSectionHeader';

interface DockSectionProps {
  editor: GlobalStyleEditor;
}

export const DockSection: React.FC<DockSectionProps> = ({ editor }) => {
  const { t } = useTranslation();
  const { currentStyle, setField } = editor;
  const { dockPosition, updateAccountPreferences } = useAuth();

  const boardTag = t('settings.scopeThisBoard', { defaultValue: 'This board' });
  const accountTag = t('settings.scopeAllBoards', {
    defaultValue: 'All boards',
  });

  const dockOptions: { value: DockPosition; label: string }[] = [
    {
      value: 'bottom',
      label: t('sidebar.settings.dockBottom', { defaultValue: 'Bottom' }),
    },
    {
      value: 'left',
      label: t('sidebar.settings.dockLeft', { defaultValue: 'Left' }),
    },
    {
      value: 'right',
      label: t('sidebar.settings.dockRight', { defaultValue: 'Right' }),
    },
  ];

  return (
    <div className="p-5 space-y-6">
      <SettingsSectionHeader
        icon={<Minimize className="w-4 h-4 rotate-90" />}
        title={t('style.dock', { defaultValue: 'Dock' })}
        description={t('style.dockDescription', {
          defaultValue: 'Appearance and placement of the widget dock.',
        })}
      />

      {/* Position — account-wide */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-xxs font-bold text-slate-400 uppercase tracking-widest">
            {t('sidebar.settings.dockPosition', { defaultValue: 'Position' })}
          </h3>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
            {accountTag}
          </span>
        </div>
        <div
          role="radiogroup"
          aria-label={t('sidebar.settings.dockPosition', {
            defaultValue: 'Dock Position',
          })}
          className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5"
        >
          {dockOptions.map((option) => {
            const active = dockPosition === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() =>
                  void updateAccountPreferences({ dockPosition: option.value })
                }
                className={`px-2.5 py-1 text-xxs font-bold rounded-md transition-colors ${
                  active
                    ? 'bg-white text-slate-800 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Transparency — per-board */}
      <div className="space-y-3 pt-2 border-t border-slate-100">
        <div className="flex justify-between items-center px-1 pt-2">
          <h3 className="text-xxs font-bold text-slate-400 uppercase tracking-widest">
            {t('style.transparency', { defaultValue: 'Transparency' })}
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-xxs font-mono font-bold text-brand-blue-primary">
              {Math.round(editor.dockTransparency.value * 100)}%
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
              {boardTag}
            </span>
          </div>
        </div>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={editor.dockTransparency.value}
          onChange={(e) =>
            editor.dockTransparency.onChange(parseFloat(e.target.value))
          }
          className="w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-brand-blue-primary"
        />
      </div>

      {/* Corners — per-board */}
      <div className="space-y-3">
        <h3 className="text-xxs font-bold text-slate-400 uppercase tracking-widest px-1">
          {t('style.corners', { defaultValue: 'Corners' })}
        </h3>
        <div className="flex bg-slate-100 p-0.5 rounded-lg">
          {[
            {
              id: 'none',
              label: t('style.cornerSquare', { defaultValue: 'Square' }),
            },
            {
              id: 'lg',
              label: t('style.cornerSoft', { defaultValue: 'Soft' }),
            },
            {
              id: '2xl',
              label: t('style.cornerRound', { defaultValue: 'Round' }),
            },
            {
              id: 'full',
              label: t('style.cornerFull', { defaultValue: 'Full' }),
            },
          ].map((r) => (
            <button
              key={r.id}
              onClick={() =>
                setField(
                  'dockBorderRadius',
                  r.id as GlobalStyle['dockBorderRadius']
                )
              }
              className={`flex-1 py-1.5 rounded-md text-xxs font-bold uppercase transition-all ${
                currentStyle.dockBorderRadius === r.id
                  ? 'bg-white shadow-sm text-brand-blue-primary'
                  : 'text-slate-500'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Text — per-board */}
      <div className="space-y-3">
        <h3 className="text-xxs font-bold text-slate-400 uppercase tracking-widest px-1">
          {t('style.dockText', { defaultValue: 'Dock Text' })}
        </h3>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3 bg-white p-2 rounded-lg border border-slate-100">
            <input
              type="color"
              value={currentStyle.dockTextColor}
              onChange={(e) => setField('dockTextColor', e.target.value)}
              className="w-8 h-8 rounded-md border border-slate-200 bg-white cursor-pointer"
            />
            <span className="text-xxs font-bold text-slate-600 uppercase">
              {t('style.textColor', { defaultValue: 'Text Color' })}
            </span>
          </div>

          <button
            onClick={() =>
              setField('dockTextShadow', !currentStyle.dockTextShadow)
            }
            className={`flex items-center justify-between p-3 rounded-lg border transition-all ${
              currentStyle.dockTextShadow
                ? 'bg-white border-brand-blue-primary text-brand-blue-dark shadow-sm'
                : 'bg-white border-slate-100 text-slate-500'
            }`}
          >
            <span className="text-xxs font-bold uppercase tracking-wider">
              {t('style.textShadow', { defaultValue: 'Text Shadow' })}
            </span>
            {currentStyle.dockTextShadow && (
              <CheckSquare className="w-4 h-4 text-brand-blue-primary" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
