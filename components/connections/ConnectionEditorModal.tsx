import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowDown,
  ArrowUp,
  Clock,
  MoreHorizontal,
  Play,
  Plus,
  Repeat,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import type {
  ConnectionAction,
  ConnectionStep,
  Dashboard,
  FollowConnection,
  SequenceConnection,
  WidgetConnection,
  WidgetData,
} from '@/types';
import { Modal } from '@/components/common/Modal';
import { useDashboard } from '@/context/useDashboard';
import {
  connectionsUi,
  startConnectMode,
  type EditorDraft,
} from '@/context/connectionsUiStore';
import { connectionDefFor } from '@/config/widgetConnections';
import { Z_INDEX } from '@/config/zIndex';
import { isConnectionLive, mergeInstantSteps } from '@/utils/connectionEngine';
import { sendRunCommand } from '@/utils/connectionSignals';
import {
  headingAfter,
  loopRunsOut,
  type RowHeading,
} from '@/utils/connectionWording';
import { getTitle } from '@/utils/widgetHelpers';
import { tourAttr } from '@/config/tourAnchors';
import { StepParamPicker } from './StepParamPicker';

const MAX_WAIT_SECONDS = 600;
const MAX_REPEAT = 99;

const newStepId = () => crypto.randomUUID();

// An action on a widget with its step choice prefilled from what the widget shows now.
const withDefaults = (w: WidgetData, action: string): ConnectionAction => {
  const params = connectionDefFor(w.type)
    ?.actions.find((a) => a.id === action)
    ?.defaultParams?.(w.config as Record<string, unknown>);
  return { widgetId: w.id, action, ...(params && { params }) };
};

// Board widget names, numbered when two share a title ("Timer", "Timer 2").
const useWidgetNames = (widgets: WidgetData[]) =>
  useMemo(() => {
    const seen = new Map<string, number>();
    const names = new Map<string, string>();
    for (const w of widgets) {
      const base = getTitle(w);
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      names.set(w.id, n > 1 ? `${base} ${n}` : base);
    }
    return names;
  }, [widgets]);

// Drops missing widgets and empty steps, and clears any Run so an edited Sequence starts clean.
const cleanForSave = (
  c: WidgetConnection,
  widgets: WidgetData[]
): WidgetConnection | null => {
  const ids = new Set(widgets.map((w) => w.id));
  if (c.kind === 'follow') return isConnectionLive(c, widgets) ? c : null;
  const steps = c.steps
    .map((s) => ({
      ...s,
      actions: s.actions.filter((a) => ids.has(a.widgetId)),
    }))
    .filter((s) => s.actions.length > 0 || (s.waitSeconds ?? 0) > 0);
  const seq: SequenceConnection = { ...c, steps, run: null };
  return steps.length >= 2 && isConnectionLive(seq, widgets) ? seq : null;
};

