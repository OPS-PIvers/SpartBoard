import React from 'react';
import { useDashboard } from '@/context/useDashboard';
import { WidgetData, DrawingConfig, DrawingBackground } from '@/types';
import { Pencil, Palette, Square, LayoutGrid } from 'lucide-react';
import { SettingsLabel } from '@/components/common/SettingsLabel';
import { DRAWING_DEFAULTS } from './constants';
import { getBackgroundStyle } from './backgroundTemplates';
import { migrateDrawingConfig } from '@/utils/migrateDrawingConfig';

const BACKGROUND_OPTIONS: ReadonlyArray<{
  value: DrawingBackground;
  label: string;
}> = [
  { value: 'blank', label: 'Blank' },
  { value: 'grid', label: 'Grid' },
  { value: 'lines', label: 'Lines' },
  { value: 'dots', label: 'Dots' },
];

export const DrawingSettings: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget } = useDashboard();
  const config = widget.config as DrawingConfig;
  const width = config.width ?? DRAWING_DEFAULTS.WIDTH;
  const customColors = config.customColors ?? DRAWING_DEFAULTS.CUSTOM_COLORS;
  const shapeFill = config.shapeFill ?? DRAWING_DEFAULTS.SHAPE_FILL;

  // Background editing targets the active page (per-page background is the
  // source of truth, per Wave 6). Fall back to the widget-level default and
  // finally to 'blank' so the picker always shows a selected radio.
  const pages = config.pages ?? [];
  const currentPage = Math.max(
    0,
    Math.min(config.currentPage ?? 0, pages.length - 1)
  );
  const activePageBackground =
    pages[currentPage]?.background ??
    config.background ??
    DRAWING_DEFAULTS.BACKGROUND;

  const handleBackgroundChange = (next: DrawingBackground) => {
    // Run the synchronous migration first so a legacy/new-widget config
    // with no `pages` arrives at the canonical single-page shape before we
    // apply the edit. Without this, `pages.map(...)` returns `[]` on an
    // empty `pages`, the persisted payload becomes `pages: []`, and the
    // "never zero pages" invariant is violated until next hydration.
    const migrated = migrateDrawingConfig(config);
    const migratedPages = migrated.pages;
    const targetIndex = Math.max(
      0,
      Math.min(migrated.currentPage, migratedPages.length - 1)
    );
    const nextPages = migratedPages.map((p, i) =>
      i === targetIndex ? { ...p, background: next } : p
    );
    // Update both: (a) the active page's `background` so this edit applies
    // immediately, and (b) the widget-level `background` so freshly-added
    // pages inherit the latest choice. This matches the spec's per-page +
    // widget-default model.
    updateWidget(widget.id, {
      config: {
        ...migrated,
        background: next,
        pages: nextPages,
      } as DrawingConfig,
    });
  };

  const handleColorChange = (index: number, newColor: string) => {
    const nextColors = [...customColors];
    nextColors[index] = newColor;
    updateWidget(widget.id, {
      config: {
        ...config,
        customColors: nextColors,
      } as DrawingConfig,
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <SettingsLabel icon={Palette}>Color Presets</SettingsLabel>
        <div className="flex gap-2 px-2">
          {customColors.map((c, i) => (
            <div
              key={i}
              className="w-8 h-8 rounded-lg border-2 border-white shadow-sm ring-1 ring-slate-200 relative overflow-hidden transition-transform hover:scale-110"
              style={{ backgroundColor: c }}
            >
              <input
                type="color"
                value={c}
                onChange={(e) => handleColorChange(i, e.target.value)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                title="Change preset color"
              />
            </div>
          ))}
        </div>
      </div>

      <div>
        <SettingsLabel icon={Pencil}>Brush Thickness</SettingsLabel>
        <div className="flex items-center gap-4 px-2">
          <input
            type="range"
            min="1"
            max="20"
            step="1"
            value={width}
            onChange={(e) =>
              updateWidget(widget.id, {
                config: {
                  ...config,
                  width: parseInt(e.target.value, 10),
                } as DrawingConfig,
              })
            }
            className="flex-1 accent-indigo-600 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer"
          />
          <span className="w-10 text-center font-mono  text-slate-700 text-sm">
            {width}px
          </span>
        </div>
      </div>

      <div>
        <SettingsLabel icon={LayoutGrid}>Background</SettingsLabel>
        {/* Toggle-button group (not radiogroup) — selecting a background is a
            mode toggle. The button + aria-pressed pattern gives us native
            Tab/Space/Enter without the roving-tabindex machinery that a true
            radiogroup requires. Matches the pattern in Widget.tsx and
            AnnotationOverlay.tsx (PR 1685 round-1 fix). */}
        <div
          role="group"
          aria-label="Background template"
          className="flex gap-2 px-2"
        >
          {BACKGROUND_OPTIONS.map(({ value, label }) => {
            const selected = activePageBackground === value;
            return (
              <button
                key={value}
                type="button"
                aria-pressed={selected}
                aria-label={label}
                onClick={() => handleBackgroundChange(value)}
                className={`flex-1 flex flex-col items-center gap-1.5 p-1.5 rounded-lg border-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white ${
                  selected
                    ? 'border-indigo-500 bg-indigo-50'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
                title={label}
              >
                {/* Mini preview: a 40x30 box rendered with the same CSS
                    background as the widget would use, on a slate base so
                    transparent (blank) reads as "no pattern" rather than
                    a hole in the panel. */}
                <div
                  className="w-10 h-7 rounded border border-slate-200 bg-slate-50"
                  style={getBackgroundStyle(value)}
                  aria-hidden
                />
                <span className="text-xxs text-slate-700">{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <SettingsLabel icon={Square}>Shape Fill</SettingsLabel>
        <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-700 px-2">
          <input
            type="checkbox"
            checked={shapeFill}
            onChange={(e) =>
              updateWidget(widget.id, {
                config: {
                  ...config,
                  shapeFill: e.target.checked,
                } as DrawingConfig,
              })
            }
            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
          Fill rectangles and ellipses with the current color
        </label>
      </div>

      <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100">
        <p className="text-xxs text-indigo-600 leading-relaxed">
          <b>Tip:</b> To annotate over your whole dashboard, click the{' '}
          <b>pencil</b> in the floating toolbar at the top-left of your board.
          The whiteboard widget here is best for persistent sketches and notes.
        </p>
      </div>
    </div>
  );
};
