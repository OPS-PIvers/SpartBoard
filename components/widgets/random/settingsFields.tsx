import React from 'react';
import { Lock } from 'lucide-react';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import { useDashboard } from '@/context/useDashboard';
import { useDialog } from '@/context/useDialog';
import type { RandomConfig, RandomGroup, StationsConfig } from '@/types';
import {
  buildStationsFromRandomGroups,
  shouldResolveRosterNames,
} from '@/components/widgets/Stations/nexus';
import { getLocalIsoDate } from '@/utils/localDate';
import { countRosterGroupMembers } from '@/utils/rosterGroups';
import { useRosterGroupsIntegrationSettings } from '@/hooks/useRosterGroupsIntegrationSettings';

function useStudentCount(config: RandomConfig): number {
  const { rosters, activeRosterId } = useDashboard();
  const activeRoster = rosters.find((roster) => roster.id === activeRosterId);
  if ((config.rosterMode ?? 'class') === 'class' && activeRoster) {
    const absent =
      activeRoster.absent?.date === getLocalIsoDate()
        ? activeRoster.absent.studentIds.length
        : 0;
    return Math.max(0, activeRoster.students.length - absent);
  }
  const firstNames = (config.firstNames ?? '')
    .split('\n')
    .filter((name) => name.trim()).length;
  const lastNames = (config.lastNames ?? '')
    .split('\n')
    .filter((name) => name.trim()).length;
  return Math.max(firstNames, lastNames);
}

export const RandomGroupCountField: React.FC<{
  ctx: CustomRenderCtx;
  kind: 'home' | 'expert';
}> = ({ ctx, kind }) => {
  const config = ctx.config as unknown as RandomConfig;
  const count = useStudentCount(config);
  const groupSize = config.groupSize ?? 4;
  const estimatedHome = Math.max(2, Math.ceil(count / Math.max(1, groupSize)));
  const home = Math.max(2, config.numHomeGroups ?? estimatedHome);
  const value =
    kind === 'home'
      ? home
      : (config.numExpertGroups ?? Math.max(2, Math.ceil(home / 2)));
  const key = kind === 'home' ? 'numHomeGroups' : 'numExpertGroups';

  return (
    <div
      id={ctx.id}
      role="group"
      aria-labelledby={ctx.labelId}
      aria-describedby={ctx.describedBy}
      className="flex items-center gap-3"
    >
      <input
        type="range"
        min={2}
        max={20}
        step={1}
        value={value}
        aria-labelledby={ctx.labelId}
        onChange={(event) =>
          ctx.updateConfig({ [key]: event.target.valueAsNumber })
        }
        className="w-full accent-brand-blue-primary"
      />
      <span className="w-8 text-right text-xs text-slate-600">{value}</span>
    </div>
  );
};

export const RandomRosterActionsField: React.FC<{
  ctx: CustomRenderCtx;
}> = ({ ctx }) => {
  const { activeRosterId, rosters } = useDashboard();
  const { showConfirm } = useDialog();
  const activeRoster = rosters.find((roster) => roster.id === activeRosterId);

  const importRoster = () => {
    if (!activeRoster) return;
    ctx.updateConfig({
      firstNames: activeRoster.students
        .map((student) =>
          [student.firstName, student.lastName].filter(Boolean).join(' ')
        )
        .join('\n'),
      lastNames: '',
      lastResult: null,
      remainingStudents: [],
    });
  };

  const clearNames = async () => {
    const confirmed = await showConfirm(
      ctx.t('widgetSettings.random.clearNamesConfirm'),
      {
        title: ctx.t('widgetSettings.random.clearNamesTitle'),
        confirmLabel: ctx.t('widgetSettings.random.clear'),
        variant: 'danger',
      }
    );
    if (confirmed) {
      ctx.updateConfig({
        firstNames: '',
        lastNames: '',
        lastResult: null,
        remainingStudents: [],
      });
    }
  };

  return (
    <div
      id={ctx.id}
      role="group"
      aria-labelledby={ctx.labelId}
      aria-describedby={ctx.describedBy}
      className="grid grid-cols-2 gap-2"
    >
      <button
        type="button"
        disabled={!activeRoster}
        onClick={importRoster}
        className="rounded-lg bg-brand-blue-primary px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
      >
        {ctx.t('widgetSettings.random.importClass')}
      </button>
      <button
        type="button"
        onClick={() => void clearNames()}
        className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50"
      >
        {ctx.t('widgetSettings.random.clearNames')}
      </button>
    </div>
  );
};

