import React from 'react';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import { useDashboard } from '@/context/useDashboard';
import { useDialog } from '@/context/useDialog';
import type { RandomConfig, RandomGroup, StationsConfig } from '@/types';
import {
  buildStationsFromRandomGroups,
  shouldResolveRosterNames,
} from '@/components/widgets/Stations/nexus';
import { getLocalIsoDate } from '@/utils/localDate';

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
