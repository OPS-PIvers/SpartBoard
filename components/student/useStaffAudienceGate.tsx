// Gates for Staff-audience assignment links: district Google sign-in before the activity.
import React, { useEffect, useState } from 'react';
import { auth } from '@/config/firebase';
import {
  enrollStaffMember,
  readStaffIdentity,
  type StaffIdentity,
} from '@/utils/staffAudience';
import { StaffChecking, StaffSignInScreen } from './StaffSignInGate';

export type StaffGateStatus = 'off' | 'checking' | 'sign-in' | 'ok';

export interface StaffAudienceGate {
  status: StaffGateStatus;
  /** The signed-in staff member; null unless status is 'ok'. */
  identity: StaffIdentity | null;
  /** The screen to render in place of the activity, or null to carry on. */
  screen: React.ReactNode;
}

interface Checked {
  uid: string | null;
  identity: StaffIdentity | null;
}

/** Holds a Staff-audience activity behind district Google sign-in; a no-op for student sessions. */
export function useStaffAudienceGate(active: boolean): StaffAudienceGate {
  const [checked, setChecked] = useState<Checked | null>(null);
  const uid = auth.currentUser?.uid ?? null;

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const user = auth.currentUser;
    void readStaffIdentity(user)
      .catch(() => null)
      .then(async (identity) => {
        // A session from an earlier staff link may predate its member doc.
        if (identity) await enrollStaffMember(auth);
        if (!cancelled) setChecked({ uid: user?.uid ?? null, identity });
      });
    return () => {
      cancelled = true;
    };
  }, [active, uid]);

  if (!active) return { status: 'off', identity: null, screen: null };
  if (!checked || checked.uid !== uid) {
    return { status: 'checking', identity: null, screen: <StaffChecking /> };
  }
  if (!checked.identity) {
    return { status: 'sign-in', identity: null, screen: <StaffSignInScreen /> };
  }
  return { status: 'ok', identity: checked.identity, screen: null };
}
