import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowDown,
  ArrowUp,
  Clock,
  Plus,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import type {
  ConnectionAction,
  ConnectionStep,
  Dashboard,
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
import { isConnectionLive } from '@/utils/connectionEngine';
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

export const ConnectionEditorModal: React.FC<{
  draft: EditorDraft;
  board: Dashboard;
}> = ({ draft, board }) => {
  const { t } = useTranslation();
  const { updateDashboard } = useDashboard();
  const [connections, setConnections] = useState(draft.connections);
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
  const follows = connections.filter((c) => c.kind === 'follow');
  const liveRun = board.connections?.find(
    (c) => c.kind === 'sequence' && draft.replaces.includes(c.id) && c.run
  );

  const close = () => connectionsUi.set({ editor: null });

  const setSeq = (next: SequenceConnection) =>
    setConnections((cs) => cs.map((c) => (c.id === next.id ? next : c)));
  const setSteps = (steps: ConnectionStep[]) => {
    if (seq) setSeq({ ...seq, steps });
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

  const addWait = () => {
    if (!seq) return;
    setSteps([...seq.steps, { id: newStepId(), actions: [], waitSeconds: 5 }]);
  };

  const addWidgets = () =>
    startConnectMode(board.id, null, { ...draft, connections });

  const save = () => {
    const kept = (board.connections ?? []).filter(
      (c) => !draft.replaces.includes(c.id)
    );
    const cleaned = connections.flatMap((c) => {
      const next = cleanForSave(c, board.widgets);
      return next ? [next] : [];
    });
    updateDashboard({ connections: [...kept, ...cleaned] });
    close();
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

  const footer = (
    <div className="flex items-center gap-2 w-full">
      {draft.replaces.length > 0 && (
        <button
          type="button"
          {...tourAttr('connections.editor.delete')}
          onClick={remove}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-brand-red-primary hover:bg-brand-red-lighter/40 rounded-lg"
        >
          <Trash2 className="w-4 h-4" aria-hidden="true" />
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
        className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800"
      >
        {t('common.cancel')}
      </button>
      <button
        type="button"
        {...tourAttr('connections.editor.save')}
        onClick={save}
        className="px-5 py-2 text-sm font-semibold rounded-full bg-brand-blue-primary text-white hover:bg-brand-blue-dark"
      >
        {t('common.save', { defaultValue: 'Save' })}
      </button>
    </div>
  );

  return (
    <Modal
      isOpen
      onClose={close}
      title={t('connections.editor.title', { defaultValue: 'Connection' })}
      maxWidth="max-w-xl"
      footer={footer}
      closeTourId="connections.editor.close"
    >
      <div className="flex flex-col gap-5 pb-2">
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
              <Square className="w-3.5 h-3.5" aria-hidden="true" />
              {t('connections.editor.stop', { defaultValue: 'Stop' })}
            </button>
          </div>
        )}

        {seq && (
          <section className="flex flex-col gap-2">
            <ol className="flex flex-col gap-2">
              {seq.steps.map((step, i) => (
                <li
                  key={step.id}
                  className="flex gap-3 rounded-xl border border-slate-200 bg-white p-3"
                >
                  <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-blue-primary text-sm font-bold text-white">
                    {i + 1}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    {step.actions.length === 0 ? (
                      <label className="flex items-center gap-2 text-sm text-slate-700">
                        <Clock
                          className="w-4 h-4 text-slate-500"
                          aria-hidden="true"
                        />
                        {t('connections.editor.wait', { defaultValue: 'Wait' })}
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
                          className="w-20 rounded-lg border border-slate-300 px-2 py-1"
                        />
                        {t('connections.editor.seconds', {
                          defaultValue: 'seconds',
                        })}
                      </label>
                    ) : (
                      step.actions.map((a, k) => {
                        const w = widgetsById.get(a.widgetId);
                        if (!w) return null;
                        const def = connectionDefFor(w.type);
                        return (
                          <div
                            key={`${a.widgetId}-${k}`}
                            className="flex items-center gap-2 text-sm"
                          >
                            <span className="min-w-0 flex-1 truncate font-semibold text-slate-800">
                              {names.get(w.id)}
                            </span>
                            <select
                              value={a.action}
                              {...tourAttr('connections.editor.step-action')}
                              aria-label={t('connections.editor.actionFor', {
                                name: names.get(w.id),
                                defaultValue: 'What {{name}} does',
                              })}
                              onChange={(e) =>
                                updateStep(i, {
                                  ...step,
                                  actions: step.actions.map((x, j) =>
                                    j === k
                                      ? withDefaults(w, e.target.value)
                                      : x
                                  ),
                                })
                              }
                              className="rounded-lg border border-slate-300 px-2 py-1"
                            >
                              {def?.actions.map((opt) => (
                                <option key={opt.id} value={opt.id}>
                                  {actionLabel(w, opt.id)}
                                </option>
                              ))}
                            </select>
                            <StepParamPicker
                              widget={w}
                              action={a.action}
                              params={a.params}
                              label={t('connections.editor.choiceFor', {
                                name: names.get(w.id),
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
                                {...tourAttr(
                                  'connections.editor.remove-action'
                                )}
                                aria-label={t(
                                  'connections.editor.removeAction',
                                  {
                                    defaultValue: 'Remove from this step',
                                  }
                                )}
                                onClick={() =>
                                  updateStep(i, {
                                    ...step,
                                    actions: step.actions.filter(
                                      (_, j) => j !== k
                                    ),
                                  })
                                }
                                className="relative touch-target-expand rounded p-1 text-slate-500 hover:bg-slate-100"
                              >
                                <X className="w-4 h-4" aria-hidden="true" />
                              </button>
                            )}
                          </div>
                        );
                      })
                    )}
                    {step.actions.length > 0 && (
                      <select
                        value=""
                        {...tourAttr('connections.editor.add-same-time')}
                        aria-label={t('connections.editor.sameTime', {
                          defaultValue: 'At the same time',
                        })}
                        onChange={(e) => {
                          const w = widgetsById.get(e.target.value);
                          const action =
                            w && connectionDefFor(w.type)?.defaultAction;
                          if (!w || !action) return;
                          updateStep(i, {
                            ...step,
                            actions: [...step.actions, withDefaults(w, action)],
                          });
                        }}
                        className="self-start rounded-lg border border-dashed border-slate-300 bg-transparent px-2 py-1 text-xs text-slate-600"
                      >
                        <option value="">
                          {t('connections.editor.sameTime', {
                            defaultValue: 'At the same time',
                          })}
                        </option>
                        {connectable
                          .filter(
                            (w) =>
                              !step.actions.some((x) => x.widgetId === w.id)
                          )
                          .map((w) => (
                            <option key={w.id} value={w.id}>
                              {names.get(w.id)}
                            </option>
                          ))}
                      </select>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-center gap-0.5">
                    <button
                      type="button"
                      disabled={i === 0}
                      {...tourAttr('connections.editor.move-up')}
                      aria-label={t('connections.editor.moveUp', {
                        defaultValue: 'Move step up',
                      })}
                      onClick={() => moveStep(i, -1)}
                      className="relative touch-target-expand rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                    >
                      <ArrowUp className="w-4 h-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      disabled={i === seq.steps.length - 1}
                      {...tourAttr('connections.editor.move-down')}
                      aria-label={t('connections.editor.moveDown', {
                        defaultValue: 'Move step down',
                      })}
                      onClick={() => moveStep(i, 1)}
                      className="relative touch-target-expand rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                    >
                      <ArrowDown className="w-4 h-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      {...tourAttr('connections.editor.remove-step')}
                      aria-label={t('connections.editor.removeStep', {
                        defaultValue: 'Remove step',
                      })}
                      onClick={() =>
                        setSteps(seq.steps.filter((_, j) => j !== i))
                      }
                      className="relative touch-target-expand rounded p-1 text-slate-500 hover:bg-slate-100"
                    >
                      <Trash2 className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>
                </li>
              ))}
            </ol>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                {...tourAttr('connections.editor.add-widget')}
                onClick={addWidgets}
                className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                {t('connections.editor.addWidget', {
                  defaultValue: 'Add widget',
                })}
              </button>
              <button
                type="button"
                {...tourAttr('connections.editor.add-wait')}
                onClick={addWait}
                className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <Clock className="w-4 h-4" aria-hidden="true" />
                {t('connections.editor.addWait', { defaultValue: 'Add wait' })}
              </button>
            </div>

            <label className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-700">
              <span className="font-semibold">
                {t('connections.editor.repeat', { defaultValue: 'Repeat' })}
              </span>
              <select
                value={seq.repeat}
                {...tourAttr('connections.editor.repeat')}
                onChange={(e) =>
                  setSeq({
                    ...seq,
                    repeat: e.target.value as SequenceConnection['repeat'],
                  })
                }
                className="rounded-lg border border-slate-300 px-2 py-1"
              >
                <option value="until-done">
                  {t('connections.editor.repeatUntilDone', {
                    defaultValue: 'Until a step has nothing left to do',
                  })}
                </option>
                <option value="once">
                  {t('connections.editor.repeatOnce', {
                    defaultValue: "Don't repeat",
                  })}
                </option>
                <option value="count">
                  {t('connections.editor.repeatCount', {
                    defaultValue: 'A set number of times',
                  })}
                </option>
              </select>
              {seq.repeat === 'count' && (
                <input
                  type="number"
                  min={1}
                  max={MAX_REPEAT}
                  value={seq.repeatCount ?? 2}
                  {...tourAttr('connections.editor.repeat-count')}
                  aria-label={t('connections.editor.timesLabel', {
                    defaultValue: 'Times',
                  })}
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
              )}
            </label>
          </section>
        )}

        {follows.length > 0 && (
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-slate-800">
              {t('connections.editor.follows', { defaultValue: 'Follows' })}
            </h3>
            {follows.map((f) => {
              if (f.kind !== 'follow') return null;
              return (
                <div
                  key={f.id}
                  className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                >
                  <span className="flex-1">
                    {t('connections.editor.followsLine', {
                      follower: names.get(f.followerId) ?? '',
                      leader: names.get(f.leaderId) ?? '',
                      defaultValue: '{{follower}} follows {{leader}}',
                    })}
                  </span>
                  <button
                    type="button"
                    {...tourAttr('connections.editor.remove-follow')}
                    aria-label={t('connections.editor.removeFollow', {
                      defaultValue: 'Remove',
                    })}
                    onClick={() =>
                      setConnections((cs) => cs.filter((c) => c.id !== f.id))
                    }
                    className="relative touch-target-expand rounded p-1 text-slate-500 hover:bg-slate-100"
                  >
                    <X className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              );
            })}
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
    </Modal>
  );
};
