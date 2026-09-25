import { useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { RolloutSwitch } from '@/config/rolloutSwitches';

/** Live value of one `admin_settings/*` rollout switch, plus a setter. */
export const useRolloutSwitch = (sw: RolloutSwitch | undefined) => {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sw) return;
    return onSnapshot(
      doc(db, 'admin_settings', sw.docId),
      (snap) => setEnabled(sw.normalize(snap.data()).enabled),
      (err) => {
        console.error('[useRolloutSwitch]', sw.docId, err);
        setEnabled(false);
      }
    );
  }, [sw]);

  const change = async (next: boolean) => {
    if (!sw) return;
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

  return { enabled, saving, error, change };
};
