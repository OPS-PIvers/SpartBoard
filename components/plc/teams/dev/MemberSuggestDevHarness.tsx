// Team invite email suggestions on fixtures at /team-email-suggest-dev (auth-bypass builds only).

import React, { useState } from 'react';
import type { Plc, PlcMember } from '@/types';
import { AuthContext, type AuthContextType } from '@/context/AuthContextValue';
import { DialogProvider } from '@/context/DialogContext';
import { MembersBody } from '@/components/plc/bodies/MembersBody';
import { PlcEditModal } from '@/components/layout/sidebar/PlcEditModal';
import { STAFF } from '@/components/plc/redesignMockup/fixtures';
import { primeStaffDirectory } from '@/hooks/useStaffDirectory';

const ORG = 'orono';
const DOMAIN = 'orono.k12.mn.us';
const emailFor = (name: string) =>
  `${name.toLowerCase().replace(/\s+/g, '.')}@${DOMAIN}`;

const DIRECTORY_NAMES = [...STAFF, 'Paul Ivers', 'Paul Nygaard'];
primeStaffDirectory(
  ORG,
  DIRECTORY_NAMES.map((name) => ({ email: emailFor(name), name }))
);

const member = (name: string, role: PlcMember['role']): PlcMember => ({
  uid: name === 'Erin Walsh' ? 'me' : name,
  email: emailFor(name),
  displayName: name,
  role,
  joinedAt: 0,
  status: 'active',
});

const MEMBERS = [
  member('Erin Walsh', 'lead'),
  member('Mark Johnson', 'member'),
  member('Laura Benson', 'member'),
];

const PLC = {
  id: 'grade7-math',
  name: 'Grade 7 Math',
  orgId: ORG,
  groupType: 'plc',
  members: Object.fromEntries(MEMBERS.map((m) => [m.uid, m])),
  leadUid: 'me',
  memberUids: MEMBERS.map((m) => m.uid),
  memberEmails: Object.fromEntries(MEMBERS.map((m) => [m.uid, m.email])),
  createdAt: 0,
  updatedAt: 0,
} as unknown as Plc;

const HARNESS_AUTH = {
  user: { uid: 'me', email: emailFor('Erin Walsh') },
  orgId: ORG,
  canAccessFeature: () => true,
} as unknown as AuthContextType;

export const MemberSuggestDevHarness: React.FC = () => {
  const [screen, setScreen] = useState<'members' | 'edit'>(
    new URLSearchParams(window.location.search).get('screen') === 'edit'
      ? 'edit'
      : 'members'
  );
  return (
    <AuthContext.Provider value={HARNESS_AUTH}>
      <DialogProvider>
        <div className="h-screen [height:100dvh] overflow-y-auto bg-slate-50">
          <div className="max-w-3xl mx-auto p-6 pb-16">
            {screen === 'members' ? (
              <MembersBody plc={PLC} />
            ) : (
              <PlcEditModal
                isOpen
                plc={PLC}
                onClose={() => setScreen('members')}
                onCreate={() => Promise.resolve()}
              />
            )}
          </div>
        </div>
      </DialogProvider>
    </AuthContext.Provider>
  );
};
