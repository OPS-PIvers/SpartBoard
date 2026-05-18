import React, { useState, useCallback } from 'react';
import {
  CheckSquare,
  ChevronRight,
  Maximize,
  Minimize,
  Palette,
  RotateCcw,
} from 'lucide-react';
import {
  Dashboard,
  GlobalFontFamily,
  GlobalStyle,
  DEFAULT_GLOBAL_STYLE,
} from '@/types';
import { useDebouncedCallback } from '@/hooks/useDebouncedCallback';

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

interface StylePanelProps {
  isVisible: boolean;
  activeDashboard: Dashboard | null | undefined;
  setGlobalStyle: (style: GlobalStyle) => void;
  addToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

// Derived from DEFAULT_GLOBAL_STYLE so defaults stay in sync across the app
const DEFAULT_PRIMARY_COLOR = DEFAULT_GLOBAL_STYLE.primaryColor ?? '#2d3f89';
const DEFAULT_ACCENT_COLOR = DEFAULT_GLOBAL_STYLE.accentColor ?? '#ad2122';
const DEFAULT_WINDOW_TITLE_COLOR =
  DEFAULT_GLOBAL_STYLE.windowTitleColor ?? '#ffffff';

export const StylePanel: React.FC<StylePanelProps> = ({
  isVisible,
  activeDashboard,
  setGlobalStyle,
}) => {
  const [styleTab, setStyleTab] = useState<'window' | 'dock' | 'colors'>(
    'window'
  );
  const [isFontMenuOpen, setIsFontMenuOpen] = useState(false);

  const currentStyle = activeDashboard?.globalStyle ?? DEFAULT_GLOBAL_STYLE;

  // Immediate writes for discrete controls (font, corner-radius buttons, color pickers, toggles)
  const commit = useCallback(
    (next: GlobalStyle) => setGlobalStyle(next),
    [setGlobalStyle]
  );

  // Debounced writes for continuous sliders to avoid Firestore write thrash during drag
  const commitDebounced = useDebouncedCallback(commit, 200);

  // Helpers
  const setField = <K extends keyof GlobalStyle>(
    field: K,
    value: GlobalStyle[K]
  ) => commit({ ...currentStyle, [field]: value });

  const setFieldDebounced = <K extends keyof GlobalStyle>(
    field: K,
    value: GlobalStyle[K]
  ) => commitDebounced({ ...currentStyle, [field]: value });

  return (
    <div
      className={`absolute inset-0 flex flex-col transition-all duration-300 ease-in-out ${
        isVisible
          ? 'translate-x-0 opacity-100 visible'
          : 'translate-x-full opacity-0 invisible'
      }`}
    >
      {/* TABS */}
      <div className="bg-white border-b border-slate-100 sticky top-0 z-20">
        <div className="p-4">
          <div className="flex bg-slate-100 p-0.5 rounded-lg text-xxs font-bold uppercase tracking-widest">
            <button
              onClick={() => setStyleTab('window')}
              className={`flex-1 py-1.5 rounded-md flex items-center justify-center gap-2 transition-all ${
                styleTab === 'window'
                  ? 'bg-white shadow-sm text-brand-blue-primary'
                  : 'text-slate-500'
              }`}
            >
              <Maximize className="w-3.5 h-3.5" /> Window
            </button>

            <button
              onClick={() => setStyleTab('dock')}
              className={`flex-1 py-1.5 rounded-md flex items-center justify-center gap-2 transition-all ${
                styleTab === 'dock'
                  ? 'bg-white shadow-sm text-brand-blue-primary'
                  : 'text-slate-500'
              }`}
            >
              <Minimize className="w-3.5 h-3.5 rotate-90" /> Dock
            </button>

            <button
              onClick={() => setStyleTab('colors')}
              className={`flex-1 py-1.5 rounded-md flex items-center justify-center gap-2 transition-all ${
                styleTab === 'colors'
                  ? 'bg-white shadow-sm text-brand-blue-primary'
                  : 'text-slate-500'
              }`}
            >
              <Palette className="w-3.5 h-3.5" /> Colors
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar pb-6">
        {/* Global Font Family - Always visible */}
        <div className="space-y-3">
          <div className="flex justify-between items-center px-1">
            <h3 className="text-xxs font-bold text-slate-400 uppercase tracking-widest">
              Typography
            </h3>
            <button
              onClick={() => setIsFontMenuOpen(!isFontMenuOpen)}
              className="text-xxs font-bold uppercase text-brand-blue-primary"
            >
              {isFontMenuOpen ? 'Close' : 'Change'}
            </button>
          </div>

          <div className="relative">
            {/* Selected Font */}
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

            {/* Collapsible Font List */}
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

        {styleTab === 'window' ? (
          <div className="space-y-6 animate-in fade-in slide-in-from-left-2 duration-300">
            {/* Window Transparency */}
            <div className="space-y-3">
              <div className="flex justify-between items-center px-1">
                <h3 className="text-xxs font-bold text-slate-400 uppercase tracking-widest">
                  Transparency
                </h3>
                <span className="text-xxs font-mono font-bold text-brand-blue-primary">
                  {Math.round(currentStyle.windowTransparency * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={currentStyle.windowTransparency}
                onChange={(e) =>
                  setFieldDebounced(
                    'windowTransparency',
                    parseFloat(e.target.value)
                  )
                }
                className="w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-brand-blue-primary"
              />
            </div>

            {/* Window Corners */}
            <div className="space-y-3">
              <h3 className="text-xxs font-bold text-slate-400 uppercase tracking-widest px-1">
                Corners
              </h3>
              <div className="flex bg-slate-100 p-0.5 rounded-lg">
                {[
                  { id: 'none', label: 'Square' },
                  { id: 'lg', label: 'Soft' },
                  { id: '2xl', label: 'Round' },
                  { id: '3xl', label: 'Extra' },
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
          </div>
        ) : styleTab === 'dock' ? (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-2 duration-300">
            {/* Dock Transparency */}
            <div className="space-y-3">
              <div className="flex justify-between items-center px-1">
                <h3 className="text-xxs font-bold text-slate-400 uppercase tracking-widest">
                  Transparency
                </h3>
                <span className="text-xxs font-mono font-bold text-brand-blue-primary">
                  {Math.round(currentStyle.dockTransparency * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={currentStyle.dockTransparency}
                onChange={(e) =>
                  setFieldDebounced(
                    'dockTransparency',
                    parseFloat(e.target.value)
                  )
                }
                className="w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-brand-blue-primary"
              />
            </div>

            {/* Dock Corners */}
            <div className="space-y-3">
              <h3 className="text-xxs font-bold text-slate-400 uppercase tracking-widest px-1">
                Corners
              </h3>
              <div className="flex bg-slate-100 p-0.5 rounded-lg">
                {[
                  { id: 'none', label: 'Square' },
                  { id: 'lg', label: 'Soft' },
                  { id: '2xl', label: 'Round' },
                  { id: 'full', label: 'Full' },
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

            {/* Dock Text Style */}
            <div className="space-y-3">
              <h3 className="text-xxs font-bold text-slate-400 uppercase tracking-widest px-1">
                Dock Text
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
                    Text Color
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
                    Text Shadow
                  </span>
                  {currentStyle.dockTextShadow && (
                    <CheckSquare className="w-4 h-4 text-brand-blue-primary" />
                  )}
                </button>
              </div>
            </div>
          </div>
        ) : styleTab === 'colors' ? (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-2 duration-300">
            <p className="text-xxs text-slate-400 px-1 leading-relaxed">
              Set custom brand colors for this dashboard. These are injected as
              CSS variables and used throughout the interface.
            </p>

            {/* Primary Color */}
            <div className="space-y-3">
              <div className="flex justify-between items-center px-1">
                <h3 className="text-xxs font-bold text-slate-400 uppercase tracking-widest">
                  Primary Color
                </h3>
                <button
                  onClick={() => setField('primaryColor', undefined)}
                  className="text-xxs font-bold uppercase text-slate-400 hover:text-brand-blue-primary flex items-center gap-1"
                  title="Reset to default"
                >
                  <RotateCcw className="w-3 h-3" /> Reset
                </button>
              </div>
              <div className="flex items-center gap-3 bg-white p-2 rounded-lg border border-slate-100">
                <input
                  type="color"
                  value={currentStyle.primaryColor ?? DEFAULT_PRIMARY_COLOR}
                  onChange={(e) => setField('primaryColor', e.target.value)}
                  className="w-8 h-8 rounded-md border border-slate-200 bg-white cursor-pointer"
                />
                <div className="flex flex-col">
                  <span className="text-xxs font-bold text-slate-600 uppercase">
                    Brand Primary
                  </span>
                  <span className="text-xxs font-mono text-slate-400">
                    {currentStyle.primaryColor ?? DEFAULT_PRIMARY_COLOR}
                  </span>
                </div>
              </div>
            </div>

            {/* Accent Color */}
            <div className="space-y-3">
              <div className="flex justify-between items-center px-1">
                <h3 className="text-xxs font-bold text-slate-400 uppercase tracking-widest">
                  Accent Color
                </h3>
                <button
                  onClick={() => setField('accentColor', undefined)}
                  className="text-xxs font-bold uppercase text-slate-400 hover:text-brand-blue-primary flex items-center gap-1"
                  title="Reset to default"
                >
                  <RotateCcw className="w-3 h-3" /> Reset
                </button>
              </div>
              <div className="flex items-center gap-3 bg-white p-2 rounded-lg border border-slate-100">
                <input
                  type="color"
                  value={currentStyle.accentColor ?? DEFAULT_ACCENT_COLOR}
                  onChange={(e) => setField('accentColor', e.target.value)}
                  className="w-8 h-8 rounded-md border border-slate-200 bg-white cursor-pointer"
                />
                <div className="flex flex-col">
                  <span className="text-xxs font-bold text-slate-600 uppercase">
                    Brand Accent
                  </span>
                  <span className="text-xxs font-mono text-slate-400">
                    {currentStyle.accentColor ?? DEFAULT_ACCENT_COLOR}
                  </span>
                </div>
              </div>
            </div>

            {/* Window Title Color */}
            <div className="space-y-3">
              <div className="flex justify-between items-center px-1">
                <h3 className="text-xxs font-bold text-slate-400 uppercase tracking-widest">
                  Window Title Color
                </h3>
                <button
                  onClick={() => setField('windowTitleColor', undefined)}
                  className="text-xxs font-bold uppercase text-slate-400 hover:text-brand-blue-primary flex items-center gap-1"
                  title="Reset to default"
                >
                  <RotateCcw className="w-3 h-3" /> Reset
                </button>
              </div>
              <div className="flex items-center gap-3 bg-white p-2 rounded-lg border border-slate-100">
                <input
                  type="color"
                  value={
                    currentStyle.windowTitleColor ?? DEFAULT_WINDOW_TITLE_COLOR
                  }
                  onChange={(e) => setField('windowTitleColor', e.target.value)}
                  className="w-8 h-8 rounded-md border border-slate-200 bg-white cursor-pointer"
                />
                <div className="flex flex-col">
                  <span className="text-xxs font-bold text-slate-600 uppercase">
                    Widget Title Text
                  </span>
                  <span className="text-xxs font-mono text-slate-400">
                    {currentStyle.windowTitleColor ??
                      DEFAULT_WINDOW_TITLE_COLOR}
                  </span>
                </div>
              </div>
            </div>

            {/* Reset All Colors */}
            <button
              onClick={() =>
                commit({
                  ...currentStyle,
                  primaryColor: undefined,
                  accentColor: undefined,
                  windowTitleColor: undefined,
                })
              }
              className="w-full py-2 bg-slate-100 text-slate-500 rounded-xl font-bold text-xxs uppercase tracking-widest hover:bg-slate-200 transition-all"
            >
              Reset All Colors to Default
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
};
