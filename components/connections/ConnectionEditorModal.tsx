import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowDown,
  ArrowUp,
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
  useConnectionsUi,
  type EditorDraft,
} from '@/context/connectionsUiStore';
import { connectionDefFor } from '@/config/widgetConnections';
import { TOOLS } from '@/config/tools';
import { Z_INDEX } from '@/config/zIndex';
import { isConnectionLive } from '@/utils/connectionEngine';
import { sendRunCommand } from '@/utils/connectionSignals';
import {
  advanceChoice,
  fromCards,
  loopRunsOut,
  sideJoinKind,
  stepWait,
  toCards,
  widgetNames,
  withAdvance,
  type AdvanceChoice,
  type EditorCard,
} from '@/utils/connectionEditorModel';
import { tourAttr } from '@/config/tourAnchors';
import { StepParamPicker } from './StepParamPicker';

const MAX_PAUSE_SECONDS = 600;
const MAX_REPEAT = 99;

const newId = () => crypto.randomUUID();

const control =
  'h-8 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-700 hover:border-slate-400';
const iconButton =
  'relative touch-target-expand flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600';
const menuItem =
  'flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent';

const toolFor = new Map(TOOLS.map((t) => [t.type, t]));

// An action on a widget with its step choice prefilled from what the widget shows now.
const withDefaults = (w: WidgetData, action: string): ConnectionAction => {
  const params = connectionDefFor(w.type)
    ?.actions.find((a) => a.id === action)
    ?.defaultParams?.(w.config as Record<string, unknown>);
  return { widgetId: w.id, action, ...(params && { params }) };
};

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
  const acting = steps.filter((s) => s.actions.length > 0);
  // One step still does something when it moves two widgets at once.
  const worthKeeping =
    acting.length >= 2 || (acting.length === 1 && acting[0].actions.length > 1);
  return worthKeeping && isConnectionLive(seq, widgets) ? seq : null;
};

