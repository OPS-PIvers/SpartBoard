import React, { useState, useRef, useEffect, useId } from 'react';
import { useTranslation } from 'react-i18next';
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
  Puzzle,
} from 'lucide-react';
import { Button } from '@/components/common/Button';
import { SettingsLabel } from '@/components/common/SettingsLabel';
import { getLocalIsoDate } from '@/utils/localDate';

export const RandomSettings: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { t } = useTranslation();
  const { updateWidget, activeDashboard, rosters, activeRosterId, addToast } =
    useDashboard();
  const { showConfirm } = useDialog();
  const groupSizeId = useId();
  const homeGroupCountId = useId();
  const expertGroupCountId = useId();
  const firstNamesId = useId();
  const lastNamesId = useId();
  const animationStyleId = useId();

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
    let isStaleSinglePick = false;
    if (Array.isArray(result) && result.length > 0) {
      const first = result[0];
      if (
        typeof first === 'object' &&
        first !== null &&
        'names' in (first as object)
      ) {
        // Group-mode result: RandomGroup[]
        groups = result as RandomGroup[];
      } else if (Array.isArray(first)) {
        // Legacy group-mode result: string[][]
        groups = (result as unknown as string[][]).map((names, i) => ({
          id: `Group ${i + 1}`,
          names: names ?? [],
        }));
      } else if (typeof first === 'string') {
        // Single-pick result that survived a mode switch — flat string list
        // is meaningless as "groups". Surface a clearer message rather than
        // the generic "generate groups first" hint.
        isStaleSinglePick = true;
      }
    }
    if (isStaleSinglePick) {
      addToast(
        'Switch to Groups mode and click Pick before sending — the last result was a single-name pick.',
        'info'
      );
      return;
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
    const { stations, assignments } = buildStationsFromRandomGroups(
      groups,
      activeDashboard?.sharedGroups
    );
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
        firstNames: newFirstNames,
        lastNames: newLastNames,
        lastResult: null,
        remainingStudents: [],
      },
    });
  }, [activeRoster, updateWidget, widget.id]);
  const {
    firstNames = '',
    lastNames = '',
    mode = 'single',
    groupSize: configGroupSize,
    soundEnabled = true,
    rosterMode = 'class',
    autoStartTimer = false,
    visualStyle = 'flash',
    numExpertGroups: configNumExpertGroups,
    numHomeGroups: configNumHomeGroups,
  } = config;
  // Mirror RandomWidget: jigsaw defaults to 4, others to 3, explicit choice wins.
  const groupSize = configGroupSize ?? (mode === 'jigsaw' ? 4 : 3);

  // Mirror RandomWidget's default — "2 home groups per expert group" —
  // computed from an estimate of the home group count so the panel
  // displays what Pick would actually use. Slider clamps to >= 2.
  // Match the widget's absent-student filter in class mode so the panel
  // doesn't drift from the live stepper on days with absences.
  const estimatedStudentCount = (() => {
    if (rosterMode === 'class' && activeRoster) {
      const today = getLocalIsoDate();
      const absentCount =
        activeRoster.absent?.date === today
          ? activeRoster.absent.studentIds.length
          : 0;
      return Math.max(0, activeRoster.students.length - absentCount);
    }
    const firsts = firstNames
      .split('\n')
      .map((n) => n.trim())
      .filter(Boolean).length;
    const lasts = lastNames
      .split('\n')
      .map((n) => n.trim())
      .filter(Boolean).length;
    return Math.max(firsts, lasts);
  })();
  const estimatedHomeGroups = Math.max(
    1,
    Math.ceil(estimatedStudentCount / Math.max(1, groupSize))
  );
  // Jigsaw home-group COUNT (parallel to numExpertGroups). Falls back to the
  // count implied by `groupSize` for widgets that pre-date `numHomeGroups`.
  // Clamp to >= 2 to match the slider min and the widget-face stepper.
  const numHomeGroups = Math.max(2, configNumHomeGroups ?? estimatedHomeGroups);
  // EXPERT default mirrors the widget face: base it on the home-group count
  // we'll actually use at pick time (`numHomeGroups`), not on the legacy
  // `estimatedHomeGroups` derived from `groupSize`.
  const numExpertGroups =
    configNumExpertGroups ?? Math.max(2, Math.ceil(numHomeGroups / 2));

  const [localFirstNames, setLocalFirstNames] = useState(firstNames);
  const [localLastNames, setLocalLastNames] = useState(lastNames);
  const [prevFirstNames, setPrevFirstNames] = useState(firstNames);
  const [prevLastNames, setPrevLastNames] = useState(lastNames);

  const firstNamesTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastNamesTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Mirror updateWidget into a ref so the debounced setTimeout callbacks
  // always read the current function even if the context value changes
  // mid-debounce. CLAUDE.md: assign in the render body, no useEffect needed.
  const updateWidgetRef = useRef(updateWidget);
  // eslint-disable-next-line react-hooks/refs
  updateWidgetRef.current = updateWidget;

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
          config: { firstNames: localFirstNames },
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
          config: { lastNames: localLastNames },
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
    { id: 'jigsaw', label: 'Jigsaw', icon: Puzzle },
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
            config: { rosterMode: mode },
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
              config: { soundEnabled: !soundEnabled },
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
                config: { autoStartTimer: !autoStartTimer },
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
      {mode === 'groups' && (
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
        <SettingsLabel>Operation Mode</SettingsLabel>
        <div className="grid grid-cols-4 gap-2">
          {modes.map((m) => (
            <button
              key={m.id}
              onClick={() =>
                updateWidget(widget.id, {
                  config: {
                    mode: m.id,
                    lastResult: null,
                    jigsawHomeGroups: null,
                    jigsawExpertGroups: null,
                    jigsawView: 'home',
                  },
                })
              }
              className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl border-2 transition-all ${
                mode === m.id
                  ? 'border-brand-blue-primary bg-brand-blue-lighter text-brand-blue-primary'
                  : 'border-slate-100 text-slate-400 hover:border-slate-200'
              }`}
            >
              <m.icon className="w-5 h-5" />
              <span className="text-xxxs uppercase">{m.label}</span>
            </button>
          ))}
        </div>
      </div>

      {mode === 'single' && (
        <div>
          <SettingsLabel as="span" id={animationStyleId}>
            Animation Style
          </SettingsLabel>
          <div
            role="group"
            aria-labelledby={animationStyleId}
            className="grid grid-cols-3 gap-2"
          >
            {styles.map((s) => (
              <button
                key={s.id}
                onClick={() =>
                  updateWidget(widget.id, {
                    config: {
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
                <span className="text-xxxs uppercase">{s.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {mode === 'groups' && (
        <div className="p-4 bg-white border border-slate-100 rounded-2xl shadow-sm">
          <SettingsLabel icon={Hash} htmlFor={groupSizeId}>
            {t('widgets.random.groupSize', { defaultValue: 'Group Size' })}
          </SettingsLabel>
          <div className="flex items-center gap-4">
            <input
              id={groupSizeId}
              type="range"
              min="2"
              max="20"
              step="1"
              value={groupSize}
              onChange={(e) => {
                const next = parseInt(e.target.value, 10);
                if (!Number.isFinite(next)) return;
                updateWidget(widget.id, {
                  config: { groupSize: next },
                });
              }}
              className="flex-1 accent-brand-blue-primary h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer"
            />
            <span className="w-10 text-center font-mono text-slate-700 text-sm">
              {groupSize}
            </span>
          </div>
        </div>
      )}
      {mode === 'jigsaw' && (
        <div className="p-4 bg-white border border-slate-100 rounded-2xl shadow-sm">
          <SettingsLabel icon={Hash} htmlFor={homeGroupCountId}>
            {t('widgets.random.homeGroupCount', {
              defaultValue: 'Number of Home Groups',
            })}
          </SettingsLabel>
          <div className="flex items-center gap-4">
            <input
              id={homeGroupCountId}
              type="range"
              min="2"
              max="20"
              step="1"
              value={numHomeGroups}
              onChange={(e) => {
                const next = parseInt(e.target.value, 10);
                if (!Number.isFinite(next)) return;
                updateWidget(widget.id, {
                  config: { numHomeGroups: next },
                });
              }}
              className="flex-1 accent-brand-blue-primary h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer"
            />
            <span className="w-10 text-center font-mono text-slate-700 text-sm">
              {numHomeGroups}
            </span>
          </div>
        </div>
      )}

      {mode === 'jigsaw' && (
        <div className="p-4 bg-white border border-slate-100 rounded-2xl shadow-sm">
          <SettingsLabel icon={Puzzle} htmlFor={expertGroupCountId}>
            {t('widgets.random.expertGroupCount', {
              defaultValue: 'Number of Expert Groups',
            })}
          </SettingsLabel>
          <div className="flex items-center gap-4">
            <input
              id={expertGroupCountId}
              type="range"
              min="2"
              max="20"
              step="1"
              value={numExpertGroups}
              onChange={(e) => {
                const next = parseInt(e.target.value, 10);
                if (!Number.isFinite(next)) return;
                updateWidget(widget.id, {
                  config: { numExpertGroups: next },
                });
              }}
              className="flex-1 accent-brand-blue-primary h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer"
            />
            <span className="w-10 text-center font-mono text-slate-700 text-sm">
              {numExpertGroups}
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
              <SettingsLabel htmlFor={firstNamesId}>First Names</SettingsLabel>
              <textarea
                id={firstNamesId}
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
                      config: { firstNames: localFirstNames },
                    });
                  }
                }}
                placeholder="John&#10;Jane..."
                className="w-full h-32 p-3 text-xs bg-white border border-slate-200 rounded-2xl focus:ring-2 focus:ring-brand-blue-primary outline-none resize-none font-sans"
              />
            </div>
            <div>
              <SettingsLabel htmlFor={lastNamesId}>Last Names</SettingsLabel>
              <textarea
                id={lastNamesId}
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
                      config: { lastNames: localLastNames },
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
                    firstNames: '',
                    lastNames: '',
                    lastResult: null,
                    remainingStudents: [],
                  },
                });
              }
            }}
            className="w-full py-3 flex items-center justify-center gap-2 text-red-500 text-xxs uppercase tracking-widest hover:bg-red-50 rounded-xl transition-colors border-2 border-dashed border-red-100"
          >
            <Trash2 className="w-4 h-4" /> Clear Custom Names
          </button>
        </>
      )}
    </div>
  );
};
