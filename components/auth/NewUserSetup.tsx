import React, { useState } from 'react';
import {
  ChevronRight,
  ChevronLeft,
  Check,
  Sparkles,
  Building2,
  Palette,
  LayoutGrid,
} from 'lucide-react';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { useAdminBuildings } from '@/hooks/useAdminBuildings';
import { TOOLS } from '@/config/tools';
import {
  DEFAULT_GLOBAL_STYLE,
  DockItem,
  GlobalFontFamily,
  GlobalStyle,
  WidgetType,
} from '@/types';

// ─── Curated dock tool list for step 3 ───────────────────────────────────────

const DOCK_CATEGORIES: { label: string; types: WidgetType[] }[] = [
  {
    label: 'Time & Schedule',
    types: ['clock', 'time-tool', 'schedule', 'calendar'],
  },
  {
    label: 'Interaction',
    types: ['poll', 'random', 'dice', 'traffic', 'talking-tool'],
  },
  {
    label: 'Content',
    types: ['text', 'checklist', 'materials', 'drawing', 'webcam'],
  },
  {
    label: 'Academic',
    types: ['quiz', 'lunchCount', 'weather', 'expectations', 'breathing'],
  },
];

const DEFAULT_DOCK_TYPES: WidgetType[] = [
  'clock',
  'time-tool',
  'schedule',
  'poll',
  'random',
  'traffic',
  'text',
  'checklist',
  'quiz',
  'weather',
  'lunchCount',
  'drawing',
];

// ─── Appearance presets ───────────────────────────────────────────────────────

const FONT_OPTIONS: {
  value: GlobalFontFamily;
  label: string;
  sample: string;
}[] = [
  { value: 'sans', label: 'Lexend', sample: 'Clean & modern' },
  { value: 'handwritten', label: 'Patrick Hand', sample: 'Playful & friendly' },
  { value: 'rounded', label: 'Varela Round', sample: 'Soft & approachable' },
  { value: 'fun', label: 'Fredoka', sample: 'Bold & fun' },
  { value: 'mono', label: 'Roboto Mono', sample: 'Technical & precise' },
];

const WINDOW_CORNER_OPTIONS: {
  value: GlobalStyle['windowBorderRadius'];
  label: string;
}[] = [
  { value: 'md', label: 'Sharp' },
  { value: '2xl', label: 'Rounded' },
  { value: '3xl', label: 'Pill' },
];

const DOCK_STYLE_OPTIONS: {
  label: string;
  dockBorderRadius: GlobalStyle['dockBorderRadius'];
  dockTransparency: number;
}[] = [
  { label: 'Pill', dockBorderRadius: 'full', dockTransparency: 0.4 },
  { label: 'Bar', dockBorderRadius: 'md', dockTransparency: 0.6 },
  { label: 'Flat', dockBorderRadius: 'none', dockTransparency: 0.85 },
];

const DOCK_COLOR_OPTIONS: { label: string; value: string }[] = [
  { label: 'Dark', value: '#334155' },
  { label: 'White', value: '#ffffff' },
  { label: 'Blue', value: '#1e40af' },
  { label: 'Red', value: '#7a1718' },
];

// ─── Step indicator ───────────────────────────────────────────────────────────

const STEPS = [
  { label: 'Your School', icon: Building2 },
  { label: 'Your Style', icon: Palette },
  { label: 'Your Dock', icon: LayoutGrid },
];

// ─── Main component ───────────────────────────────────────────────────────────