// A small menu pinned under the button that opened it, above the modal.
const PopMenu: React.FC<{
  at: DOMRect;
  onClose: () => void;
  children: React.ReactNode;
  alignRight?: boolean;
}> = ({ at, onClose, children, alignRight }) => {
  // Escape closes just this menu, not the editor under it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  return createPortal(
    <>
      <div
        className="fixed inset-0"
        style={{ zIndex: Z_INDEX.popover }}
        onPointerDown={(e) => {
          e.stopPropagation();
          onClose();
        }}
      />
      <div
        role="menu"
        className="fixed min-w-48 max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 pb-1 text-sm text-slate-700 shadow-xl"
        style={{
          left: Math.max(
            8,
            Math.min(
              alignRight ? at.right - 192 : at.left,
              window.innerWidth - 208
            )
          ),
          top: at.bottom + 6,
          zIndex: Z_INDEX.popover + 1,
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </>,
    document.body
  );
};

const menuItem =
  'flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent';

const actionSelectClass =
  'rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-sm text-slate-700 hover:border-slate-300';

export const ConnectionEditorModal: React.FC<{
  draft: EditorDraft;
  board: Dashboard;
}> = ({ draft, board }) => {
  const { t } = useTranslation();
  const { updateDashboard } = useDashboard();
  // Saved steps that wait for nothing back to back show as the one moment they are.
  const [connections, setConnections] = useState(() =>
    draft.connections.map((c) => {
      if (c.kind !== 'sequence') return c;
      const types = new Map(board.widgets.map((w) => [w.id, w.type]));
      const merged = mergeInstantSteps(c.steps, (id) => types.get(id));
      return merged.length >= 2 ? { ...c, steps: merged } : c;
    })
  );
  const [rowMenu, setRowMenu] = useState<{ i: number; at: DOMRect } | null>(
    null
  );
  const [alsoMenu, setAlsoMenu] = useState<{ i: number; at: DOMRect } | null>(
    null
  );
  const names = useWidgetNames(board.widgets);
  const widgetsById = useMemo(
    () => new Map(board.widgets.map((w) => [w.id, w])),
    [board.widgets]
  );
  const connectable = board.widgets.filter(
    (w) => (connectionDefFor(w.type)?.actions.length ?? 0) > 0
  );

  const seq = connections.find(
    (c): c is SequenceConnection => c.kind === 'sequence'
  );
  const follows = connections.filter(
    (c): c is FollowConnection => c.kind === 'follow'
  );
  const liveRun = board.connections?.find(
    (c) => c.kind === 'sequence' && draft.replaces.includes(c.id) && c.run
  );

  const close = () => connectionsUi.set({ editor: null });

  const setSeq = (next: SequenceConnection) =>
    setConnections((cs) => cs.map((c) => (c.id === next.id ? next : c)));
  const typeOf = (id: string) => widgetsById.get(id)?.type;
  const setSteps = (steps: ConnectionStep[]) => {
    if (!seq) return;
    const merged = mergeInstantSteps(steps, typeOf);
    setSeq({ ...seq, steps: merged.length >= 2 ? merged : steps });
  };
  const updateStep = (i: number, step: ConnectionStep) => {
    if (!seq) return;
    setSteps(seq.steps.map((s, j) => (j === i ? step : s)));
  };
  const moveStep = (i: number, by: -1 | 1) => {
    if (!seq) return;
    const steps = [...seq.steps];
    const [s] = steps.splice(i, 1);
    steps.splice(i + by, 0, s);
    setSteps(steps);
  };

  const addPause = () => {
    if (!seq) return;
    setSteps([...seq.steps, { id: newStepId(), actions: [], waitSeconds: 5 }]);
  };

  const addWidgets = () =>
    startConnectMode(board.id, null, { ...draft, connections });

  const save = (start: boolean) => {
    const kept = (board.connections ?? []).filter(
      (c) => !draft.replaces.includes(c.id)
    );
    const cleaned = connections.flatMap((c) => {
      const next = cleanForSave(c, board.widgets);
      return next ? [next] : [];
    });
    updateDashboard({ connections: [...kept, ...cleaned] });
    close();
    const saved = cleaned.find(
      (c): c is SequenceConnection => c.kind === 'sequence'
    );
    if (start && saved) sendRunCommand(saved.id, 'start', saved.steps);
  };

  const remove = () => {
    updateDashboard({
      connections: (board.connections ?? []).filter(
        (c) => !draft.replaces.includes(c.id)
      ),
    });
    close();
  };

  const stopRun = () => {
    updateDashboard({
      connections: (board.connections ?? []).map((c) =>
        c.kind === 'sequence' && draft.replaces.includes(c.id)
          ? { ...c, run: null }
          : c
      ),
    });
  };

  const actionLabel = (w: WidgetData, actionId: string) => {
    const def = connectionDefFor(w.type)?.actions.find(
      (a) => a.id === actionId
    );
    return t(`connections.actions.${w.type}.${actionId}`, {
      defaultValue: def?.label ?? actionId,
    });
  };

  const headingText = (h: RowHeading) => {
    switch (h.kind) {
      case 'start':
        return t('connections.editor.headStart', { defaultValue: 'Start' });
      case 'after-pause':
        return t('connections.editor.headAfterPause', {
          defaultValue: 'After the pause',
        });
      case 'then':
        return t('connections.editor.headThen', {
          defaultValue: 'Then',
        });
      case 'next-block':
        return t('connections.editor.headNextBlock', {
          defaultValue: 'When the next block starts',
        });
      case 'ends': {
        const list = h.widgetIds.map((id) => names.get(id) ?? '').join(' and ');
        return h.widgetIds.length > 1
          ? t('connections.editor.headEndMany', {
              names: list,
              defaultValue: 'When {{names}} end',
            })
          : t('connections.editor.headEnds', {
              names: list,
              defaultValue: 'When {{names}} ends',
            });
      }
    }
  };

  const followText = (f: FollowConnection) => {
    const follower = widgetsById.get(f.followerId);
    const values = {
      follower: names.get(f.followerId) ?? '',
      leader: names.get(f.leaderId) ?? '',
    };
    return t(`connections.editor.followLine.${follower?.type ?? 'other'}`, {
      ...values,
      defaultValue: t('connections.editor.followsLine', {
        ...values,
        defaultValue: '{{follower}} follows {{leader}}',
      }),
    });
  };

  const runsOut = seq ? loopRunsOut(seq, board.widgets) : null;
  const untilLabel =
    runsOut === 'names'
      ? t('connections.editor.loopUntilNames', {
          defaultValue: 'Loop until every name is used',
        })
      : runsOut === 'items'
        ? t('connections.editor.loopUntilItems', {
            defaultValue: 'Loop until every item is checked',
          })
        : t('connections.editor.loopUntilStop', {
            defaultValue: 'Loop until I press Stop',
          });

  const canStart = !!seq && !!cleanForSave(seq, board.widgets);

  const footer = (
    <div className="flex w-full items-center gap-2">
      {draft.replaces.length > 0 && (
        <button
          type="button"
          {...tourAttr('connections.editor.delete')}
          onClick={remove}
          className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-brand-red-primary hover:bg-brand-red-lighter/40"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          {t('connections.editor.delete', {
            defaultValue: 'Delete connection',
          })}
        </button>
      )}
      <div className="flex-1" />
      <button
        type="button"
        {...tourAttr('connections.editor.cancel')}
        onClick={close}
        className="px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-800"
      >
        {t('common.cancel')}
      </button>
      <button
        type="button"
        {...tourAttr('connections.editor.save')}
        onClick={() => save(false)}
        className={
          canStart
            ? 'rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50'
            : 'rounded-full bg-brand-blue-primary px-5 py-2 text-sm font-semibold text-white hover:bg-brand-blue-dark'
        }
      >
        {t('common.save', { defaultValue: 'Save' })}
      </button>
      {canStart && (
        <button
          type="button"
          {...tourAttr('connections.editor.save-start')}
          onClick={() => save(true)}
          className="flex items-center gap-1.5 rounded-full bg-brand-blue-primary px-5 py-2 text-sm font-semibold text-white hover:bg-brand-blue-dark"
        >
          <Play className="h-4 w-4" aria-hidden="true" />
          {t('connections.editor.saveStart', {
            defaultValue: 'Save and start',
          })}
        </button>
      )}
    </div>
  );

  const rowHead = (text: string) => (
    <p className="text-xs font-bold uppercase tracking-wide text-brand-blue-primary">
      {text}
    </p>
  );

  const actionLine = (step: ConnectionStep, i: number) =>
    step.actions.map((a, k) => {
      const w = widgetsById.get(a.widgetId);
      if (!w) return null;
      const def = connectionDefFor(w.type);
      const name = names.get(w.id);
      return (
        <div
          key={`${a.widgetId}-${k}`}
          className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm"
        >
          <span className="font-semibold text-slate-800">{name}</span>
          {def && def.actions.length > 1 ? (
            <select
              value={a.action}
              {...tourAttr('connections.editor.step-action')}
              aria-label={t('connections.editor.actionFor', {
                name,
                defaultValue: 'What {{name}} does',
              })}
              onChange={(e) =>
                updateStep(i, {
                  ...step,
                  actions: step.actions.map((x, j) =>
                    j === k ? withDefaults(w, e.target.value) : x
                  ),
                })
              }
              className={actionSelectClass}
            >
              {def.actions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {actionLabel(w, opt.id)}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-slate-600">{actionLabel(w, a.action)}</span>
          )}
          <StepParamPicker
            widget={w}
            action={a.action}
            params={a.params}
            label={t('connections.editor.choiceFor', {
              name,
              defaultValue: 'Choice for {{name}}',
            })}
            onChange={(params) =>
              updateStep(i, {
                ...step,
                actions: step.actions.map((x, j) =>
                  j === k ? { ...x, params } : x
                ),
              })
            }
          />
          {step.actions.length > 1 && (
            <button
              type="button"
              {...tourAttr('connections.editor.remove-action')}
              aria-label={t('connections.editor.removeAction', {
                defaultValue: 'Remove from this step',
              })}
              onClick={() =>
                updateStep(i, {
                  ...step,
                  actions: step.actions.filter((_, j) => j !== k),
                })
              }
              className="relative touch-target-expand rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      );
    });

  const menuStep = rowMenu && seq ? seq.steps[rowMenu.i] : undefined;
  const alsoStep = alsoMenu && seq ? seq.steps[alsoMenu.i] : undefined;

  return (
    <Modal
      isOpen
      onClose={close}
      title={t('connections.editor.title', { defaultValue: 'Connection' })}
      maxWidth="max-w-xl"
      footer={footer}
      closeTourId="connections.editor.close"
    >
      <div className="flex flex-col gap-4 pb-2">
        {liveRun && (
          <div className="flex items-center gap-3 rounded-xl bg-brand-red-lighter/40 px-4 py-2.5 text-sm text-brand-red-dark">
            <span className="flex-1 font-medium">
              {t('connections.editor.running', {
                defaultValue: 'Running now. Saving changes stops it.',
              })}
            </span>
            <button
              type="button"
              {...tourAttr('connections.editor.stop')}
              onClick={stopRun}
              className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 font-semibold shadow-sm"
            >
              <Square className="h-3.5 w-3.5" aria-hidden="true" />
              {t('connections.editor.stop', { defaultValue: 'Stop' })}
            </button>
          </div>
        )}

        {seq && (
          <section className="flex flex-col">
            <ol className="flex flex-col divide-y divide-slate-100">
              {seq.steps.map((step, i) => (
                <li key={step.id} className="flex gap-3 py-3 first:pt-0">
                  <span
                    className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-500"
                    aria-label={t('connections.editor.stepNumber', {
                      n: i + 1,
                      defaultValue: 'Step {{n}}',
                    })}
                  >
                    {i + 1}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    {step.actions.length > 0 &&
                      rowHead(
                        headingText(
                          headingAfter(seq.steps[i - 1], board.widgets)
                        )
                      )}
                    {step.actions.length === 0 ? (
                      <label className="flex items-center gap-2 text-sm text-slate-700">
                        <Clock
                          className="h-4 w-4 text-slate-500"
                          aria-hidden="true"
                        />
                        <span className="font-semibold text-slate-800">
                          {t('connections.editor.pause', {
                            defaultValue: 'Pause',
                          })}
                        </span>
                        <input
                          type="number"
                          min={1}
                          max={MAX_WAIT_SECONDS}
                          value={step.waitSeconds ?? 5}
                          {...tourAttr('connections.editor.wait-seconds')}
                          onChange={(e) =>
                            updateStep(i, {
                              ...step,
                              waitSeconds: Math.min(
                                MAX_WAIT_SECONDS,
                                Math.max(1, Number(e.target.value) || 1)
                              ),
                            })
                          }
                          className="w-16 rounded-lg border border-slate-300 px-2 py-1"
                        />
                        {t('connections.editor.seconds', {
                          defaultValue: 'seconds',
                        })}
                      </label>
                    ) : (
                      actionLine(step, i)
                    )}
                    {step.actions.length > 0 && (
                      <button
                        type="button"
                        {...tourAttr('connections.editor.add-same-time')}
                        aria-haspopup="menu"
                        aria-expanded={alsoMenu?.i === i}
                        onClick={(e) =>
                          setAlsoMenu({
                            i,
                            at: e.currentTarget.getBoundingClientRect(),
                          })
                        }
                        className="relative touch-target-expand flex items-center gap-1 self-start rounded-md py-0.5 text-xs font-medium text-slate-500 hover:text-brand-blue-primary"
                      >
                        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                        {t('connections.editor.also', {
                          defaultValue: 'Also…',
                        })}
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    {...tourAttr('connections.editor.step-menu')}
                    aria-label={t('connections.editor.stepMenu', {
                      n: i + 1,
                      defaultValue: 'Step {{n}} options',
                    })}
                    aria-haspopup="menu"
                    aria-expanded={rowMenu?.i === i}
                    onClick={(e) =>
                      setRowMenu({
                        i,
                        at: e.currentTarget.getBoundingClientRect(),
                      })
                    }
                    className="relative touch-target-expand h-8 w-8 shrink-0 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  >
                    <MoreHorizontal
                      className="mx-auto h-5 w-5"
                      aria-hidden="true"
                    />
                  </button>
                </li>
              ))}
              <li className="flex gap-3 py-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                  <Repeat className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  {rowHead(
                    t('connections.editor.atTheEnd', {
                      defaultValue: 'At the end',
                    })
                  )}
                  <div className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
                    <select
                      value={seq.repeat}
                      {...tourAttr('connections.editor.repeat')}
                      aria-label={t('connections.editor.repeat', {
                        defaultValue: 'Repeat',
                      })}
                      onChange={(e) =>
                        setSeq({
                          ...seq,
                          repeat: e.target
                            .value as SequenceConnection['repeat'],
                        })
                      }
                      className={actionSelectClass}
                    >
                      <option value="until-done">{untilLabel}</option>
                      <option value="count">
                        {t('connections.editor.loopCount', {
                          defaultValue: 'Loop a set number of times',
                        })}
                      </option>
                      <option value="once">
                        {t('connections.editor.stopAtEnd', {
                          defaultValue: 'Stop',
                        })}
                      </option>
                    </select>
                    {seq.repeat === 'count' && (
                      <label className="flex items-center gap-2">
                        <input
                          type="number"
                          min={1}
                          max={MAX_REPEAT}
                          value={seq.repeatCount ?? 2}
                          {...tourAttr('connections.editor.repeat-count')}
                          onChange={(e) =>
                            setSeq({
                              ...seq,
                              repeatCount: Math.min(
                                MAX_REPEAT,
                                Math.max(1, Number(e.target.value) || 1)
                              ),
                            })
                          }
                          className="w-20 rounded-lg border border-slate-300 px-2 py-1"
                        />
                        {t('connections.editor.timesInAll', {
                          defaultValue: 'times in all',
                        })}
                      </label>
                    )}
                  </div>
                </div>
              </li>
            </ol>

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                {...tourAttr('connections.editor.add-widget')}
                onClick={addWidgets}
                className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                {t('connections.editor.addWidget', {
                  defaultValue: 'Add widget',
                })}
              </button>
              <button
                type="button"
                {...tourAttr('connections.editor.add-wait')}
                onClick={addPause}
                className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <Clock className="h-4 w-4" aria-hidden="true" />
                {t('connections.editor.addPause', {
                  defaultValue: 'Add a pause',
                })}
              </button>
            </div>
          </section>
        )}

        {follows.length > 0 && (
          <section className="flex flex-col gap-1.5 border-t border-slate-100 pt-3">
            {rowHead(
              t('connections.editor.wholeTime', {
                defaultValue: 'The whole time',
              })
            )}
            {follows.map((f) => (
              <div
                key={f.id}
                className="flex items-center gap-2 text-sm text-slate-700"
              >
                <span className="flex-1">{followText(f)}</span>
                <button
                  type="button"
                  {...tourAttr('connections.editor.remove-follow')}
                  aria-label={t('connections.editor.removeFollow', {
                    defaultValue: 'Remove',
                  })}
                  onClick={() =>
                    setConnections((cs) => cs.filter((c) => c.id !== f.id))
                  }
                  className="relative touch-target-expand rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            ))}
          </section>
        )}

        {!seq && follows.length === 0 && (
          <p className="text-sm text-slate-600">
            {t('connections.editor.empty', {
              defaultValue:
                'Nothing left in this connection. Save to remove it.',
            })}
          </p>
        )}
      </div>

      {rowMenu && seq && menuStep && (
        <PopMenu at={rowMenu.at} onClose={() => setRowMenu(null)} alignRight>
          <button
            type="button"
            role="menuitem"
            disabled={rowMenu.i === 0}
            {...tourAttr('connections.editor.move-up')}
            className={menuItem}
            onClick={() => {
              moveStep(rowMenu.i, -1);
              setRowMenu(null);
            }}
          >
            <ArrowUp className="h-4 w-4" aria-hidden="true" />
            {t('connections.editor.moveUp', { defaultValue: 'Move up' })}
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={rowMenu.i === seq.steps.length - 1}
            {...tourAttr('connections.editor.move-down')}
            className={menuItem}
            onClick={() => {
              moveStep(rowMenu.i, 1);
              setRowMenu(null);
            }}
          >
            <ArrowDown className="h-4 w-4" aria-hidden="true" />
            {t('connections.editor.moveDown', { defaultValue: 'Move down' })}
          </button>
          <button
            type="button"
            role="menuitem"
            {...tourAttr('connections.editor.remove-step')}
            className={`${menuItem} border-t border-slate-100 text-brand-red-primary`}
            onClick={() => {
              setSteps(seq.steps.filter((_, j) => j !== rowMenu.i));
              setRowMenu(null);
            }}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            {t('connections.editor.removeStep', { defaultValue: 'Remove' })}
          </button>
        </PopMenu>
      )}

      {alsoMenu && alsoStep && (
        <PopMenu at={alsoMenu.at} onClose={() => setAlsoMenu(null)}>
          {connectable
            .filter((w) => !alsoStep.actions.some((x) => x.widgetId === w.id))
            .map((w) => (
              <button
                key={w.id}
                type="button"
                role="menuitem"
                {...tourAttr('connections.editor.also-option')}
                className={menuItem}
                onClick={() => {
                  const action = connectionDefFor(w.type)?.defaultAction;
                  if (action) {
                    updateStep(alsoMenu.i, {
                      ...alsoStep,
                      actions: [...alsoStep.actions, withDefaults(w, action)],
                    });
                  }
                  setAlsoMenu(null);
                }}
              >
                {names.get(w.id)}
              </button>
            ))}
        </PopMenu>
      )}
    </Modal>
  );
};
