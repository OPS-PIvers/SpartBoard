import { useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { RolloutSwitch } from '@/config/rolloutSwitches';

/** Live value of one `admin_settings/*` rollout switch, plus a setter. */
export const useRolloutSwitch = (sw: RolloutSwitch | undefined) => {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A failed read shows as off, so Retire must not trust it.
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!sw) return;
    return onSnapshot(
      doc(db, 'admin_settings', sw.docId),
      (snap) => {
        setFailed(false);
        setEnabled(sw.normalize(snap.data()).enabled);
      },
      (err) => {
        console.error('[useRolloutSwitch]', sw.docId, err);
        setFailed(true);
        setEnabled(false);
      }
    );
  }, [sw]);

  const change = async (next: boolean) => {
    if (!sw) return;
    setSaving(true);
    setError(null);
    try {
      await setDoc(
        doc(db, 'admin_settings', sw.docId),
        { [sw.field ?? 'enabled']: next },
        { merge: true }
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return { enabled, failed, saving, error, change };
};
