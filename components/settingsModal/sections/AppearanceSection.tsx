/**
 * AppearanceSection — the board's look: typography, window transparency &
 * corners, and brand colors. All per-board (writes to the active dashboard's
 * GlobalStyle via the shared editor), hence the "This board" scope chip.
 *
 * Dock-specific styling lives in DockSection so every dock control sits in one
 * place; this section is everything else visual.
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckSquare, ChevronRight, Palette, RotateCcw } from 'lucide-react';
import { GlobalFontFamily, GlobalStyle, DEFAULT_GLOBAL_STYLE } from '@/types';
import { GlobalStyleEditor } from '@/hooks/useGlobalStyleEditor';
import { SettingsSectionHeader } from '../SettingsSectionHeader';

const FONT_OPTIONS: { id: GlobalFontFamily; label: string; font: string }[] = [
  { id: 'sans', label: 'Modern Sans', font: 'font-sans' },
  { id: 'serif', label: 'Classic Serif', font: 'font-serif' },
  { id: 'rounded', label: 'Soft Rounded', font: 'font-rounded' },
  { id: 'handwritten', label: 'Handwritten', font: 'font-handwritten' },
  { id: 'comic', label: 'Comic Style', font: 'font-comic' },
  { id: 'fun', label: 'Playful Fun', font: 'font-fun' },
  { id: 'slab', label: 'Classic Slab', font: 'font-slab' },
  { id: 'retro', label: '8-Bit Retro', font: 'font-retro' },
  { id: 'marker', label: 'Permanent Marker', font: 'font-marker' },
  { id: 'cursive', label: 'Elegant Cursive', font: 'font-cursive' },
  { id: 'mono', label: 'Digital Mono', font: 'font-mono' },
];

const DEFAULT_PRIMARY_COLOR = DEFAULT_GLOBAL_STYLE.primaryColor ?? '#2d3f89';
const DEFAULT_ACCENT_COLOR = DEFAULT_GLOBAL_STYLE.accentColor ?? '#ad2122';
const DEFAULT_WINDOW_TITLE_COLOR =
  DEFAULT_GLOBAL_STYLE.windowTitleColor ?? '#ffffff';

interface ColorRowProps {
  title: string;
  hex: string;
  onChange: (hex: string) => void;
  onReset: () => void;
}

const ColorRow: React.FC<ColorRowProps> = ({
  title,
  hex,
  onChange,
  onReset,
}) => {
  const { t } = useTranslation();
  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center px-1">
        <h3 className="text-xxs font-bold text-slate-400 uppercase tracking-widest">
          {title}
        </h3>
        <button
          onClick={onReset}
          className="text-xxs font-bold uppercase text-slate-400 hover:text-brand-blue-primary flex items-center gap-1"
          title={t('style.resetToDefault', {
            defaultValue: 'Reset to default',
          })}
        >
          <RotateCcw className="w-3 h-3" />{' '}
          {t('style.reset', { defaultValue: 'Reset' })}
        </button>
      </div>
      <div className="flex items-center gap-3 bg-white p-2 rounded-lg border border-slate-100">
        <input
          type="color"
          value={hex}
          onChange={(e) => onChange(e.target.value)}
          className="w-8 h-8 rounded-md border border-slate-200 bg-white cursor-pointer"
        />
        <div className="flex flex-col">
          <span className="text-xxs font-bold text-slate-600 uppercase">
            {title}
          </span>
          <span className="text-xxs font-mono text-slate-400">{hex}</span>
        </div>
      </div>
    </div>
  );
};

interface AppearanceSectionProps {
  editor: GlobalStyleEditor;
}

export const AppearanceSection: React.FC<AppearanceSectionProps> = ({
  editor,
}) => {
  const { t } = useTranslation();
  const { currentStyle, setField, commit, windowTransparency } = editor;
  const [isFontMenuOpen, setIsFontMenuOpen] = useState(false);

  return (
    <div className="p-5 space-y-6">
      <SettingsSectionHeader
        icon={<Palette className="w-4 h-4" />}
        title={t('sidebar.nav.globalStyle', { defaultValue: 'Appearance' })}
        description={t('style.appearanceDescription', {
          defaultValue:
            'Fonts, transparency, and colors for the current board.',
        })}
        scopeLabel={t('settings.scopeThisBoard', {
          defaultValue: 'This board',
        })}
      />

      {/* Typography */}
      <div className="space-y-3">
        <div className="flex justify-between items-center px-1">
          <h3 className="text-xxs font-bold text-slate-400 uppercase tracking-widest">
            {t('style.typography', { defaultValue: 'Typography' })}
          </h3>
          <button
            onClick={() => setIsFontMenuOpen(!isFontMenuOpen)}
            className="text-xxs font-bold uppercase text-brand-blue-primary"
          >
            {isFontMenuOpen
              ? t('common.close', { defaultValue: 'Close' })
              : t('common.change', { defaultValue: 'Change' })}
          </button>
        </div>

        <div className="relative">
          <button
            onClick={() => setIsFontMenuOpen(!isFontMenuOpen)}
            className="w-full flex items-center justify-between p-3 rounded-lg border bg-white border-slate-200 text-slate-800"
          >
            <span
              className={`text-sm font-bold font-${currentStyle.fontFamily}`}
            >
              {
                FONT_OPTIONS.find((f) => f.id === currentStyle.fontFamily)
                  ?.label
              }
            </span>
            <ChevronRight
              className={`w-4 h-4 transition-transform ${isFontMenuOpen ? 'rotate-90' : ''}`}
            />
          </button>

          <div
            className={`overflow-hidden transition-all duration-300 ${
              isFontMenuOpen ? 'max-h-96 mt-2' : 'max-h-0'
            }`}
          >
            <div className="grid grid-cols-1 gap-1 p-1 bg-slate-50 rounded-xl border border-slate-200">
              {FONT_OPTIONS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => {
                    setField('fontFamily', f.id);
                    setIsFontMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between p-2.5 rounded-md transition-all ${
                    currentStyle.fontFamily === f.id
                      ? 'bg-brand-blue-primary text-white shadow-sm'
                      : 'bg-white hover:bg-slate-50 text-slate-600'
                  }`}
                >
                  <span className={`text-xs font-bold ${f.font}`}>
                    {f.label}
                  </span>
                  {currentStyle.fontFamily === f.id && (
                    <CheckSquare className="w-3.5 h-3.5 text-white" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Window Transparency */}
      <div className="space-y-3">
        <div className="flex justify-between items-center px-1">
          <h3 className="text-xxs font-bold text-slate-400 uppercase tracking-widest">
            {t('style.transparency', { defaultValue: 'Transparency' })}
          </h3>
          <span className="text-xxs font-mono font-bold text-brand-blue-primary">
            {Math.round(windowTransparency.value * 100)}%
          </span>
        </div>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={windowTransparency.value}
          onChange={(e) =>
            windowTransparency.onChange(parseFloat(e.target.value))
          }
          className="w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-brand-blue-primary"
        />
      </div>

      {/* Window Corners */}
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
              id: '3xl',
              label: t('style.cornerExtra', { defaultValue: 'Extra' }),
            },
          ].map((r) => (
            <button
              key={r.id}
              onClick={() =>
                setField(
                  'windowBorderRadius',
                  r.id as GlobalStyle['windowBorderRadius']
                )
              }
              className={`flex-1 py-1.5 rounded-md text-xxs font-bold uppercase transition-all ${
                currentStyle.windowBorderRadius === r.id
                  ? 'bg-white shadow-sm text-brand-blue-primary'
                  : 'text-slate-500'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Colors */}
      <div className="space-y-4 pt-2 border-t border-slate-100">
        <p className="text-xxs text-slate-400 px-1 leading-relaxed pt-2">
          {t('style.colorsDescription', {
            defaultValue:
              'Set custom brand colors for this dashboard. These are injected as CSS variables and used throughout the interface.',
          })}
        </p>

        <ColorRow
          title={t('style.primaryColor', { defaultValue: 'Primary Color' })}
          hex={currentStyle.primaryColor ?? DEFAULT_PRIMARY_COLOR}
          onChange={(hex) => setField('primaryColor', hex)}
          onReset={() => setField('primaryColor', undefined)}
        />
        <ColorRow
          title={t('style.accentColor', { defaultValue: 'Accent Color' })}
          hex={currentStyle.accentColor ?? DEFAULT_ACCENT_COLOR}
          onChange={(hex) => setField('accentColor', hex)}
          onReset={() => setField('accentColor', undefined)}
        />
        <ColorRow
          title={t('style.windowTitleColor', {
            defaultValue: 'Window Title Color',
          })}
          hex={currentStyle.windowTitleColor ?? DEFAULT_WINDOW_TITLE_COLOR}
          onChange={(hex) => setField('windowTitleColor', hex)}
          onReset={() => setField('windowTitleColor', undefined)}
        />

        <button
          onClick={() =>
            commit({
              primaryColor: undefined,
              accentColor: undefined,
              windowTitleColor: undefined,
            })
          }
          className="w-full py-2 bg-slate-100 text-slate-500 rounded-xl font-bold text-xxs uppercase tracking-widest hover:bg-slate-200 transition-all"
        >
          {t('style.resetAllColors', {
            defaultValue: 'Reset All Colors to Default',
          })}
        </button>
      </div>
    </div>
  );
};
