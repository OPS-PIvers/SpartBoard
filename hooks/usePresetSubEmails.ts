/**
 * usePresetSubEmails — subscribes to `/preset_sub_emails/{buildingId}` so
 * the ShareLinkCreatorModal's sub-email picker can suggest the building's
 * generic sub accounts (e.g. ohssub@orono.k12.mn.us).
 *
 * Doc shape: `{ emails: string[], updatedAt: number, updatedBy: string }`.
 * Missing docs resolve to an empty list; admins seed them via
 * `components/admin/PresetSubEmailsManager`.
 */

import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { canonicalBuildingId } from '@/config/buildings';

interface PresetSubEmailsState {
  emails: string[];
  loading: boolean;
}

interface Snapshot {
  emails: string[];
  buildingId: string;
}

export function usePresetSubEmails(buildingId: string): PresetSubEmailsState {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);

  useEffect(() => {
    if (!buildingId) return;
    const canonical = canonicalBuildingId(buildingId);
    const ref = doc(db, 'preset_sub_emails', canonical);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const data = snap.data();
        const emails = Array.isArray(data?.emails)
          ? (data.emails as unknown[]).filter(
              (v): v is string => typeof v === 'string'
            )
          : [];
        setSnapshot({ emails, buildingId: canonical });
      },
      (err) => {
        console.error('[usePresetSubEmails] snapshot error:', err);
        setSnapshot({ emails: [], buildingId: canonical });
      }
    );
    return unsub;
  }, [buildingId]);

  // Derive state during render so we never need a setState-in-effect reset
  // when buildingId changes (or clears).
  if (!buildingId) return { emails: [], loading: false };
  const canonical = canonicalBuildingId(buildingId);
  if (!snapshot || snapshot.buildingId !== canonical) {
    return { emails: [], loading: true };
  }
  return { emails: snapshot.emails, loading: false };
}
