import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Save,
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
import { StylePreview } from './StylePreview';

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
  addToast,
}) => {
  const [styleTab, setStyleTab] = useState<'window' | 'dock' | 'colors'>(
    'window'
  );
  const [isFontMenuOpen, setIsFontMenuOpen] = useState(false);
  const [pendingStyle, setPendingStyle] =
    useState<GlobalStyle>(DEFAULT_GLOBAL_STYLE);

  // State adjustment pattern to reset pendingStyle when opening
  const [prevIsVisible, setPrevIsVisible] = useState(isVisible);
  const [prevDashboardId, setPrevDashboardId] = useState(activeDashboard?.id);

  if (isVisible && !prevIsVisible) {
    setPrevIsVisible(true);
    setPendingStyle(activeDashboard?.globalStyle ?? DEFAULT_GLOBAL_STYLE);
  } else if (!isVisible && prevIsVisible) {
    setPrevIsVisible(false);
  }

  if (activeDashboard?.id !== prevDashboardId) {
    setPrevDashboardId(activeDashboard?.id);
    if (isVisible) {
      setPendingStyle(activeDashboard?.globalStyle ?? DEFAULT_GLOBAL_STYLE);
    }
  }

  return (
    <div
      className={`absolute inset-0 flex flex-col transition-all duration-300 ease-in-out ${
        isVisible
          ? 'translate-x-0 opacity-100 visible'
          : 'translate-x-full opacity-0 invisible'
      }`}
    >
      {/* TABS & MOBILE PREVIEW */}
      <div className="bg-white border-b border-slate-100 sticky top-0 z-20 flex flex-col">
        {/* Mobile Preview only */}
        <div className="lg:hidden p-4 pb-0">
          <StylePreview
            pendingStyle={pendingStyle}
            background={activeDashboard?.background}
          />
        </div>

        {/* Sub-tabs */}
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

      <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar pb-40">
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
                className={`text-sm font-bold font-${pendingStyle.fontFamily}`}
              >
                {
                  FONT_OPTIONS.find((f) => f.id === pendingStyle.fontFamily)
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
                      setPendingStyle({
                        ...pendingStyle,
                        fontFamily: f.id,
                      });
                      setIsFontMenuOpen(false);
                    }}
                    className={`w-full flex items-center justify-between p-2.5 rounded-md transition-all ${
                      pendingStyle.fontFamily === f.id
                        ? 'bg-brand-blue-primary text-white shadow-sm'
                        : 'bg-white hover:bg-slate-50 text-slate-600'
                    }`}
                  >
                    <span className={`text-xs font-bold ${f.font}`}>
                      {f.label}
                    </span>
                    {pendingStyle.fontFamily === f.id && (
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
                  {Math.round(pendingStyle.windowTransparency * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={pendingStyle.windowTransparency}
                onChange={(e) =>
                  setPendingStyle({
                    ...pendingStyle,
                    windowTransparency: parseFloat(e.target.value),
                  })
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
                      setPendingStyle({
                        ...pendingStyle,
                        windowBorderRadius:
                          r.id as GlobalStyle['windowBorderRadius'],
                      })
                    }
                    className={`flex-1 py-1.5 rounded-md text-xxs font-bold uppercase transition-all ${
                      pendingStyle.windowBorderRadius === r.id
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
                  {Math.round(pendingStyle.dockTransparency * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={pendingStyle.dockTransparency}
                onChange={(e) =>
                  setPendingStyle({
                    ...pendingStyle,
                    dockTransparency: parseFloat(e.target.value),
                  })
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
                      setPendingStyle({
                        ...pendingStyle,
                        dockBorderRadius:
                          r.id as GlobalStyle['dockBorderRadius'],
                      })
                    }
                    className={`flex-1 py-1.5 rounded-md text-xxs font-bold uppercase transition-all ${
                      pendingStyle.dockBorderRadius === r.id
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
                    value={pendingStyle.dockTextColor}
                    onChange={(e) =>
                      setPendingStyle({
                        ...pendingStyle,
                        dockTextColor: e.target.value,
                      })
                    }
                    className="w-8 h-8 rounded-md border border-slate-200 bg-white cursor-pointer"
                  />
                  <span className="text-xxs font-bold text-slate-600 uppercase">
                    Text Color
                  </span>
                </div>

                <button
                  onClick={() =>
                    setPendingStyle({
                      ...pendingStyle,
                      dockTextShadow: !pendingStyle.dockTextShadow,
                    })
                  }
                  className={`flex items-center justify-between p-3 rounded-lg border transition-all ${
                    pendingStyle.dockTextShadow
                      ? 'bg-white border-brand-blue-primary text-brand-blue-dark shadow-sm'
                      : 'bg-white border-slate-100 text-slate-500'
                  }`}
                >
                  <span className="text-xxs font-bold uppercase tracking-wider">
                    Text Shadow
                  </span>
                  {pendingStyle.dockTextShadow && (
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
                  onClick={() =>
                    setPendingStyle({
                      ...pendingStyle,
                      primaryColor: undefined,
                    })
                  }
                  className="text-xxs font-bold uppercase text-slate-400 hover:text-brand-blue-primary flex items-center gap-1"
                  title="Reset to default"
                >
                  <RotateCcw className="w-3 h-3" /> Reset
                </button>
              </div>
              <div className="flex items-center gap-3 bg-white p-2 rounded-lg border border-slate-100">
                <input
                  type="color"
                  value={pendingStyle.primaryColor ?? DEFAULT_PRIMARY_COLOR}
                  onChange={(e) =>
                    setPendingStyle({
                      ...pendingStyle,
                      primaryColor: e.target.value,
                    })
                  }
                  className="w-8 h-8 rounded-md border border-slate-200 bg-white cursor-pointer"
                />
                <div className="flex flex-col">
                  <span className="text-xxs font-bold text-slate-600 uppercase">
                    Brand Primary
                  </span>
                  <span className="text-xxs font-mono text-slate-400">
                    {pendingStyle.primaryColor ?? DEFAULT_PRIMARY_COLOR}
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
                  onClick={() =>
                    setPendingStyle({
                      ...pendingStyle,
                      accentColor: undefined,
                    })
                  }
                  className="text-xxs font-bold uppercase text-slate-400 hover:text-brand-blue-primary flex items-center gap-1"
                  title="Reset to default"
                >
                  <RotateCcw className="w-3 h-3" /> Reset
                </button>
              </div>
              <div className="flex items-center gap-3 bg-white p-2 rounded-lg border border-slate-100">
                <input
                  type="color"
                  value={pendingStyle.accentColor ?? DEFAULT_ACCENT_COLOR}
                  onChange={(e) =>
                    setPendingStyle({
                      ...pendingStyle,
                      accentColor: e.target.value,
                    })
                  }
                  className="w-8 h-8 rounded-md border border-slate-200 bg-white cursor-pointer"
                />
                <div className="flex flex-col">
                  <span className="text-xxs font-bold text-slate-600 uppercase">
                    Brand Accent
                  </span>
                  <span className="text-xxs font-mono text-slate-400">
                    {pendingStyle.accentColor ?? DEFAULT_ACCENT_COLOR}
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
                  onClick={() =>
                    setPendingStyle({
                      ...pendingStyle,
                      windowTitleColor: undefined,
                    })
                  }
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
                    pendingStyle.windowTitleColor ?? DEFAULT_WINDOW_TITLE_COLOR
                  }
                  onChange={(e) =>
                    setPendingStyle({
                      ...pendingStyle,
                      windowTitleColor: e.target.value,
                    })
                  }
                  className="w-8 h-8 rounded-md border border-slate-200 bg-white cursor-pointer"
                />
                <div className="flex flex-col">
                  <span className="text-xxs font-bold text-slate-600 uppercase">
                    Widget Title Text
                  </span>
                  <span className="text-xxs font-mono text-slate-400">
                    {pendingStyle.windowTitleColor ??
                      DEFAULT_WINDOW_TITLE_COLOR}
                  </span>
                </div>
              </div>
            </div>

            {/* Reset All Colors */}
            <button
              onClick={() =>
                setPendingStyle({
                  ...pendingStyle,
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

      {/* ACTION BUTTONS */}
      <div className="mt-auto p-4 bg-white border-t border-slate-100 flex gap-2">
        <button
          onClick={() => {
            setGlobalStyle(pendingStyle);
            addToast('Global style applied', 'success');
          }}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-brand-blue-primary text-white rounded-xl font-bold text-xxs uppercase tracking-widest shadow-sm hover:bg-brand-blue-dark transition-all"
        >
          <Save className="w-3.5 h-3.5" /> Save
        </button>

        <button
          onClick={() => {
            if (activeDashboard) {
              setPendingStyle(
                activeDashboard.globalStyle ?? DEFAULT_GLOBAL_STYLE
              );
            }
          }}
          className="flex-1 py-2.5 bg-slate-100 text-slate-500 rounded-xl font-bold text-xxs uppercase tracking-widest hover:bg-slate-200 transition-all"
        >
          Discard
        </button>
      </div>

      {/* Attached Style Preview for Desktop */}
      {isVisible &&
        createPortal(
          <div className="hidden lg:flex flex-col justify-center p-12 animate-in fade-in slide-in-from-left-8 duration-500 pointer-events-none fixed left-72 top-0 bottom-0 z-modal">
            <div className="w-[450px] pointer-events-auto">
              <div className="flex flex-col gap-3 mb-6 drop-shadow-2xl">
                <h3 className="text-sm font-black text-white uppercase tracking-[0.3em] drop-shadow-lg">
                  Style Preview
                </h3>
                <div className="h-1 w-12 bg-white/50 rounded-full" />
              </div>
              <StylePreview
                pendingStyle={pendingStyle}
                background={activeDashboard?.background}
              />
              <p className="mt-6 text-xxs font-bold text-white/60 uppercase tracking-widest text-center drop-shadow-md">
                Preview updates live as you adjust settings
              </p>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
