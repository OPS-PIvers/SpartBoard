// Admin card for the org-wide rollout switches kept in `admin_settings/*`.
import React, { useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { FlaskConical, Loader2 } from 'lucide-react';
import { db } from '@/config/firebase';
import { Toggle } from '@/components/common/Toggle';
import { ROLLOUT_SWITCHES, type RolloutSwitch } from '@/config/rolloutSwitches';
import { useAccessSearch } from '@/components/admin/access/accessSearchContext';
import {
  AccessSearchEmpty,
  AdminSearchField,
} from '@/components/admin/access/AdminSearchField';
import { matchesSearch } from '@/components/admin/access/accessSearch';

const RolloutRow: React.FC<{ sw: RolloutSwitch }> = ({ sw }) => {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ref = doc(db, 'admin_settings', sw.docId);
    return onSnapshot(
      ref,
      (snap) => setEnabled(sw.normalize(snap.data()).enabled),
      (err) => {
        console.error('[RolloutSwitchesPanel]', sw.docId, err);
        setEnabled(false);
      }
    );
  }, [sw]);

  const handleChange = async (next: boolean) => {
    setSaving(true);
    setError(null);
    try {
      await setDoc(doc(db, 'admin_settings', sw.docId), { enabled: next });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <li className="flex items-start justify-between gap-4 px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-900">{sw.title}</p>
        <p className="mt-0.5 text-xs text-slate-600">{sw.description}</p>
        {error && (
          <p className="mt-1 text-xs font-medium text-brand-red-primary">
            {error}
          </p>
        )}
      </div>
      {enabled === null ? (
        <Loader2 className="mt-1 h-4 w-4 shrink-0 animate-spin text-slate-400" />
      ) : (
        <Toggle
          checked={enabled}
          disabled={saving}
          onChange={(next) => void handleChange(next)}
          label={sw.title}
        />
      )}
    </li>
  );
};

export const RolloutSwitchesPanel: React.FC = () => {
  const { query } = useAccessSearch();
  const visible = ROLLOUT_SWITCHES.filter((sw) =>
    matchesSearch(query, [sw.title, sw.description, sw.docId])
  );
  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-lg bg-brand-blue-lighter/40 text-brand-blue-primary flex items-center justify-center">
          <FlaskConical className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-900">Rollouts</h2>
          <p className="text-xs text-slate-600">
            Each switch applies to every teacher.
          </p>
        </div>
      </div>
      <AdminSearchField tab="rollouts" placeholder="Search rollouts" />
      {visible.length === 0 ? (
        <AccessSearchEmpty tab="rollouts" fallback="No rollout switches." />
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
          {visible.map((sw) => (
            <RolloutRow key={sw.docId} sw={sw} />
          ))}
        </ul>
      )}
    </div>
  );
};
