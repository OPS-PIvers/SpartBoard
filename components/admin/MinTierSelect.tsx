import React from 'react';
import type { UserTier } from '@/types';

/**
 * "Minimum tier" selector shared by the Global Permissions and Feature
 * Permissions managers (docs/wide-distro-plan.md Phase 3). Maps the
 * `minTier?: UserTier` permission field to a four-option dropdown —
 * "None" round-trips to an absent field so pre-tier docs stay untouched
 * until an admin explicitly picks a tier.
 *
 * NOTE: callers persist with `setDoc(..., permission)`; Firestore rejects
 * explicit `undefined` values, so save paths must strip an undefined
 * `minTier` before writing (both managers do).
 */
const TIER_OPTIONS: { value: '' | UserTier; label: string }[] = [
  { value: '', label: 'None (all tiers)' },
  { value: 'free', label: 'Free' },
  { value: 'org', label: 'Org members' },
  { value: 'internal', label: 'Internal staff only (orono.k12.mn.us)' },
];

interface MinTierSelectProps {
  value: UserTier | undefined;
  onChange: (minTier: UserTier | undefined) => void;
}

export const MinTierSelect: React.FC<MinTierSelectProps> = ({
  value,
  onChange,
}) => (
  <div className="text-left">
    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 block">
      Minimum tier
    </label>
    <select
      value={value ?? ''}
      onChange={(e) =>
        onChange(
          e.target.value === '' ? undefined : (e.target.value as UserTier)
        )
      }
      className="w-full max-w-xs px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-blue-primary"
    >
      {TIER_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
    <p className="text-xxs text-slate-400 mt-1 leading-tight">
      Users below this tier are denied (free &lt; org &lt; internal). Admins
      always bypass.
    </p>
  </div>
);
