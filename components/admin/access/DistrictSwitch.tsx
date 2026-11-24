import React from 'react';
import { Archive, FlaskConical, GraduationCap, Loader2 } from 'lucide-react';
import { tourFieldAttr } from '@/config/tourAnchors';
import { rolloutSwitchKey, type RolloutSwitch } from '@/config/rolloutSwitches';
import type { GlobalFeature } from '@/types';
import { Toggle } from '@/components/common/Toggle';
import { useAuth } from '@/context/useAuth';
import { isSuperAdminActor } from '@/utils/superAdmin';
import { switchForFeature } from './accessSearch';
import { useRolloutSwitch } from './useRolloutSwitch';

// True when the rules refuse this switch's write for the signed-in admin.
const useSuperAdminLock = (sw: RolloutSwitch): boolean => {
  const { user, roleId, orgId } = useAuth();
  return !!sw.superAdminOnly && !isSuperAdminActor(user?.email, roleId, orgId);
};

export const DistrictSwitch: React.FC<{
  sw: RolloutSwitch;
  state: ReturnType<typeof useRolloutSwitch>;
}> = ({ sw, state }) => {
  const locked = useSuperAdminLock(sw);
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-xxs font-bold text-slate-400 uppercase">
        District
      </span>
      {state.enabled === null ? (
        <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
      ) : (
        <Toggle
          checked={state.enabled}
          disabled={state.saving || locked}
          onChange={(next) => void state.change(next)}
          size="sm"
          label={`${sw.title} district switch`}
          anchor={tourFieldAttr(
            'admin.previews.district-switch',
            'admin',
            rolloutSwitchKey(sw)
          )}
        />
      )}
    </span>
  );
};

/** A graduated flag's district switch, so it keeps its switch off the Previews tab. */
export const PairedDistrictSwitch: React.FC<{ featureId: GlobalFeature }> = ({
  featureId,
}) => {
  const sw = switchForFeature(featureId);
  const state = useRolloutSwitch(sw);
  return sw ? <DistrictSwitch sw={sw} state={state} /> : null;
};

const ACTION =
  'flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-bold hover:bg-slate-50';

export const GraduateButton: React.FC<{
  anchorKey: string;
  testId: string;
  busy: boolean;
  disabled?: boolean;
  title: string;
  onClick: () => void;
}> = ({ anchorKey, testId, busy, disabled, title, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={busy || disabled}
    title={title}
    data-testid={testId}
    {...tourFieldAttr('admin.previews.graduate', 'admin', anchorKey)}
    className={`${ACTION} disabled:opacity-50 disabled:cursor-not-allowed`}
  >
    {busy ? (
      <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
    ) : (
      <GraduationCap className="w-3.5 h-3.5" aria-hidden />
    )}
    Graduate
  </button>
);

export const RetireLink: React.FC<{
  anchorKey: string;
  testId: string;
  href: string;
  disabled?: boolean;
}> = ({ anchorKey, testId, href, disabled }) =>
  disabled ? (
    <span
      aria-disabled="true"
      title="Save first"
      data-testid={testId}
      className={`${ACTION} opacity-50 cursor-not-allowed hover:bg-white`}
    >
      <Archive className="w-3.5 h-3.5" aria-hidden />
      Retire
    </span>
  ) : (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title="Asks Claude to remove the switch and keep it as it is now"
      data-testid={testId}
      {...tourFieldAttr('admin.previews.retire', 'admin', anchorKey)}
      className={ACTION}
    >
      <Archive className="w-3.5 h-3.5" aria-hidden />
      Retire
    </a>
  );

/** A district switch with no access flag of its own. */
export const RolloutOnlyRow: React.FC<{
  sw: RolloutSwitch;
  actions?: (enabled: boolean) => React.ReactNode;
}> = ({ sw, actions }) => {
  const state = useRolloutSwitch(sw);
  const locked = useSuperAdminLock(sw);
  return (
    <div
      data-testid={`rollout-row-${rolloutSwitchKey(sw)}`}
      className="bg-white flex flex-wrap items-center gap-3 p-3"
    >
      <span className="flex min-w-0 flex-1 items-center gap-3">
        <span className="bg-brand-blue-lighter p-2 rounded-lg text-brand-blue-primary shrink-0">
          <FlaskConical className="w-4 h-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold text-slate-800 text-sm">
            {sw.title}
          </span>
          <span className="block text-xs sm:text-xxs text-slate-500 sm:truncate">
            {state.enabled === null
              ? sw.description
              : state.enabled
                ? 'Live for: everyone'
                : 'Off everywhere'}
            {state.error ? ` · ${state.error}` : ''}
            {locked ? ' · Super admins only' : ''}
          </span>
        </span>
      </span>
      <span className="ml-auto flex shrink-0 items-center gap-2">
        {actions && state.enabled !== null && actions(state.enabled)}
        <DistrictSwitch sw={sw} state={state} />
      </span>
    </div>
  );
};
