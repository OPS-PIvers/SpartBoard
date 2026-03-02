import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useDashboard } from '../../../context/useDashboard';
import {
  WidgetData,
  RandomConfig,
  WidgetConfig,
  TimeToolConfig,
  RandomGroup,
  SharedGroup,
  ScoreboardTeam,
} from '../../../types';
import { Button } from '../../common/Button';
import {
  Users,
  RefreshCw,
  Layers,
  Target,
  RotateCcw,
  Trophy,
} from 'lucide-react';
import { getAudioCtx, playTick, playWinner } from './audioUtils';

const TEAM_COLORS = [
  'bg-blue-500',
  'bg-red-500',
  'bg-green-500',
  'bg-yellow-500',
  'bg-purple-500',
  'bg-pink-500',
  'bg-indigo-500',
  'bg-orange-500',
  'bg-teal-600',
  'bg-cyan-500',
];
import { RandomWheel } from './RandomWheel';
import { RandomSlots } from './RandomSlots';
import { RandomFlash } from './RandomFlash';

import { WidgetLayout } from '../WidgetLayout';

export const RandomWidget: React.FC<{ widget: WidgetData }> = ({ widget }) => {
  const { t } = useTranslation();
  const {
    updateWidget,
    updateDashboard,
    addWidget,
    addToast,
    rosters,
    activeRosterId,
    activeDashboard,
  } = useDashboard();
  const config = widget.config as RandomConfig;
  const {
    firstNames = '',
    lastNames = '',
    mode = 'single',
    soundEnabled = true,
    remainingStudents = [],
    rosterMode = 'class',
    autoStartTimer = false,
    visualStyle = 'flash',
    groupSize = 3,
  } = config;

  const [isSpinning, setIsSpinning] = useState(false);
  const [displayResult, setDisplayResult] = useState<
    string | string[] | string[][] | RandomGroup[]
  >(() => {
    const raw = config.lastResult;
    if (
      Array.isArray(raw) &&
      raw.length > 0 &&
      typeof raw[0] === 'object' &&
      raw[0] !== null &&
      'names' in raw[0]
    ) {
      return raw as RandomGroup[];
    }
    return (raw as string | string[] | string[][]) ?? '';
  });
  const [rotation, setRotation] = useState(0);

  // Track active roster to only clear when it actually changes
  const lastRosterRef = useRef<{ id: string | null; mode: string }>({
    id: activeRosterId,
    mode: rosterMode,
  });

  useEffect(() => {
    const rawResult = config.lastResult;
    if (
      Array.isArray(rawResult) &&
      rawResult.length > 0 &&
      typeof rawResult[0] === 'object' &&
      rawResult[0] !== null &&
      'names' in rawResult[0]
    ) {
      setDisplayResult(rawResult as RandomGroup[]);
    } else {
      setDisplayResult((rawResult as string | string[] | string[][]) ?? '');
    }
  }, [config.lastResult]);

  // Clear session data when active roster changes to avoid cross-contamination
  useEffect(() => {
    const changed =
      activeRosterId !== lastRosterRef.current.id ||
      rosterMode !== lastRosterRef.current.mode;

    if (changed) {
      lastRosterRef.current = { id: activeRosterId, mode: rosterMode };
      updateWidget(widget.id, {
        config: {
          ...config,
          lastResult: null,
          remainingStudents: [],
        },
      });
    }
  }, [activeRosterId, widget.id, updateWidget, config, rosterMode]);

  const activeRoster = useMemo(
    () => rosters.find((r) => r.id === activeRosterId),
    [rosters, activeRosterId]
  );

  const students = useMemo(() => {
    if (rosterMode === 'class' && activeRoster) {
      return activeRoster.students.map((s) =>
        `${s.firstName} ${s.lastName}`.trim()
      );
    }

    const firsts = firstNames
      .split('\n')
      .map((n: string) => n.trim())
      .filter((n: string) => n);

    const lasts = lastNames
      .split('\n')
      .map((n: string) => n.trim())
      .filter((n: string) => n);

    const count = Math.max(firsts.length, lasts.length);
    const combined = [];
    for (let i = 0; i < count; i++) {
      const f = firsts[i] || '';
      const l = lasts[i] || '';
      const name = `${f} ${l}`.trim();
      if (name) combined.push(name);
    }
    return combined;
  }, [firstNames, lastNames, activeRoster, rosterMode]);

  const shuffle = <T,>(array: T[]): T[] => {
    const newArr = [...array];
    for (let i = newArr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
    }
    return newArr;
  };

  const handleReset = () => {
    updateWidget(widget.id, {
      config: {
        remainingStudents: [],
        lastResult: null,
      } as unknown as WidgetConfig,
    });
    setDisplayResult('');
    setRotation(0);
  };

  const handleSendToScoreboard = () => {
    // 1. Normalize current groups from displayResult
    const rawResult = displayResult;
    let groups: RandomGroup[] | null = null;

    if (Array.isArray(rawResult) && rawResult.length > 0) {
      const first = rawResult[0];
      // Case A: Already in RandomGroup[] shape
      if (
        typeof first === 'object' &&
        first !== null &&
        'names' in (first as RandomGroup)
      ) {
        groups = rawResult as RandomGroup[];
      }
      // Case B: Legacy string[][] shape – convert to RandomGroup[]
      else if (Array.isArray(first)) {
        const stringGroups = rawResult as string[][];
        groups = stringGroups.map((names): RandomGroup => ({ names }));
      }
    }

    if (!groups || groups.length === 0) {
      return;
    }

    // 2. Map to ScoreboardTeam
    const newTeams: ScoreboardTeam[] = groups.map((group, index) => {
      let name = `Group ${index + 1}`;
      // If linked to shared group, use that name
      if (group.id && activeDashboard?.sharedGroups) {
        const shared = activeDashboard.sharedGroups.find(
          (g) => g.id === group.id
        );
        if (shared) name = shared.name;
      }

      return {
        id: crypto.randomUUID(),
        name,
        score: 0,
        color: TEAM_COLORS[index % TEAM_COLORS.length],
        linkedGroupId: group.id,
      };
    });

    // 3. Find or Create Scoreboard Widget
    const existingScoreboard = activeDashboard?.widgets.find(
      (w) => w.type === 'scoreboard'
    );

    if (existingScoreboard) {
      updateWidget(existingScoreboard.id, {
        config: {
          ...existingScoreboard.config,
          teams: newTeams,
        },
      });
      addToast(
        t('widgets.random.scoreboardUpdated', { count: newTeams.length }),
        'success'
      );
    } else {
      // Create new widget
      addWidget('scoreboard', {
        config: {
          teams: newTeams,
        },
      });
      addToast(
        t('widgets.random.scoreboardCreated', { count: newTeams.length }),
        'success'
      );
    }
  };

  const handlePick = async () => {
    if (students.length === 0) return;

    // CRITICAL: Resume AudioContext within the click handler to unlock sound
    const ctx = getAudioCtx();
    if (ctx && ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch (e) {
        console.error('Audio resume failed', e);
      }
    }

    if (isSpinning) return;
    setIsSpinning(true);

    const performUpdate = (
      result: string | string[] | string[][] | RandomGroup[],
      remaining?: string[]
    ) => {
      try {
        // Firestore doesn't support nested arrays (e.g., string[][]).
        // If we have groups, we transform them into an array of objects.
        let syncResult = result;

        if (mode === 'groups' && Array.isArray(result) && result.length > 0) {
          // Check if it's string[][] (legacy)
          if (Array.isArray(result[0])) {
            syncResult = (result as string[][]).map((names) => ({
              names,
              id: crypto.randomUUID(),
            }));
          }
          // If it is already RandomGroup[] (has .names), we keep it
        }

        // If we have RandomGroups with IDs, sync them to Dashboard sharedGroups
        if (
          mode === 'groups' &&
          Array.isArray(syncResult) &&
          syncResult.length > 0 &&
          typeof syncResult[0] === 'object' &&
          'id' in syncResult[0]
        ) {
          const groups = syncResult as RandomGroup[];
          const newSharedGroups: SharedGroup[] = groups.map((g, i) => ({
            id: g.id ?? '',
            name: `Group ${i + 1}`,
          }));

          const existing = activeDashboard?.sharedGroups ?? [];
          const uniqueNew = newSharedGroups.filter(
            (n) => !existing.some((e) => e.id === n.id)
          );

          if (uniqueNew.length > 0) {
            updateDashboard({ sharedGroups: [...existing, ...uniqueNew] });
          }
        }

        // Optimized update: only send what changed.
        // DashboardContext now handles deep merging of config.
        const updates: Partial<RandomConfig> = {
          lastResult: syncResult as string | string[] | RandomGroup[],
        };
        if (remaining) {
          updates.remainingStudents = remaining;
        }

        updateWidget(widget.id, {
          config: updates as unknown as WidgetConfig,
        });

        // Nexus: Auto-Start Timer Logic
        if (autoStartTimer && activeDashboard && mode === 'single') {
          const timeWidget = activeDashboard.widgets.find(
            (w) => w.type === 'time-tool'
          );

          if (timeWidget) {
            const timeConfig = timeWidget.config as TimeToolConfig;
            // Only start if not already running to avoid resetting start time unexpectedly
            if (!timeConfig.isRunning) {
              updateWidget(timeWidget.id, {
                config: {
                  ...timeConfig,
                  isRunning: true,
                  startTime: Date.now(),
                } as WidgetConfig,
              });
            }
          }
        }
      } catch (err) {
        console.error('Randomizer Sync Error:', err);
      }
    };

    if (mode === 'single') {
      let pool =
        remainingStudents.length > 0 ? remainingStudents : [...students];
      pool = pool.filter((s) => students.includes(s));

      if (pool.length === 0) {
        pool = [...students];
      }

      const winnerIndexInPool = Math.floor(Math.random() * pool.length);
      const winnerName = pool[winnerIndexInPool];
      const nextRemaining = pool.filter((_, i) => i !== winnerIndexInPool);

      if (visualStyle === 'flash') {
        let count = 0;
        const interval = setInterval(() => {
          const randomName =
            students[Math.floor(Math.random() * students.length)];
          setDisplayResult(randomName);
          if (soundEnabled) playTick(150 + Math.random() * 50);
          count++;
          if (count > 20) {
            clearInterval(interval);
            setDisplayResult(winnerName);
            if (soundEnabled) playWinner();
            setIsSpinning(false);
            performUpdate(winnerName, nextRemaining);
          }
        }, 80);
      } else if (visualStyle === 'wheel') {
        const extraSpins = 5;
        let winnerIndex = students.indexOf(winnerName);
        if (winnerIndex === -1) winnerIndex = 0;

        const segmentAngle = 360 / students.length;
        const targetRotation =
          rotation +
          360 * extraSpins +
          (360 - (winnerIndex * segmentAngle + segmentAngle / 2)) -
          (rotation % 360);

        setRotation(targetRotation);

        const duration = 4000;
        const startTime = Date.now();

        const tickSequence = (count: number) => {
          const elapsed = Date.now() - startTime;
          if (elapsed >= duration) {
            setDisplayResult(winnerName);
            if (soundEnabled) playWinner();
            setIsSpinning(false);
            performUpdate(winnerName, nextRemaining);
            return;
          }
          if (soundEnabled) playTick(150);
          const progress = elapsed / duration;
          const nextInterval = 50 + Math.pow(progress, 2) * 400;
          setTimeout(() => {
            tickSequence(count + 1);
          }, nextInterval);
        };
        tickSequence(0);
      } else if (visualStyle === 'slots') {
        let count = 0;
        const max = 25;
        const interval = setInterval(() => {
          const randomName =
            students[Math.floor(Math.random() * students.length)];
          setDisplayResult(randomName);
          if (soundEnabled) playTick(150, 0.05);
          count++;
          if (count > max) {
            clearInterval(interval);
            setDisplayResult(winnerName);
            if (soundEnabled) playWinner();
            setIsSpinning(false);
            performUpdate(winnerName, nextRemaining);
          }
        }, 100);
      }
    } else {
      setTimeout(() => {
        let result;
        if (mode === 'shuffle') {
          result = shuffle(students);
        } else {
          const shuffled = shuffle(students);
          result = [];
          for (let i = 0; i < shuffled.length; i += groupSize) {
            result.push({
              id: crypto.randomUUID(),
              names: shuffled.slice(i, i + groupSize),
            });
          }
        }
        setDisplayResult(result);
        if (soundEnabled) playWinner();
        setIsSpinning(false);
        performUpdate(result);
      }, 500);
    }
  };

  // Use the longest individual word (not full name length) so that a single
  // word is never forced to wrap. cqw (container-width-relative) units ensure
  // the chosen font size fits within the widget's actual width regardless of
  // the widget's aspect ratio.
  const maxWordLength = useMemo(
    () =>
      students
        .flatMap((name) => name.trim().split(/\s+/))
        .reduce((maxLen, word) => Math.max(maxLen, word.length), 0),
    [students]
  );

  // 130/N cqw guarantees the N-char word fits (uppercase bold, ~0.65
  // char-width ratio, 15 % safety margin). Derived dynamically so the
  // guarantee holds for any word length, not just those in a lookup table.
  // Capped at 40cqw for very short words and 4cqw as an absolute minimum.
  // The cqh cap (20cqh) prevents vertical overflow in very wide-but-short
  // widgets where a pure cqw value could produce an impossibly tall font.
  const resFontSize = useMemo(() => {
    if (maxWordLength === 0) return 'min(26cqw, 20cqh)';
    const cqwValue = Math.min(40, Math.max(4, Math.round(130 / maxWordLength)));
    return `min(${cqwValue}cqw, 20cqh)`;
  }, [maxWordLength]);

  const renderSinglePick = () => {
    if (visualStyle === 'wheel' && students.length > 0) {
      const wheelSize = Math.min(widget.w * 0.95, widget.h * 0.8);

      return (
        <RandomWheel
          students={students}
          rotation={rotation}
          wheelSize={wheelSize}
          displayResult={displayResult as string | string[] | string[][] | null}
          isSpinning={isSpinning}
          resultFontSize={resFontSize}
        />
      );
    }

    if (visualStyle === 'slots') {
      return (
        <RandomSlots
          displayResult={displayResult as string | string[] | string[][] | null}
          fontSize={resFontSize}
          slotHeight={widget.h * 0.5}
        />
      );
    }

    return (
      <RandomFlash
        displayResult={displayResult as string | string[] | string[][] | null}
        isSpinning={isSpinning}
        fontSize={resFontSize}
      />
    );
  };

  if (students.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full text-slate-400 text-center"
        style={{
          padding: 'min(24px, 5cqmin)',
          gap: 'min(12px, 3cqmin)',
        }}
      >
        <Users
          className="opacity-20"
          style={{
            width: 'min(48px, 12cqmin)',
            height: 'min(48px, 12cqmin)',
          }}
        />
        <div>
          <p
            className="uppercase tracking-widest font-bold"
            style={{
              fontSize: 'min(14px, 3.5cqmin)',
              marginBottom: 'min(4px, 1cqmin)',
            }}
          >
            No Names Provided
          </p>
          <p style={{ fontSize: 'min(12px, 3cqmin)' }}>
            Flip this widget to enter your student roster.
          </p>
        </div>
      </div>
    );
  }

  return (
    <WidgetLayout
      padding="p-0"
      header={
        <div
          className="flex justify-between items-center w-full"
          style={{ padding: 'min(4px, 1cqmin) min(8px, 2cqmin) 0' }}
        >
          <div
            className="flex items-center"
            style={{ gap: 'min(8px, 2cqmin)' }}
          >
            {mode === 'single' && (
              <>
                <button
                  onClick={handleReset}
                  disabled={
                    isSpinning ||
                    (remainingStudents.length === 0 && !displayResult)
                  }
                  className="hover:bg-slate-100 rounded-full text-slate-400 hover:text-brand-blue-primary transition-all disabled:opacity-30"
                  style={{ padding: 'min(6px, 1.5cqmin)' }}
                  title="Reset student pool"
                >
                  <RotateCcw
                    style={{
                      width: 'min(14px, 3.5cqmin)',
                      height: 'min(14px, 3.5cqmin)',
                    }}
                  />
                </button>
                {remainingStudents.length > 0 && (
                  <span
                    className="font-black text-slate-500 uppercase tracking-tight bg-slate-50 rounded border border-slate-200"
                    style={{
                      fontSize: 'min(9px, 2.2cqmin)',
                      padding: 'min(2px, 0.5cqmin) min(6px, 1.5cqmin)',
                    }}
                  >
                    {remainingStudents.length} Left
                  </span>
                )}
              </>
            )}
          </div>
          {activeRoster && rosterMode === 'class' && (
            <div
              className="flex items-center bg-brand-blue-lighter rounded-full border border-brand-blue-light"
              style={{
                gap: 'min(6px, 1.5cqmin)',
                padding: 'min(2px, 0.5cqmin) min(8px, 2cqmin)',
              }}
            >
              <Target
                className="text-brand-blue-primary"
                style={{
                  width: 'min(10px, 2.5cqmin)',
                  height: 'min(10px, 2.5cqmin)',
                }}
              />
              <span
                className="font-black uppercase text-brand-blue-primary tracking-wider"
                style={{ fontSize: 'min(9px, 2.2cqmin)' }}
              >
                {activeRoster.name}
              </span>
            </div>
          )}
        </div>
      }
      content={
        <div className="flex-1 flex flex-col items-center justify-center w-full min-h-0 overflow-hidden">
          {mode === 'single' ? (
            renderSinglePick()
          ) : (
            <div
              className="w-full h-full flex flex-col min-h-0"
              style={{ padding: '0 min(8px, 2cqmin)' }}
            >
              {mode === 'shuffle' ? (
                <div
                  className="flex-1 overflow-y-auto w-full custom-scrollbar flex flex-col"
                  style={{
                    padding: 'min(4px, 1cqmin) 0',
                    gap: 'min(4px, 1cqmin)',
                  }}
                >
                  {(Array.isArray(displayResult) &&
                  (displayResult.length === 0 ||
                    !Array.isArray(displayResult[0]))
                    ? (displayResult as string[])
                    : []
                  ).map((name: string, i: number) => (
                    <div
                      key={i}
                      className="flex items-center bg-white rounded-xl border border-slate-200 transition-all hover:bg-slate-50 shadow-sm"
                      style={{
                        gap: 'min(12px, 3cqmin)',
                        padding: 'min(8px, 2cqmin)',
                      }}
                    >
                      <span
                        className="font-mono font-black text-slate-400"
                        style={{ fontSize: 'min(14px, 3.5cqmin)' }}
                      >
                        {i + 1}
                      </span>
                      <span
                        className="leading-none font-bold text-slate-700"
                        style={{ fontSize: 'min(24px, 6cqmin)' }}
                      >
                        {name}
                      </span>
                    </div>
                  ))}
                  {(!displayResult ||
                    !Array.isArray(displayResult) ||
                    (displayResult.length > 0 &&
                      Array.isArray(displayResult[0]))) && (
                    <div
                      className="flex-1 flex flex-col items-center justify-center text-slate-300 italic"
                      style={{
                        padding: 'min(40px, 8cqmin) 0',
                        gap: 'min(8px, 2cqmin)',
                      }}
                    >
                      <Layers
                        className="opacity-20"
                        style={{
                          width: 'min(32px, 8cqmin)',
                          height: 'min(32px, 8cqmin)',
                        }}
                      />
                      <span
                        className="font-bold"
                        style={{ fontSize: 'min(14px, 3.5cqmin)' }}
                      >
                        Click Randomize to Shuffle
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div
                  className="flex-1 w-full grid content-start overflow-y-auto custom-scrollbar pr-1 py-2"
                  style={{
                    gridTemplateColumns: `repeat(auto-fit, minmax(130px, 1fr))`,
                    gap: '8px',
                  }}
                >
                  {(Array.isArray(displayResult) &&
                  (displayResult.length === 0 ||
                    Array.isArray(displayResult[0]) ||
                    (typeof displayResult[0] === 'object' &&
                      displayResult[0] !== null))
                    ? (displayResult as (string[] | RandomGroup)[])
                    : []
                  ).map((groupItem, i) => {
                    const groupNames = Array.isArray(groupItem)
                      ? groupItem
                      : groupItem.names;
                    const groupId =
                      !Array.isArray(groupItem) && 'id' in groupItem
                        ? groupItem.id
                        : null;

                    let groupName = `Group ${i + 1}`;
                    if (groupId && activeDashboard?.sharedGroups) {
                      const shared = activeDashboard.sharedGroups.find(
                        (g) => g.id === groupId
                      );
                      if (shared) groupName = shared.name;
                    }

                    if (!groupNames) return null;

                    return (
                      <div
                        key={i}
                        className="bg-blue-50 border border-blue-200 rounded-xl flex flex-col shadow-sm overflow-hidden"
                        style={{ padding: 'min(8px, 2cqmin)' }}
                      >
                        <div
                          className="uppercase text-brand-blue-primary tracking-widest opacity-80 font-black truncate"
                          style={{
                            fontSize: 'min(8px, 2cqmin)',
                            marginBottom: 'min(4px, 1cqmin)',
                          }}
                          title={groupName}
                        >
                          {groupName}
                        </div>
                        <div
                          className="overflow-hidden flex flex-col"
                          style={{ gap: 'min(2px, 0.5cqmin)' }}
                        >
                          {groupNames.map((name, ni) => (
                            <div
                              key={ni}
                              className="text-slate-700 font-bold whitespace-nowrap overflow-hidden text-ellipsis"
                              style={{ fontSize: 'min(12px, 3cqmin)' }}
                            >
                              {name}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  {(!displayResult ||
                    !Array.isArray(displayResult) ||
                    (displayResult.length > 0 &&
                      !Array.isArray(displayResult[0]) &&
                      typeof displayResult[0] !== 'object')) && (
                    <div
                      className="col-span-full flex flex-col items-center justify-center text-slate-300 italic h-full font-bold"
                      style={{
                        padding: 'min(40px, 8cqmin) 0',
                        gap: 'min(8px, 2cqmin)',
                      }}
                    >
                      <Users
                        className="opacity-20"
                        style={{
                          width: 'min(32px, 8cqmin)',
                          height: 'min(32px, 8cqmin)',
                        }}
                      />
                      <span style={{ fontSize: 'min(14px, 3.5cqmin)' }}>
                        Click Randomize to Group
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      }
      footer={
        <div
          className="w-full px-2 pb-2 flex"
          style={{ gap: 'min(8px, 2cqmin)' }}
        >
          {mode === 'groups' &&
            Array.isArray(displayResult) &&
            displayResult.length > 0 &&
            ((typeof displayResult[0] === 'object' &&
              displayResult[0] !== null &&
              'names' in displayResult[0]) ||
              Array.isArray(displayResult[0])) && (
              <Button
                variant="secondary"
                shape="pill"
                onClick={handleSendToScoreboard}
                aria-label={t('widgets.random.sendToScoreboard')}
                style={{
                  width: 'min(48px, 12cqmin)',
                  height: 'min(48px, 12cqmin)',
                  padding: 0,
                }}
                className="flex-shrink-0"
                title={t('widgets.random.sendToScoreboard')}
                icon={
                  <Trophy
                    style={{
                      width: 'min(20px, 5cqmin)',
                      height: 'min(20px, 5cqmin)',
                    }}
                    className="text-amber-500"
                  />
                }
              />
            )}
          <Button
            variant="hero"
            size="lg"
            shape="pill"
            onClick={handlePick}
            disabled={isSpinning}
            className="flex-1 h-12"
            icon={
              <RefreshCw
                className={`w-4 h-4 ${isSpinning ? 'animate-spin' : ''}`}
              />
            }
          >
            {isSpinning ? 'Picking...' : 'Randomize'}
          </Button>
        </div>
      }
    />
  );
};