// A small menu pinned to the button that opened it, above the modal.
const PopMenu: React.FC<{
  at: DOMRect;
  onClose: () => void;
  alignRight?: boolean;
  children: React.ReactNode;
}> = ({ at, onClose, alignRight, children }) => {
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
  const width = 208;
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
        className="fixed max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 text-sm text-slate-700 shadow-xl"
        style={{
          width,
          left: Math.max(
            8,
            Math.min(
              alignRight ? at.right - width : at.left,
              window.innerWidth - width - 8
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

const WidgetIcon: React.FC<{ widget: WidgetData }> = ({ widget }) => {
  const tool = toolFor.get(widget.type);
  const Icon = tool?.icon;
  return (
    <span
      aria-hidden="true"
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${tool?.color ?? 'bg-slate-400'}`}
    >
      {Icon && <Icon className="h-4 w-4 text-white" />}
    </span>
  );
};

export const ConnectionEditorModal: React.FC<{
  draft: EditorDraft;
  board: Dashboard;
}> = ({ draft, board }) => {
  const { t } = useTranslation();
  const { updateDashboard } = useDashboard();
  const initialSeq = draft.connections.find(
    (c): c is SequenceConnection => c.kind === 'sequence'
  );
  const [seq, setSeq] = useState(initialSeq);
  const [cards, setCards] = useState<EditorCard[]>(() =>
    toCards(initialSeq?.steps ?? [])
  );
  const [follows, setFollows] = useState(() =>
    draft.connections.filter((c): c is FollowConnection => c.kind === 'follow')
  );
  const [menu, setMenu] = useState<{
    kind: 'step' | 'add';
    i: number;
    at: DOMRect;
  } | null>(null);
  const litWidgetId = useConnectionsUi((s) => s.highlightedWidgetId);

  const names = useMemo(
    () =>
      widgetNames(board.widgets, (time) =>
        t('connections.editor.timerName', {
          time,
          defaultValue: 'Timer {{time}}',
        })
      ),
    [board.widgets, t]
  );
  const widgetsById = useMemo(
    () => new Map(board.widgets.map((w) => [w.id, w])),
    [board.widgets]
  );
  const liveRun = board.connections?.find(
    (c) => c.kind === 'sequence' && draft.replaces.includes(c.id) && c.run
  );

  const light = (widgetId: string | undefined) =>
    connectionsUi.set({ highlightedWidgetId: widgetId ?? null });
  const close = () =>
    connectionsUi.set({ editor: null, highlightedWidgetId: null });

  const current = (): WidgetConnection[] => [
    ...(seq ? [{ ...seq, steps: fromCards(cards, newId) }] : []),
    ...follows,
  ];

  const setCard = (i: number, card: EditorCard) =>
    setCards((cs) => cs.map((c, j) => (j === i ? card : c)));
  const setActions = (i: number, actions: ConnectionAction[]) =>
    setCard(i, { ...cards[i], step: { ...cards[i].step, actions } });
  const moveCard = (i: number, by: -1 | 1) =>
    setCards((cs) => {
      const next = [...cs];
      const [c] = next.splice(i, 1);
      next.splice(i + by, 0, c);
      return next;
    });

  const mainOf = (card: EditorCard) =>
    widgetsById.get(card.step.actions[0]?.widgetId ?? '');
  // A Follow shows beside the first card its leader starts.
  const followCard = (f: FollowConnection) =>
    cards.findIndex((c) => c.step.actions[0]?.widgetId === f.leaderId);
  const looseFollows = follows.filter((f) => followCard(f) === -1);

  const addSide = (i: number, w: WidgetData) => {
    const main = mainOf(cards[i]);
    const kind = sideJoinKind(w, main?.type);
    if (kind === 'follow' && main) {
      setFollows((fs) => [
        ...fs.filter((f) => f.followerId !== w.id),
        { id: newId(), kind: 'follow', leaderId: main.id, followerId: w.id },
      ]);
    } else if (kind === 'action') {
      const action = connectionDefFor(w.type)?.defaultAction;
      if (action) {
        setActions(i, [...cards[i].step.actions, withDefaults(w, action)]);
      }
    }
  };

  const save = (start: boolean) => {
    const kept = (board.connections ?? []).filter(
      (c) => !draft.replaces.includes(c.id)
    );
    const cleaned = current().flatMap((c) => {
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

  const finishLabel = (card: EditorCard) => {
    const wait = stepWait(card.step, board.widgets);
    if (!wait) {
      return t('connections.editor.advanceNow', {
        defaultValue: 'Right away',
      });
    }
    if (wait.kind === 'next-block') {
      return t('connections.editor.advanceNextBlock', {
        defaultValue: 'When the next block starts',
      });
    }
    const list = wait.widgetIds.map((id) => names.get(id) ?? '').join(' and ');
    return wait.widgetIds.length > 1
      ? t('connections.editor.advanceEndMany', {
          names: list,
          defaultValue: 'When {{names}} end',
        })
      : t('connections.editor.advanceEnds', {
          names: list,
          defaultValue: 'When {{names}} ends',
        });
  };

  const runsOut = loopRunsOut(
    { steps: fromCards(cards, newId) },
    board.widgets
  );
  const untilLabel =
    runsOut === 'names'
      ? t('connections.editor.repeatUntilNames', {
          defaultValue: 'Repeat until every name is picked',
        })
      : runsOut === 'items'
        ? t('connections.editor.repeatUntilItems', {
            defaultValue: 'Repeat until every item is checked',
          })
        : t('connections.editor.repeatUntilStop', {
            defaultValue: 'Repeat until I press Stop',
          });

  const savedSeq = seq
    ? cleanForSave({ ...seq, steps: fromCards(cards, newId) }, board.widgets)
    : null;

  // One widget's line: icon, name, what it does, and its own choice if it takes one.
  const actionLine = (
    w: WidgetData,
    a: ConnectionAction,
    onChange: (next: ConnectionAction) => void
  ) => {
    const def = connectionDefFor(w.type);
    const name = names.get(w.id);
    return (
      <>
        <WidgetIcon widget={w} />
        <span className="whitespace-nowrap font-semibold text-slate-800">
          {name}
        </span>
        {def && def.actions.length > 1 ? (
          <select
            value={a.action}
            {...tourAttr('connections.editor.step-action')}
            aria-label={t('connections.editor.actionFor', {
              name,
              defaultValue: 'What {{name}} does',
            })}
            onChange={(e) => onChange(withDefaults(w, e.target.value))}
            className={control}
          >
            {def.actions.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {actionLabel(w, opt.id)}
              </option>
            ))}
          </select>
        ) : (
          <span className="whitespace-nowrap text-sm text-slate-600">
            {actionLabel(w, a.action)}
          </span>
        )}
        <StepParamPicker
          widget={w}
          action={a.action}
          params={a.params}
          label={t('connections.editor.choiceFor', {
            name,
            defaultValue: 'Choice for {{name}}',
          })}
          onChange={(params) => onChange({ ...a, params })}
        />
      </>
    );
  };

  const sideCard = (
    key: string,
    widgetId: string,
    content: React.ReactNode,
    onRemove: () => void,
    removeTour: ReturnType<typeof tourAttr>
  ) => (
    <div key={key} className="flex items-center gap-2">
      <span
        aria-hidden="true"
        className="w-4 shrink-0 text-center text-base font-bold text-slate-400"
      >
        +
      </span>
      <div
        onPointerDown={() => light(widgetId)}
        className={`flex min-h-14 items-center gap-2.5 rounded-xl border bg-white px-3 py-2.5 ${
          litWidgetId === widgetId
            ? 'border-brand-blue-primary ring-2 ring-brand-blue-primary/20'
            : 'border-slate-200'
        }`}
      >
        {content}
        <button
          type="button"
          {...removeTour}
          aria-label={t('connections.editor.removeAction', {
            defaultValue: 'Remove',
          })}
          onClick={onRemove}
          className={iconButton}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );

  const addSideButton = (i: number) => (
    <button
      type="button"
      {...tourAttr('connections.editor.add-same-time')}
      aria-label={t('connections.editor.addSide', {
        defaultValue: 'Add something at the same time',
      })}
      title={t('connections.editor.addSide', {
        defaultValue: 'Add something at the same time',
      })}
      aria-haspopup="menu"
      aria-expanded={menu?.kind === 'add' && menu.i === i}
      onClick={(e) =>
        setMenu({ kind: 'add', i, at: e.currentTarget.getBoundingClientRect() })
      }
      className="relative touch-target-expand flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-dashed border-slate-300 text-slate-500 hover:border-brand-blue-primary hover:text-brand-blue-primary"
    >
      <Plus className="h-4 w-4" aria-hidden="true" />
    </button>
  );

  const arrow = (card: EditorCard, i: number) => {
    const choice = advanceChoice(card);
    const waits = !!stepWait(card.step, board.widgets);
    return (
      <div className="flex h-11 items-center gap-2 pl-[1.1rem] text-xs font-semibold text-slate-500">
        <ArrowDown className="h-4 w-4 shrink-0" aria-hidden="true" />
        <select
          value={choice}
          {...tourAttr('connections.editor.advance')}
          aria-label={t('connections.editor.advanceFor', {
            n: i + 1,
            defaultValue: 'What moves on from step {{n}}',
          })}
          onChange={(e) =>
            setCard(i, withAdvance(card, e.target.value as AdvanceChoice))
          }
          className="h-7 rounded-md border border-slate-200 bg-white px-1.5 text-xs font-semibold text-slate-600 hover:border-slate-300"
        >
          <option value="finish">{finishLabel(card)}</option>
          {waits && (
            <option value="now">
              {t('connections.editor.advanceNow', {
                defaultValue: 'Right away',
              })}
            </option>
          )}
          <option value="next">
            {t('connections.editor.advanceNext', {
              defaultValue: 'When I press Next',
            })}
          </option>
          <option value="pause">
            {t('connections.editor.advancePause', {
              defaultValue: 'After a few seconds',
            })}
          </option>
        </select>
        {choice === 'pause' && (
          <label className="flex items-center gap-1.5">
            <input
              type="number"
              min={1}
              max={MAX_PAUSE_SECONDS}
              value={card.pauseSeconds ?? 10}
              {...tourAttr('connections.editor.wait-seconds')}
              onChange={(e) =>
                setCard(i, {
                  ...card,
                  pauseSeconds: Math.min(
                    MAX_PAUSE_SECONDS,
                    Math.max(1, Number(e.target.value) || 1)
                  ),
                })
              }
              className="h-7 w-16 rounded-md border border-slate-200 bg-white px-1.5 text-xs text-slate-700"
            />
            {t('connections.editor.seconds', { defaultValue: 'seconds' })}
          </label>
        )}
      </div>
    );
  };

  const followSide = (f: FollowConnection) => {
    const w = widgetsById.get(f.followerId);
    if (!w) return null;
    return sideCard(
      f.id,
      w.id,
      <>
        <WidgetIcon widget={w} />
        <span className="whitespace-nowrap font-semibold text-slate-800">
          {names.get(w.id)}
        </span>
        <span className="whitespace-nowrap text-sm text-slate-600">
          {t(`connections.followAction.${w.type}`, {
            defaultValue: 'Follow',
          })}
        </span>
      </>,
      () => setFollows((fs) => fs.filter((x) => x.id !== f.id)),
      tourAttr('connections.editor.remove-follow')
    );
  };

  const stepCardClass = (widgetId: string | undefined) =>
    `flex min-h-14 w-full items-center gap-2.5 rounded-xl border bg-white px-3 py-2.5 sm:w-[22rem] sm:shrink-0 ${
      widgetId && litWidgetId === widgetId
        ? 'border-brand-blue-primary ring-2 ring-brand-blue-primary/20'
        : 'border-slate-200'
    }`;

  const numberBadge = (n: number) => (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-blue-primary text-xs font-bold text-white">
      {n}
    </span>
  );

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
          savedSeq
            ? 'rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50'
            : 'rounded-full bg-brand-blue-primary px-5 py-2 text-sm font-semibold text-white hover:bg-brand-blue-dark'
        }
      >
        {t('common.save', { defaultValue: 'Save' })}
      </button>
      {savedSeq && (
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

  const menuCard = menu ? cards[menu.i] : undefined;
  const menuMain = menuCard ? mainOf(menuCard) : undefined;
  const addOptions =
    menu?.kind === 'add' && menuCard
      ? board.widgets.filter((w) => {
          if (menuCard.step.actions.some((a) => a.widgetId === w.id)) {
            return false;
          }
          if (
            follows.some(
              (f) => f.followerId === w.id && f.leaderId === menuMain?.id
            )
          ) {
            return false;
          }
          return sideJoinKind(w, menuMain?.type) !== null;
        })
      : [];

  return (
    <Modal
      isOpen
      onClose={close}
      title={t('connections.editor.title', { defaultValue: 'Connection' })}
      maxWidth="max-w-3xl"
      footer={footer}
      closeTourId="connections.editor.close"
    >
      <div className="flex flex-col gap-3 pb-2">
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

        {cards.length > 0 && (
          <ol className="flex flex-col">
            {cards.map((card, i) => {
              const main = mainOf(card);
              const [first, ...rest] = card.step.actions;
              const sideFollows = follows.filter((f) => followCard(f) === i);
              return (
                <li key={card.step.id} className="flex flex-col">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                    <div
                      onPointerDown={() => light(main?.id)}
                      className={stepCardClass(main?.id)}
                    >
                      {numberBadge(i + 1)}
                      {main && first ? (
                        actionLine(main, first, (next) =>
                          setActions(i, [next, ...rest])
                        )
                      ) : (
                        <span className="text-sm text-slate-500">
                          {t('connections.editor.empty', {
                            defaultValue: 'Nothing here',
                          })}
                        </span>
                      )}
                      <span className="flex-1" />
                      <button
                        type="button"
                        {...tourAttr('connections.editor.step-menu')}
                        aria-label={t('connections.editor.stepMenu', {
                          n: i + 1,
                          defaultValue: 'Step {{n}} options',
                        })}
                        aria-haspopup="menu"
                        aria-expanded={menu?.kind === 'step' && menu.i === i}
                        onClick={(e) =>
                          setMenu({
                            kind: 'step',
                            i,
                            at: e.currentTarget.getBoundingClientRect(),
                          })
                        }
                        className={iconButton}
                      >
                        <MoreHorizontal
                          className="h-5 w-5"
                          aria-hidden="true"
                        />
                      </button>
                    </div>
                    <div className="flex flex-col gap-2">
                      {(() => {
                        const sides = [
                          ...rest.flatMap((a, k) => {
                            const w = widgetsById.get(a.widgetId);
                            if (!w) return [];
                            return [
                              sideCard(
                                `${a.widgetId}-${k}`,
                                w.id,
                                actionLine(w, a, (next) =>
                                  setActions(
                                    i,
                                    card.step.actions.map((x, j) =>
                                      j === k + 1 ? next : x
                                    )
                                  )
                                ),
                                () =>
                                  setActions(
                                    i,
                                    card.step.actions.filter(
                                      (_, j) => j !== k + 1
                                    )
                                  ),
                                tourAttr('connections.editor.remove-action')
                              ),
                            ];
                          }),
                          ...sideFollows.map(followSide).filter(Boolean),
                        ];
                        if (sides.length === 0) {
                          return (
                            <div className="flex min-h-14 items-center">
                              {addSideButton(i)}
                            </div>
                          );
                        }
                        // The "+" sits at the end of the last side card's row.
                        return sides.map((side, k) => (
                          <div key={k} className="flex items-center gap-2">
                            {side}
                            {k === sides.length - 1 && addSideButton(i)}
                          </div>
                        ));
                      })()}
                    </div>
                  </div>
                  {arrow(card, i)}
                </li>
              );
            })}
          </ol>
        )}

        {looseFollows.map((f) => {
          const leader = widgetsById.get(f.leaderId);
          if (!leader) return null;
          return (
            <div
              key={`loose-${f.id}`}
              className="flex flex-col gap-2 sm:flex-row sm:items-center"
            >
              <div
                onPointerDown={() => light(leader.id)}
                className={stepCardClass(leader.id)}
              >
                <WidgetIcon widget={leader} />
                <span className="whitespace-nowrap font-semibold text-slate-800">
                  {names.get(leader.id)}
                </span>
              </div>
              {followSide(f)}
            </div>
          );
        })}

        {seq && cards.length > 0 && (
          <div className="flex min-h-14 flex-wrap items-center gap-2.5 rounded-xl bg-slate-50 px-3 py-2.5">
            <Repeat
              className="ml-1 h-4 w-4 shrink-0 text-slate-500"
              aria-hidden="true"
            />
            <select
              value={seq.repeat}
              {...tourAttr('connections.editor.repeat')}
              aria-label={t('connections.editor.repeat', {
                defaultValue: 'Repeat',
              })}
              onChange={(e) =>
                setSeq({
                  ...seq,
                  repeat: e.target.value as SequenceConnection['repeat'],
                })
              }
              className={control}
            >
              <option value="until-done">{untilLabel}</option>
              <option value="count">
                {t('connections.editor.repeatCount', {
                  defaultValue: 'Repeat a set number of times',
                })}
              </option>
              <option value="once">
                {t('connections.editor.repeatOnce', {
                  defaultValue: "Don't repeat",
                })}
              </option>
            </select>
            {seq.repeat === 'count' && (
              <label className="flex items-center gap-2 text-sm text-slate-700">
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
                  className={`${control} w-16`}
                />
                {t('connections.editor.times', { defaultValue: 'times' })}
              </label>
            )}
          </div>
        )}

        <div>
          <button
            type="button"
            {...tourAttr('connections.editor.add-widget')}
            onClick={() => {
              light(undefined);
              startConnectMode(board.id, null, {
                ...draft,
                connections: current(),
              });
            }}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t('connections.editor.addStep', { defaultValue: 'Add a step' })}
          </button>
        </div>
      </div>

      {menu?.kind === 'step' && menuCard && (
        <PopMenu at={menu.at} onClose={() => setMenu(null)} alignRight>
          <button
            type="button"
            role="menuitem"
            disabled={menu.i === 0}
            {...tourAttr('connections.editor.move-up')}
            className={menuItem}
            onClick={() => {
              moveCard(menu.i, -1);
              setMenu(null);
            }}
          >
            <ArrowUp className="h-4 w-4" aria-hidden="true" />
            {t('connections.editor.moveUp', { defaultValue: 'Move up' })}
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={menu.i === cards.length - 1}
            {...tourAttr('connections.editor.move-down')}
            className={menuItem}
            onClick={() => {
              moveCard(menu.i, 1);
              setMenu(null);
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
              setCards((cs) => cs.filter((_, j) => j !== menu.i));
              setMenu(null);
            }}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            {t('connections.editor.removeStep', { defaultValue: 'Remove' })}
          </button>
        </PopMenu>
      )}

      {menu?.kind === 'add' && (
        <PopMenu at={menu.at} onClose={() => setMenu(null)}>
          {addOptions.map((w) => (
            <button
              key={w.id}
              type="button"
              role="menuitem"
              {...tourAttr('connections.editor.also-option')}
              className={menuItem}
              onClick={() => {
                addSide(menu.i, w);
                setMenu(null);
              }}
            >
              <WidgetIcon widget={w} />
              {names.get(w.id)}
            </button>
          ))}
        </PopMenu>
      )}
    </Modal>
  );
};