function resultGroups(result: RandomConfig['lastResult']): RandomGroup[] {
  if (!Array.isArray(result) || result.length === 0) return [];
  const first = result[0];
  if (typeof first === 'object' && first !== null && 'names' in first) {
    return result as RandomGroup[];
  }
  if (Array.isArray(first)) {
    return (result as unknown as string[][]).map((names, index) => ({
      id: `Group ${index + 1}`,
      names: names ?? [],
    }));
  }
  return [];
}

export const RandomSendToStationsField: React.FC<{
  ctx: CustomRenderCtx;
}> = ({ ctx }) => {
  const { activeDashboard, activeRosterId, addToast, rosters, updateWidget } =
    useDashboard();
  const { showConfirm } = useDialog();
  const stationsWidget = activeDashboard?.widgets.find(
    (widget) => widget.type === 'stations'
  );

  const send = async () => {
    if (!stationsWidget) {
      addToast(ctx.t('widgetSettings.random.addStations'), 'info');
      return;
    }
    const config = ctx.config as unknown as RandomConfig;
    const groups = resultGroups(config.lastResult);
    if (groups.length === 0) {
      addToast(ctx.t('widgetSettings.random.generateGroupsFirst'), 'info');
      return;
    }
    const stationsConfig = stationsWidget.config as StationsConfig;
    const existing = stationsConfig.stations ?? [];
    if (
      existing.length > 0 &&
      !(await showConfirm(
        ctx.t('widgetSettings.random.replaceStationsConfirm', {
          count: existing.length,
        }),
        {
          title: ctx.t('widgetSettings.random.replaceStationsTitle'),
          confirmLabel: ctx.t('widgetSettings.random.replace'),
          variant: 'danger',
        }
      ))
    ) {
      return;
    }

    let rosterNameToId: Map<string, string> | undefined;
    if (
      shouldResolveRosterNames(config.rosterMode, stationsConfig.rosterMode)
    ) {
      const roster = rosters.find(
        (candidate) => candidate.id === activeRosterId
      );
      if (roster) {
        rosterNameToId = new Map(
          roster.students.map((student) => [
            `${student.firstName} ${student.lastName}`.trim(),
            student.id,
          ])
        );
      }
    }
    const next = buildStationsFromRandomGroups(
      groups,
      activeDashboard?.sharedGroups,
      rosterNameToId
    );
    updateWidget(stationsWidget.id, {
      config: { ...stationsConfig, ...next },
    });
    addToast(
      ctx.t('widgetSettings.random.groupsSent', { count: groups.length }),
      'success'
    );
  };

  return (
    <button
      id={ctx.id}
      type="button"
      aria-labelledby={ctx.labelId}
      aria-describedby={ctx.describedBy}
      disabled={!stationsWidget}
      onClick={() => void send()}
      className="w-full rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-40"
    >
      {ctx.t('widgetSettings.random.sendToStations')}
    </button>
  );
};

/**
 * "Keep these groups together" — the Lock role
 * (docs/plans/ROSTER_GROUPS_INTEGRATION.md D6/D7).
 *
 * Deliberately separate from the pool control in the class picker: one
 * checkbox meaning "include" or "keep together" depending on what else is
 * ticked was rejected as unexplainable. Reuses the Randomizer's existing lock
 * metaphor — the same idea as pinning a single name, applied to a saved group
 * — rather than introducing the word "constraints".
 *
 * Teacher-facing surface, so group names are shown here.
 */
