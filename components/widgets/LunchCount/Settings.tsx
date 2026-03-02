import React from 'react';
import { WidgetData, LunchCountConfig } from '../../../types';
import { useDashboard } from '../../../context/useDashboard';
import { RosterModeControl } from '../../common/RosterModeControl';
import { Toggle } from '../../common/Toggle';
import { School, Users, Clock, GraduationCap } from 'lucide-react';

const SCHOOL_OPTIONS = [
  { id: 'schumann-elementary', label: 'Schumann Elementary' },
  { id: 'orono-intermediate-school', label: 'Orono Intermediate' },
];

/** Grade levels available at each school */
const GRADE_OPTIONS: Record<
  LunchCountConfig['schoolSite'],
  { value: string; label: string }[]
> = {
  'schumann-elementary': [
    { value: 'K', label: 'K' },
    { value: '1', label: '1' },
    { value: '2', label: '2' },
    { value: 'MAC', label: 'MAC' },
  ],
  'orono-intermediate-school': [
    { value: '3', label: '3' },
    { value: '4', label: '4' },
    { value: '5', label: '5' },
  ],
};

/** Pad a number to two digits */
const pad = (n: string) => n.padStart(2, '0');

export const LunchCountSettings: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget } = useDashboard();
  const config = widget.config as LunchCountConfig;
  const {
    schoolSite = 'schumann-elementary',
    isManualMode = false,
    manualHotLunch = '',
    manualBentoBox = '',
    roster = [],
    rosterMode = 'class',
    lunchTimeHour = '',
    lunchTimeMinute = '',
    gradeLevel = '',
  } = config;

  const gradeOptions = GRADE_OPTIONS[schoolSite];

  /** When the school site changes, clear the grade selection if it's no longer valid */
  const handleSiteChange = (newSite: LunchCountConfig['schoolSite']) => {
    const validGrades = GRADE_OPTIONS[newSite].map((g) => g.value);
    updateWidget(widget.id, {
      config: {
        ...config,
        schoolSite: newSite,
        cachedMenu: null,
        gradeLevel: validGrades.includes(gradeLevel) ? gradeLevel : '',
      },
    });
  };

  return (
    <div className="space-y-5">
      {/* ── Site, Lunch Time, Grade Level ─────────────────────────────── */}
      <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
        {/* School Site */}
        <div>
          <label className="text-xxs text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
            <School className="w-3 h-3" /> School Site
          </label>
          <select
            value={schoolSite}
            onChange={(e) =>
              handleSiteChange(e.target.value as LunchCountConfig['schoolSite'])
            }
            className="w-full p-2.5 text-xs border border-slate-200 rounded-xl outline-none bg-white"
          >
            {SCHOOL_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Lunch Time */}
        <div>
          <label className="text-xxs text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
            <Clock className="w-3 h-3" /> Lunch Time
          </label>
          <div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                max="12"
                value={lunchTimeHour}
                aria-label="Lunch hour"
                onChange={(e) => {
                  const raw = e.target.value;
                  const n = parseInt(raw);
                  const value =
                    !isNaN(n) && raw !== ''
                      ? String(Math.min(12, Math.max(1, n)))
                      : raw;
                  updateWidget(widget.id, {
                    config: { ...config, lunchTimeHour: value },
                  });
                }}
                onBlur={(e) => {
                  const n = parseInt(e.target.value);
                  if (!isNaN(n) && e.target.value !== '') {
                    updateWidget(widget.id, {
                      config: {
                        ...config,
                        lunchTimeHour: String(Math.min(12, Math.max(1, n))),
                      },
                    });
                  }
                }}
                placeholder="HR"
                className="w-16 p-2.5 text-xs text-center border border-slate-200 rounded-xl outline-none bg-white font-mono"
              />
              <span className="font-black text-slate-400 text-sm">:</span>
              <input
                type="number"
                min="0"
                max="59"
                value={lunchTimeMinute}
                aria-label="Lunch minute"
                onChange={(e) => {
                  const raw = e.target.value;
                  const n = parseInt(raw);
                  const value =
                    !isNaN(n) && raw !== ''
                      ? String(Math.min(59, Math.max(0, n)))
                      : raw;
                  updateWidget(widget.id, {
                    config: { ...config, lunchTimeMinute: value },
                  });
                }}
                onBlur={(e) => {
                  const n = parseInt(e.target.value);
                  if (!isNaN(n) && e.target.value !== '') {
                    updateWidget(widget.id, {
                      config: {
                        ...config,
                        lunchTimeMinute: pad(
                          String(Math.min(59, Math.max(0, n)))
                        ),
                      },
                    });
                  }
                }}
                placeholder="MM"
                className="w-16 p-2.5 text-xs text-center border border-slate-200 rounded-xl outline-none bg-white font-mono"
              />
            </div>
            {lunchTimeHour && (
              <p className="mt-1 text-xxs text-slate-400">
                Preview: {lunchTimeHour}:{pad(lunchTimeMinute || '0')}
              </p>
            )}
          </div>
        </div>

        {/* Grade Level */}
        <div>
          <label className="text-xxs text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
            <GraduationCap className="w-3 h-3" /> Grade Level
          </label>
          <div className="flex gap-2 flex-wrap">
            {gradeOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() =>
                  updateWidget(widget.id, {
                    config: { ...config, gradeLevel: opt.value },
                  })
                }
                className={`px-4 py-2 rounded-xl text-xs font-black border-2 transition-colors ${
                  gradeLevel === opt.value
                    ? 'bg-brand-blue-primary text-white border-brand-blue-primary'
                    : 'bg-white text-slate-500 border-slate-200 hover:border-brand-blue-primary hover:text-brand-blue-primary'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Roster Mode ───────────────────────────────────────────────── */}
      <RosterModeControl
        rosterMode={rosterMode}
        onModeChange={(mode) =>
          updateWidget(widget.id, {
            config: { ...config, rosterMode: mode },
          })
        }
      />

      <div className="grid grid-cols-2 gap-4">
        {/* Manual Mode toggle */}
        <div>
          <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xxs text-indigo-700 uppercase tracking-wider">
                Manual Mode
              </span>
              <Toggle
                checked={isManualMode}
                onChange={() =>
                  updateWidget(widget.id, {
                    config: { ...config, isManualMode: !isManualMode },
                  })
                }
                size="sm"
                activeColor="bg-indigo-600"
              />
            </div>
            {isManualMode && (
              <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                <input
                  placeholder="Hot Lunch Name"
                  value={manualHotLunch}
                  onChange={(e) =>
                    updateWidget(widget.id, {
                      config: { ...config, manualHotLunch: e.target.value },
                    })
                  }
                  className="w-full p-2 text-xxs border border-indigo-200 rounded-lg outline-none"
                />
                <input
                  placeholder="Bento Box Name"
                  value={manualBentoBox}
                  onChange={(e) =>
                    updateWidget(widget.id, {
                      config: { ...config, manualBentoBox: e.target.value },
                    })
                  }
                  className="w-full p-2 text-xxs border border-indigo-200 rounded-lg outline-none"
                />
              </div>
            )}
          </div>
        </div>

        {/* Custom Roster */}
        <div>
          {rosterMode === 'custom' ? (
            <>
              <label className="text-xxs text-slate-400 uppercase tracking-widest mb-2 block flex items-center gap-2">
                <Users className="w-3 h-3" /> Custom Roster
              </label>
              <textarea
                value={roster.join('\n')}
                onChange={(e) =>
                  updateWidget(widget.id, {
                    config: {
                      ...config,
                      roster: e.target.value
                        .split('\n')
                        .map((s) => s.trim())
                        .filter(Boolean),
                    },
                  })
                }
                placeholder="Enter one student per line..."
                className="w-full h-[180px] p-3 text-xs bg-white border border-slate-200 rounded-2xl outline-none resize-none leading-relaxed"
              />
            </>
          ) : (
            <div className="h-full flex flex-col items-center justify-center p-6 bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl text-center gap-3">
              <Users className="w-8 h-8 text-slate-300" />
              <div className="text-xxs uppercase text-slate-400 tracking-widest">
                Using Active Class Roster
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
