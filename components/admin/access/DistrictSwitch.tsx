import React, { useRef, useState } from 'react';
import {
  Archive,
  ChevronDown,
  FlaskConical,
  GraduationCap,
  Loader2,
} from 'lucide-react';
import { useClickOutside } from '@/hooks/useClickOutside';
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

/** Menu wording Paul approved. */
const WRAP_UP_LABELS = {
  menu: 'Finish',
  graduate: 'Graduate',
  graduateHint: 'Move to Features or widget settings.',
  retire: 'Retire',
  retireHint: 'Remove the switch.',
};

const ITEM =
  'flex w-full items-start gap-2.5 px-3 py-2 text-left hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-hidden';

const ItemText: React.FC<{ label: string; hint: string }> = ({
  label,
  hint,
}) => (
  <span className="min-w-0">
    <span className="block text-sm font-bold text-slate-800">{label}</span>
    <span className="block text-xs text-slate-500">{hint}</span>
  </span>
);

/** One button that opens Graduate and Retire for a preview row. */
export const WrapUpMenu: React.FC<{
  anchorKey: string;
  graduate?: { busy: boolean; disabled?: boolean; onClick: () => void };
  retire: { href: string; disabled?: boolean };
}> = ({ anchorKey, graduate, retire }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useClickOutside(ref, () => setOpen(false));
  const busy = graduate?.busy ?? false;
  return (
    <span ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
        aria-expanded={open}
        aria-haspopup="menu"
        data-testid={`wrap-up-${anchorKey}`}
        {...tourFieldAttr('admin.previews.wrap-up', 'admin', anchorKey)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-bold hover:bg-slate-50"
      >
        {busy ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
        ) : (
          <Archive className="w-3.5 h-3.5" aria-hidden />
        )}
        {WRAP_UP_LABELS.menu}
        <ChevronDown
          className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>
      {open && (
        <span
          role="menu"
          onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
          className="absolute right-0 top-full z-20 mt-1 block w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white py-1 shadow-lg"
        >
          {graduate && (
            <button
              type="button"
              role="menuitem"
              disabled={graduate.busy || graduate.disabled}
              title={graduate.disabled ? 'Save first' : undefined}
              onClick={() => {
                setOpen(false);
                graduate.onClick();
              }}
              data-testid={`graduate-${anchorKey}`}
              {...tourFieldAttr('admin.previews.graduate', 'admin', anchorKey)}
              className={`${ITEM} disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <GraduationCap
                className="mt-0.5 w-4 h-4 shrink-0 text-slate-500"
                aria-hidden
              />
              <ItemText
                label={WRAP_UP_LABELS.graduate}
                hint={WRAP_UP_LABELS.graduateHint}
              />
            </button>
          )}
          {retire.disabled ? (
            <span
              role="menuitem"
              aria-disabled="true"
              title="Save first"
              data-testid={`retire-${anchorKey}`}
              {...tourFieldAttr('admin.previews.retire', 'admin', anchorKey)}
              className={`${ITEM} opacity-50 cursor-not-allowed hover:bg-white`}
            >
              <Archive
                className="mt-0.5 w-4 h-4 shrink-0 text-slate-500"
                aria-hidden
              />
              <ItemText
                label={WRAP_UP_LABELS.retire}
                hint={WRAP_UP_LABELS.retireHint}
              />
            </span>
          ) : (
            <a
              role="menuitem"
              href={retire.href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              data-testid={`retire-${anchorKey}`}
              {...tourFieldAttr('admin.previews.retire', 'admin', anchorKey)}
              className={ITEM}
            >
              <Archive
                className="mt-0.5 w-4 h-4 shrink-0 text-slate-500"
                aria-hidden
              />
              <ItemText
                label={WRAP_UP_LABELS.retire}
                hint={WRAP_UP_LABELS.retireHint}
              />
            </a>
          )}
        </span>
      )}
    </span>
  );
};

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
      <span className="flex min-w-[12rem] flex-1 items-center gap-3">
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
        {actions &&
          state.enabled !== null &&
          !state.failed &&
          actions(state.enabled)}
        <DistrictSwitch sw={sw} state={state} />
      </span>
    </div>
  );
};