export const NewUserSetup: React.FC = () => {
  const { user, setSelectedBuildings, completeSetup } = useAuth();
  const { setGlobalStyle, reorderDockItems } = useDashboard();

  const [step, setStep] = useState(0);
  const [selectedBuildings, setLocalBuildings] = useState<string[]>([]);
  const [style, setStyle] = useState<GlobalStyle>({ ...DEFAULT_GLOBAL_STYLE });
  const [dockTypes, setDockTypes] = useState<WidgetType[]>(DEFAULT_DOCK_TYPES);
  const [finishing, setFinishing] = useState(false);

  // ── Step 0 helpers ──────────────────────────────────────────────────────────
  const toggleBuilding = (id: string) => {
    setLocalBuildings((prev) =>
      prev.includes(id) ? prev.filter((b) => b !== id) : [...prev, id]
    );
  };

  // ── Step 2 helpers ──────────────────────────────────────────────────────────
  const toggleDockType = (type: WidgetType) => {
    setDockTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  // ── Finish ──────────────────────────────────────────────────────────────────
  const handleFinish = async () => {
    setFinishing(true);
    try {
      await setSelectedBuildings(selectedBuildings);
      setGlobalStyle(style);
      const dockItems: DockItem[] = dockTypes.map((t) => ({
        type: 'tool',
        toolType: t,
      }));
      reorderDockItems(dockItems);
      await completeSetup();
    } catch (error) {
      // AuthContext persists changes optimistically: completeSetup / setSelectedBuildings
      // update React state first and swallow Firestore errors internally, so they
      // will not reach here under normal operation. If something else in this block
      // throws unexpectedly, log it and reset the spinner so the user can retry.
      console.error('NewUserSetup: handleFinish failed', error);
      setFinishing(false);
    }
  };

  const canAdvance = step === 0 ? selectedBuildings.length > 0 : true;

  const firstName = user?.displayName?.split(' ')[0] ?? 'there';

  return (
    <div className="fixed inset-0 z-critical bg-slate-900 flex flex-col items-center justify-center p-4">
      {/* Card */}
      <div className="w-full max-w-2xl bg-slate-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-slate-700">
        {/* Header */}
        <div className="bg-gradient-to-r from-brand-blue-primary to-brand-blue-light px-8 py-6">
          <div className="flex items-center gap-3 mb-4">
            <Sparkles className="w-6 h-6 text-white/80" />
            <span className="text-white/80 text-sm font-medium font-sans uppercase tracking-widest">
              Quick Setup
            </span>
          </div>
          <h1 className="text-3xl font-bold text-white font-sans">
            {step === 0 && `Welcome, ${firstName}!`}
            {step === 1 && 'Make it yours'}
            {step === 2 && 'Your go-to tools'}
          </h1>
          <p className="text-white/70 mt-1 text-sm">
            {step === 0 && 'Which school(s) do you teach at?'}
            {step === 1 && 'Customize fonts and window style.'}
            {step === 2 && 'Pick the widgets you reach for most.'}
          </p>
        </div>

        {/* Step indicator */}
        <div className="flex border-b border-slate-700">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const isComplete = i < step;
            const isActive = i === step;
            return (
              <div
                key={s.label}
                className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-medium transition-colors ${
                  isActive
                    ? 'text-blue-400 border-b-2 border-blue-400'
                    : isComplete
                      ? 'text-emerald-400'
                      : 'text-slate-500'
                }`}
              >
                {isComplete ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <Icon className="w-4 h-4" />
                )}
                {s.label}
              </div>
            );
          })}
        </div>

        {/* Step content */}
        <div className="flex-1 overflow-y-auto p-8 min-h-[320px]">
          {step === 0 && (
            <StepBuildings
              selected={selectedBuildings}
              onToggle={toggleBuilding}
            />
          )}
          {step === 1 && <StepAppearance style={style} onChange={setStyle} />}
          {step === 2 && (
            <StepDock dockTypes={dockTypes} onToggle={toggleDockType} />
          )}
        </div>

        {/* Footer nav */}
        <div className="px-8 py-5 border-t border-slate-700 flex items-center justify-between">
          <button
            onClick={() => setStep((s) => s - 1)}
            disabled={step === 0}
            className="flex items-center gap-2 px-4 py-2 text-slate-400 hover:text-white disabled:opacity-0 disabled:pointer-events-none transition-colors text-sm"
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>

          <div className="flex gap-1.5">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`rounded-full transition-all ${
                  i === step
                    ? 'w-5 h-2 bg-blue-400'
                    : i < step
                      ? 'w-2 h-2 bg-emerald-400'
                      : 'w-2 h-2 bg-slate-600'
                }`}
              />
            ))}
          </div>

          {step < STEPS.length - 1 ? (
            <button
              onClick={() => setStep((s) => s + 1)}
              disabled={!canAdvance}
              className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white rounded-xl font-medium text-sm transition-colors"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleFinish}
              disabled={finishing}
              className="flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-600 text-white rounded-xl font-medium text-sm transition-colors"
            >
              {finishing ? 'Setting up…' : 'Start Teaching'}
              {!finishing && <Sparkles className="w-4 h-4" />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Step 0: Building selection ───────────────────────────────────────────────

const StepBuildings: React.FC<{
  selected: string[];
  onToggle: (id: string) => void;
}> = ({ selected, onToggle }) => {
  const BUILDINGS = useAdminBuildings();
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {BUILDINGS.map((b) => {
        const isSelected = selected.includes(b.id);
        return (
          <button
            key={b.id}
            onClick={() => onToggle(b.id)}
            aria-pressed={isSelected}
            className={`relative flex flex-col items-start p-5 rounded-2xl border-2 text-left transition-all ${
              isSelected
                ? 'border-blue-500 bg-blue-500/10'
                : 'border-slate-600 bg-slate-700/50 hover:border-slate-500'
            }`}
          >
            {isSelected && (
              <span className="absolute top-3 right-3 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                <Check className="w-3 h-3 text-white" />
              </span>
            )}
            <Building2
              className={`w-6 h-6 mb-3 ${isSelected ? 'text-blue-400' : 'text-slate-400'}`}
            />
            <span
              className={`font-semibold text-sm ${isSelected ? 'text-white' : 'text-slate-200'}`}
            >
              {b.name}
            </span>
            <span className="text-slate-400 text-xs mt-0.5">
              Grades {b.gradeLabel}
            </span>
          </button>
        );
      })}
      {selected.length === 0 && (
        <p className="col-span-full text-center text-slate-500 text-xs pt-2">
          Select at least one school to continue.
        </p>
      )}
    </div>
  );
};

// ─── Step 1: Appearance ───────────────────────────────────────────────────────

const StepAppearance: React.FC<{
  style: GlobalStyle;
  onChange: (s: GlobalStyle) => void;
}> = ({ style, onChange }) => {
  const update = (patch: Partial<GlobalStyle>) =>
    onChange({ ...style, ...patch });

  const windowRadiusMap: Record<GlobalStyle['windowBorderRadius'], string> = {
    none: 'rounded-none',
    sm: 'rounded-sm',
    md: 'rounded-md',
    lg: 'rounded-lg',
    xl: 'rounded-xl',
    '2xl': 'rounded-2xl',
    '3xl': 'rounded-3xl',
  };

  return (
    <div className="space-y-7">
      {/* Font family */}
      <div>
        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
          Font Family
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {FONT_OPTIONS.map((f) => (
            <button
              key={f.value}
              onClick={() => update({ fontFamily: f.value })}
              className={`p-3 rounded-xl border-2 text-left transition-all ${
                style.fontFamily === f.value
                  ? 'border-blue-500 bg-blue-500/10'
                  : 'border-slate-600 bg-slate-700/50 hover:border-slate-500'
              }`}
            >
              <span className={`block text-base text-white font-${f.value}`}>
                {f.label}
              </span>
              <span className="block text-xs text-slate-400 mt-0.5">
                {f.sample}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Window corners */}
      <div>
        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
          Window Corners
        </label>
        <div className="flex gap-3">
          {WINDOW_CORNER_OPTIONS.map((o) => (
            <button
              key={o.value}
              onClick={() => update({ windowBorderRadius: o.value })}
              className={`flex-1 flex flex-col items-center gap-2 p-3 border-2 transition-all ${
                style.windowBorderRadius === o.value
                  ? 'border-blue-500 bg-blue-500/10'
                  : 'border-slate-600 bg-slate-700/50 hover:border-slate-500'
              } ${windowRadiusMap[o.value]}`}
            >
              <div
                className={`w-8 h-8 bg-slate-500 ${windowRadiusMap[o.value]}`}
              />
              <span className="text-xs text-slate-300">{o.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Dock style */}
      <div>
        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
          Dock Style
        </label>
        <div className="flex gap-3">
          {DOCK_STYLE_OPTIONS.map((o) => {
            const isActive =
              style.dockBorderRadius === o.dockBorderRadius &&
              Math.abs(style.dockTransparency - o.dockTransparency) < 0.05;
            const radiusClass: Record<string, string> = {
              full: 'rounded-full',
              md: 'rounded-md',
              none: 'rounded-none',
            };
            return (
              <button
                key={o.label}
                onClick={() =>
                  update({
                    dockBorderRadius: o.dockBorderRadius,
                    dockTransparency: o.dockTransparency,
                  })
                }
                className={`flex-1 flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all ${
                  isActive
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-slate-600 bg-slate-700/50 hover:border-slate-500'
                }`}
              >
                <div
                  className={`w-16 h-5 bg-slate-400 ${radiusClass[o.dockBorderRadius] ?? 'rounded-xl'}`}
                  style={{ opacity: 1 - o.dockTransparency * 0.6 }}
                />
                <span className="text-xs text-slate-300">{o.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Dock text color */}
      <div>
        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
          Dock Icon Color
        </label>
        <div className="flex gap-3">
          {DOCK_COLOR_OPTIONS.map((c) => (
            <button
              key={c.value}
              onClick={() => update({ dockTextColor: c.value })}
              title={c.label}
              aria-label={c.label}
              aria-pressed={style.dockTextColor === c.value}
              className={`w-9 h-9 rounded-full border-2 transition-all ${
                style.dockTextColor === c.value
                  ? 'border-blue-400 scale-110'
                  : 'border-slate-600 hover:border-slate-400'
              }`}
              style={{ backgroundColor: c.value }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── Step 2: Dock widget picker ───────────────────────────────────────────────

const StepDock: React.FC<{
  dockTypes: WidgetType[];
  onToggle: (type: WidgetType) => void;
}> = ({ dockTypes, onToggle }) => {
  const { canAccessWidget } = useAuth();
  const toolMap = new Map(TOOLS.map((t) => [t.type, t]));

  return (
    <div className="space-y-5">
      <p className="text-slate-400 text-xs">
        {dockTypes.length} tool{dockTypes.length !== 1 ? 's' : ''} selected —
        you can change this anytime from the dock.
      </p>
      {DOCK_CATEGORIES.map((cat) => (
        <div key={cat.label}>
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            {cat.label}
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {cat.types.map((type) => {
              const tool = toolMap.get(type);
              if (!tool || !canAccessWidget(type)) return null;
              const Icon = tool.icon;
              const isSelected = dockTypes.includes(type);
              return (
                <button
                  key={type}
                  onClick={() => onToggle(type)}
                  className={`flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                    isSelected
                      ? 'border-blue-500 bg-blue-500/10'
                      : 'border-slate-600 bg-slate-700/50 hover:border-slate-500'
                  }`}
                >
                  <span
                    className={`w-7 h-7 flex items-center justify-center rounded-lg flex-shrink-0 ${tool.color}`}
                  >
                    <Icon className="w-4 h-4 text-white" />
                  </span>
                  <span
                    className={`text-xs font-medium truncate ${isSelected ? 'text-white' : 'text-slate-300'}`}
                  >
                    {tool.label}
                  </span>
                  {isSelected && (
                    <Check className="w-3.5 h-3.5 text-blue-400 flex-shrink-0 ml-auto" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};