export const RandomLockedGroupsField: React.FC<{ ctx: CustomRenderCtx }> = ({
  ctx,
}) => {
  const config = ctx.config as unknown as RandomConfig;
  const { rosters, activeRosterId } = useDashboard();
  const rollout = useRosterGroupsIntegrationSettings();
  const activeRoster = rosters.find((roster) => roster.id === activeRosterId);
  const groups = activeRoster?.groups ?? [];
  const locked = Array.isArray(config.lockedRosterGroupIds)
    ? config.lockedRosterGroupIds
    : [];

  // The schema gates the card on the permission; the org-wide switch is read
  // here so the listener stays on this widget's panel rather than every one.
  // Explained rather than left as a control that silently does nothing.
  if (!rollout.enabled) {
    return (
      <p id={ctx.id} className="text-xs text-slate-500">
        {ctx.t('widgetSettings.random.rosterGroupsOff')}
      </p>
    );
  }

  if ((config.rosterMode ?? 'class') !== 'class' || groups.length === 0) {
    return (
      <p id={ctx.id} className="text-xs text-slate-500">
        {ctx.t('widgetSettings.random.lockedGroupsEmpty')}
      </p>
    );
  }

  const toggle = (groupId: string) => {
    const next = locked.includes(groupId)
      ? locked.filter((id) => id !== groupId)
      : [...locked, groupId];
    ctx.updateConfig({ lockedRosterGroupIds: next });
  };

  return (
    <div
      id={ctx.id}
      role="group"
      aria-labelledby={ctx.labelId}
      aria-describedby={ctx.describedBy}
      className="flex flex-col gap-1"
    >
      {groups.map((g) => {
        const size = countRosterGroupMembers(activeRoster, g.id) ?? 0;
        return (
          <label
            key={g.id}
            className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer"
          >
            <input
              type="checkbox"
              checked={locked.includes(g.id)}
              onChange={() => toggle(g.id)}
              className="rounded border-slate-300 text-brand-blue-primary focus:ring-brand-blue-primary/40"
            />
            <Lock size={14} className="text-slate-400 shrink-0" />
            <span className="truncate">{g.name}</span>
            <span className="ml-auto text-xs tabular-nums text-slate-400">
              {size}
            </span>
          </label>
        );
      })}
    </div>
  );
};

/**
 * "Save as class groups" — the write-back half of the two-way link
 * (docs/plans/ROSTER_GROUPS_INTEGRATION.md D3/D18).
 *
 * Always creates; it never edits a saved group in place, so a teacher can't
 * lose a hand-built group to a stray randomize. Saves `studentIds` rather
 * than display names (D4), and writes through `appendRosterGroups` so a group
 * another tab added in the meantime survives (D24).
 */
export const RandomSaveAsClassGroupsField: React.FC<{
  ctx: CustomRenderCtx;
}> = ({ ctx }) => {
  const { activeRosterId, addToast, appendRosterGroups, rosters } =
    useDashboard();
  const { showPrompt } = useDialog();
  const rollout = useRosterGroupsIntegrationSettings();
  const config = ctx.config as unknown as RandomConfig;
  const activeRoster = rosters.find((roster) => roster.id === activeRosterId);

  const save = async () => {
    const groups = resultGroups(config.lastResult).filter(
      (g) => (g.studentIds?.length ?? 0) > 0
    );
    if (!activeRoster || groups.length === 0) {
      addToast(
        ctx.t('widgetSettings.random.saveAsGroupsNeedsClassGroups'),
        'info'
      );
      return;
    }
    // Dated by default so six rounds of "Team 1" stay tellable apart.
    const dated = `${ctx.t('widgetSettings.random.saveAsGroupsPrefix')} – ${new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
    const base = await showPrompt(
      ctx.t('widgetSettings.random.saveAsGroupsPrompt', {
        count: groups.length,
      }),
      {
        title: ctx.t('widgetSettings.random.saveAsGroupsTitle'),
        defaultValue: dated,
        confirmLabel: ctx.t('widgetSettings.random.saveAsGroupsConfirm'),
      }
    );
    if (base === null) return;
    const name = base.trim() || dated;
    try {
      await appendRosterGroups(
        activeRoster.id,
        groups.map((g, i) => ({
          id: crypto.randomUUID(),
          name: `${name} (${i + 1})`,
          studentIds: g.studentIds ?? [],
        }))
      );
      addToast(
        ctx.t('widgetSettings.random.saveAsGroupsDone', {
          count: groups.length,
        }),
        'success'
      );
    } catch {
      addToast(ctx.t('widgetSettings.random.saveAsGroupsFailed'), 'error');
    }
  };

  if (!rollout.enabled) {
    return (
      <p id={ctx.id} className="text-xs text-slate-500">
        {ctx.t('widgetSettings.random.rosterGroupsOff')}
      </p>
    );
  }

  return (
    <button
      id={ctx.id}
      type="button"
      onClick={() => void save()}
      className="w-full px-3 py-2 text-sm font-bold text-brand-blue-primary bg-white border border-dashed border-slate-300 rounded-lg hover:border-brand-blue-primary hover:bg-brand-blue-lighter transition-colors"
    >
      {ctx.t('widgetSettings.random.saveAsGroupsAction')}
    </button>
  );
};
