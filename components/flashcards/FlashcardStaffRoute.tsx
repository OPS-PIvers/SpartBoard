// Staff-audience Flashcards links: district Google sign-in stands in for the student SSO token.
import React, { useEffect, useMemo, useState } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '@/config/firebase';
import {
  StudentAuthContext,
  type StudentAuthValue,
} from '@/context/StudentAuthContextValue';
import { useStaffAudienceGate } from '@/components/student/useStaffAudienceGate';
import { StaffChecking } from '@/components/student/StaffSignInGate';
import { FlashcardAssignmentPage } from './FlashcardAssignmentPage';

export const FlashcardStaffRoute: React.FC = () => {
  const [authReady, setAuthReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void auth.authStateReady().finally(() => {
      if (!cancelled) setAuthReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const gate = useStaffAudienceGate(authReady);
  const identity = gate.identity;
  const uid = auth.currentUser?.uid ?? null;

  const value = useMemo<StudentAuthValue | null>(
    () =>
      identity && uid
        ? {
            status: 'authenticated',
            pseudonymUid: uid,
            orgId: null,
            classIds: [],
            firstName: identity.staffName || null,
            pinLogin: false,
            signOut: () => signOut(auth),
          }
        : null,
    [identity, uid]
  );

  if (!authReady) return <StaffChecking />;
  if (gate.screen || !value || !identity) return gate.screen;
  return (
    <StudentAuthContext.Provider value={value}>
      <FlashcardAssignmentPage staff={identity} />
    </StudentAuthContext.Provider>
  );
};
