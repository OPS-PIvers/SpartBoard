import React, { useState, useRef, useEffect } from 'react';
import { useDashboard } from '@/context/useDashboard';
import { useDialog } from '@/context/useDialog';
import { WidgetData, RandomConfig, RandomGroup, StationsConfig } from '@/types';
import { buildStationsFromRandomGroups } from '@/components/widgets/Stations/nexus';
import { RosterModeControl } from '@/components/common/RosterModeControl';
import { Toggle } from '@/components/common/Toggle';
import { Card } from '@/components/common/Card';
import {
  Users,
  UserPlus,
  Layers,
  Trash2,
  Hash,
  Play,
  Target,
  List,
  Volume2,
  VolumeX,
  Clock,
  RefreshCw,
  Send,
} from 'lucide-react';
import { Button } from '@/components/common/Button';
import { SettingsLabel } from '@/components/common/SettingsLabel';

export const RandomSettings: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget, activeDashboard, rosters, activeRosterId, addToast } =
    useDashboard();
  const { showConfirm } = useDialog();

  const stationsWidget = activeDashboard?.widgets.find(
    (w) => w.type === 'stations'
  );

  const handleSendGroupsToStations = async () => {
    if (!stationsWidget) {
      addToast('Add a Stations widget to the board first.', 'info');
      return;
    }
    const result = (widget.config as RandomConfig).lastResult;
    let groups: RandomGroup[] = [];
    if (Array.isArray(result) && result.length > 0) {
      const first = result[0];
      if (
        typeof first === 'object' &&
        first !== null &&
        'names' in (first as object)
      ) {
        groups = result as RandomGroup[];
      } else if (Array.isArray(first)) {
        groups = (result as unknown as string[][]).map((names, i) => ({
          id: `Group ${i + 1}`,
          names: names ?? [],
        }));
      }
    }
    if (groups.length === 0) {
      addToast(
        'Generate groups first (set mode to Groups, then Pick) and try again.',
        'info'
      );
      return;
    }
    const existingStations =
      (stationsWidget.config as StationsConfig).stations ?? [];
    if (existingStations.length > 0) {
      const ok = await showConfirm(
        `The Stations widget already has ${existingStations.length} station${existingStations.length === 1 ? '' : 's'}. Sending will replace them.`,
        {
          title: 'Replace existing stations?',
          confirmLabel: 'Replace',
          variant: 'danger',
        }
      );
      if (!ok) return;
    }
    const { stations, assignments } = buildStationsFromRandomGroups(groups);
    updateWidget(stationsWidget.id, {
      config: {
        ...(stationsWidget.config as StationsConfig),
        stations,
        assignments,
      },
    });
    addToast(`Sent ${groups.length} groups to Stations.`, 'success');
  };

  const config = widget.config as RandomConfig;

  const activeRoster = React.useMemo(
    () => rosters.find((r) => r.id === activeRosterId),
    [rosters, activeRosterId]
  );

  const importFromRoster = React.useCallback(() => {
    if (!activeRoster) return;

    const students = activeRoster.students;
    const newFirstNames = students
      .map((s) => [s.firstName, s.lastName].filter(Boolean).join(' '))
      .join('\n');
    const newLastNames = '';

    updateWidget(widget.id, {
      config: {
        ...config,
        firstNames: newFirstNames,
        lastNames: newLastNames,
        lastResult: null,
        remainingStudents: [],
      },
    });
  }, [activeRoster, config, updateWidget, widget.id]);
  const {
    firstNames = '',
    lastNames = '',
    mode = 'single',
    groupSize = 3,
    soundEnabled = true,
    rosterMode = 'class',
    autoStartTimer = false,
    visualStyle = 'flash',
  } = config;

  const [localFirstNames, setLocalFirstNames] = useState(firstNames);
  const [localLastNames, setLocalLastNames] = useState(lastNames);
  const [prevFirstNames, setPrevFirstNames] = useState(firstNames);
  const [prevLastNames, setPrevLastNames] = useState(lastNames);

  const firstNamesTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastNamesTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Keep refs current so debounced callbacks always read the latest values
  const configRef = useRef(config);
  const updateWidgetRef = useRef(updateWidget);

  // Note: These need to be updated in useEffect or event handlers to avoid react-hooks/refs errors
  useEffect(() => {
    configRef.current = config;
  }, [config]);

  useEffect(() => {
    updateWidgetRef.current = updateWidget;
  }, [updateWidget]);

  // Sync local inputs when the external value changes (e.g. roster import)
  if (firstNames !== prevFirstNames) {
    setPrevFirstNames(firstNames);
    setLocalFirstNames(firstNames);
  }
  if (lastNames !== prevLastNames) {
    setPrevLastNames(lastNames);
    setLocalLastNames(lastNames);
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      if (localFirstNames !== firstNames) {
        updateWidgetRef.current(widget.id, {
          config: {
            ...configRef.current,
            firstNames: localFirstNames,
          },
        });
      }
    }, 1000);
    firstNamesTimerRef.current = timer;
    return () => clearTimeout(timer);
  }, [localFirstNames, firstNames, widget.id]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (localLastNames !== lastNames) {
        updateWidgetRef.current(widget.id, {
          config: {
            ...configRef.current,
            lastNames: localLastNames,
          },
        });
      }
    }, 1000);
    lastNamesTimerRef.current = timer;
    return () => clearTimeout(timer);
  }, [localLastNames, lastNames, widget.id]);

  const modes = [
    { id: 'single', label: 'Pick One', icon: UserPlus },
    { id: 'shuffle', label: 'Shuffle', icon: Layers },
    { id: 'groups', label: 'Groups', icon: Users },
  ];

  const styles = [
    { id: 'flash', label: 'Standard', icon: Play },
    { id: 'wheel', label: 'Wheel', icon: Target },
    { id: 'slots', label: 'Slots', icon: List },
  ];

  return (
    <div className="space-y-6">
      <RosterModeControl
        rosterMode={rosterMode}
        onModeChange={(mode) =>
          updateWidget(widget.id, {
            config: { ...config, rosterMode: mode },
          })
        }
      />

      <Card padding="sm" className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`p-2 rounded-lg ${soundEnabled ? 'bg-brand-blue-lighter text-brand-blue-primary' : 'bg-slate-100 text-slate-400'}`}
          >
            {soundEnabled ? (
              <Volume2 className="w-4 h-4" />
            ) : (
              <VolumeX className="w-4 h-4" />
            )}
          </div>
          <div>
            <div className="text-xxs  uppercase tracking-widest text-slate-800">
              Sound Effects
            </div>
            <div className="text-xxxs text-slate-500  uppercase">
              Tick-tock while spinning
            </div>
          </div>
        </div>
        <Toggle
          checked={soundEnabled}
          onChange={() =>
            updateWidget(widget.id, {
              config: { ...config, soundEnabled: !soundEnabled },
            })
          }
          size="md"
        />
      </Card>

      {/* Automation - Nexus Connection */}
      {mode === 'single' && (
        <div className="flex items-center justify-between p-3 bg-indigo-50 border border-indigo-100 rounded-2xl shadow-sm">
          <div className="flex items-center gap-3">
            <div
              className={`p-2 rounded-lg ${autoStartTimer ? 'bg-indigo-200 text-indigo-700' : 'bg-indigo-100 text-indigo-400'}`}
            >
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xxs uppercase tracking-widest text-indigo-900 font-bold">
                Auto-Start Timer
              </div>
              <div className="text-xxxs text-indigo-600 uppercase">
                Start timer when winner is picked
              </div>
            </div>
          </div>
          <Toggle
            checked={autoStartTimer ?? false}
            onChange={() =>
              updateWidget(widget.id, {
                config: { ...config, autoStartTimer: !autoStartTimer },
              })
            }
            size="md"
            disabled={
              !activeDashboard?.widgets.some((w) => w.type === 'time-tool')
            }
          />
        </div>
      )}
      {!activeDashboard?.widgets.some((w) => w.type === 'time-tool') &&
        mode === 'single' &&
        autoStartTimer && (
          <div className="text-xxxs text-amber-600 bg-amber-50 p-2 rounded-lg border border-amber-100">
            ⚠️ Timer widget required for automation.
          </div>
        )}

      {/* Nexus Connection: Send Groups → Stations */}
      {mode === 'group' && (
        <div className="space-y-1">
          <button
            type="button"
            onClick={() => void handleSendGroupsToStations()}
            disabled={!stationsWidget}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-700 font-black uppercase tracking-widest text-xxs hover:bg-emerald-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send size={13} />
            Send Groups to Stations
          </button>
          {!stationsWidget && (
            <div className="text-xxxs text-slate-500 leading-snug">
              Add a Stations widget to send your generated groups there as
              station assignments.
            </div>
          )}
        </div>
      )}

      <div>
        <label className="text-xxs  text-slate-400 uppercase tracking-widest mb-3 block">
          Operation Mode
        </label>
        <div className="grid grid-cols-3 gap-2">
          {modes.map((m) => (
            <button
              key={m.id}
              onClick={() =>
                updateWidget(widget.id, {
                  config: { ...config, mode: m.id, lastResult: null },
                })
              }
              className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl border-2 transition-all ${
                mode === m.id
                  ? 'border-brand-blue-primary bg-brand-blue-lighter text-brand-blue-primary'
                  : 'border-slate-100 text-slate-400 hover:border-slate-200'
              }`}
            >
              <m.icon className="w-5 h-5" />
              <span className="text-xxxs  uppercase">{m.label}</span>
            </button>
          ))}
        </div>
      </div>

      {mode === 'single' && (
        <div>
          <label className="text-xxs  text-slate-400 uppercase tracking-widest mb-3 block">
            Animation Style
          </label>
          <div className="grid grid-cols-3 gap-2">
            {styles.map((s) => (
              <button
                key={s.id}
                onClick={() =>
                  updateWidget(widget.id, {
                    config: {
                      ...config,
                      visualStyle: s.id as 'flash' | 'slots' | 'wheel',
                    },
                  })
                }
                className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl border-2 transition-all ${
                  visualStyle === s.id
                    ? 'border-amber-500 bg-amber-50 text-amber-700'
                    : 'border-slate-100 text-slate-400 hover:border-slate-200'
                }`}
              >
                <s.icon className="w-5 h-5" />
                <span className="text-xxxs  uppercase">{s.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {mode === 'groups' && (
        <div className="p-4 bg-white border border-slate-100 rounded-2xl shadow-sm">
          <label className="text-xxs  text-slate-400 uppercase tracking-widest mb-3 block flex items-center gap-2">
            <Hash className="w-3 h-3" /> Group Size
          </label>
          <div className="flex items-center gap-4">
            <input
              type="range"
              min="2"
              max="20"
              step="1"
              value={groupSize}
              onChange={(e) =>
                updateWidget(widget.id, {
                  config: {
                    ...config,
                    groupSize: parseInt(e.target.value),
                  },
                })
              }
              className="flex-1 accent-brand-blue-primary h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer"
            />
            <span className="w-10 text-center font-mono  text-slate-700 text-sm">
              {groupSize}
            </span>
          </div>
        </div>
      )}

      {rosterMode === 'custom' && (
        <>
          {activeRoster && (
            <div className="flex flex-col gap-2 p-3 bg-brand-blue-lighter/30 border border-brand-blue-lighter rounded-2xl">
              <div className="flex items-center justify-between">
                <div>
                  <SettingsLabel>Import from Class</SettingsLabel>
                  <div className="text-xxxs text-slate-500">
                    Replace list with active roster ({activeRoster.name})
                  </div>
                </div>
                <Button
                  onClick={importFromRoster}
                  variant="primary"
                  size="sm"
                  className="gap-2"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Import
                </Button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xxs  text-slate-400 uppercase tracking-widest mb-2 block">
                First Names
              </label>
              <textarea
                value={localFirstNames}
                onChange={(e) => setLocalFirstNames(e.target.value)}
                onBlur={() => {
                  // Cancel debounce timer to prevent duplicate updates
                  if (firstNamesTimerRef.current) {
                    clearTimeout(firstNamesTimerRef.current);
                    firstNamesTimerRef.current = null;
                  }
                  if (localFirstNames !== firstNames) {
                    updateWidgetRef.current(widget.id, {
                      config: {
                        ...configRef.current,
                        firstNames: localFirstNames,
                      },
                    });
                  }
                }}
                placeholder="John&#10;Jane..."
                className="w-full h-32 p-3 text-xs bg-white border border-slate-200 rounded-2xl focus:ring-2 focus:ring-brand-blue-primary outline-none resize-none font-sans"
              />
            </div>
            <div>
              <label className="text-xxs  text-slate-400 uppercase tracking-widest mb-2 block">
                Last Names
              </label>
              <textarea
                value={localLastNames}
                onChange={(e) => setLocalLastNames(e.target.value)}
                onBlur={() => {
                  // Cancel debounce timer to prevent duplicate updates
                  if (lastNamesTimerRef.current) {
                    clearTimeout(lastNamesTimerRef.current);
                    lastNamesTimerRef.current = null;
                  }
                  if (localLastNames !== lastNames) {
                    updateWidgetRef.current(widget.id, {
                      config: {
                        ...configRef.current,
                        lastNames: localLastNames,
                      },
                    });
                  }
                }}
                placeholder="Smith&#10;Doe..."
                className="w-full h-32 p-3 text-xs bg-white border border-slate-200 rounded-2xl focus:ring-2 focus:ring-brand-blue-primary outline-none resize-none font-sans"
              />
            </div>
          </div>

          <button
            onClick={async () => {
              const confirmed = await showConfirm(
                'Clear all custom student data?',
                {
                  title: 'Clear Student Data',
                  variant: 'danger',
                  confirmLabel: 'Clear',
                }
              );
              if (confirmed) {
                updateWidget(widget.id, {
                  config: {
                    ...config,
                    firstNames: '',
                    lastNames: '',
                    lastResult: null,
                    remainingStudents: [],
                  },
                });
              }
            }}
            className="w-full py-3 flex items-center justify-center gap-2 text-red-500 text-xxs  uppercase tracking-widest hover:bg-red-50 rounded-xl transition-colors border-2 border-dashed border-red-100"
          >
            <Trash2 className="w-4 h-4" /> Clear Custom Names
          </button>
        </>
      )}
    </div>
  );
};
