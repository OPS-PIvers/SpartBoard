// Real My Classes and My Teams sidebar panels on fixture data at /sidebar-lists-dev (auth-bypass only), for layout checks.

import React, { useMemo, useState } from 'react';
import {
  DashboardContext,
  type DashboardContextValue,
} from '@/context/DashboardContextValue';
import { DialogProvider } from '@/context/DialogContext';
import { DialogContainer } from '@/components/common/DialogContainer';
import { AuthProvider } from '@/context/AuthContext';
import { SidebarClasses } from '@/components/layout/sidebar/SidebarClasses';
import { SidebarPlcs } from '@/components/layout/sidebar/SidebarPlcs';
import type { ClassRoster, Plc, PlcMember, Student } from '@/types';

const NOW = Date.UTC(2026, 9, 27);
const ME = 'mock-user-id';
const asyncNoop = (): Promise<void> => Promise.resolve();

const students = (n: number, classLink = false): Student[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `s-${i}`,
    firstName: `Student`,
    lastName: `${i + 1}`,
    pin: String(100 + i),
    ...(classLink ? { classLinkSourcedId: `cl-${i}` } : {}),
  }));

const roster = (
  id: string,
  name: string,
  extra: Partial<ClassRoster> = {}
): ClassRoster => ({
  id,
  name,
  driveFileId: null,
  studentCount: extra.students?.length ?? 0,
  createdAt: NOW,
  students: [],
  ...extra,
});

const ROSTERS: ClassRoster[] = [
  roster('r1', 'Sample - Mock Class', { students: students(1) }),
  roster('r2', 'Period 3 - Grade 7 Social Studies (Ivers)', {
    students: students(28),
    classlinkClassId: 'cl-class-2',
    googleClassroomCourseId: 'gc-2',
  }),
  roster('r3', 'Advanced Placement Computer Science Principles - Section B', {
    students: students(24, true),
  }),
  roster('r4', 'Homeroom', { students: students(19) }),
  roster('r5', 'Period 6 - Integrated Science', {
    loadError: 'Could not read the class file from Google Drive.',
  }),
];

const member = (uid: string, role: PlcMember['role']): PlcMember => ({
  uid,
  email: `${uid}@orono.k12.mn.us`,
  displayName: uid,
  role,
  joinedAt: NOW,
  status: 'active',
});

const plc = (
  id: string,
  name: string,
  lead: boolean,
  memberCount: number,
  groupType: Plc['groupType'] = 'plc'
): Plc => {
  const others = Array.from({ length: memberCount - 1 }, (_, i) =>
    member(`${id}-m${i}`, lead || i > 0 ? 'member' : 'lead')
  );
  const all = [member(ME, lead ? 'lead' : 'member'), ...others];
  return {
    id,
    name,
    groupType,
    members: Object.fromEntries(all.map((m) => [m.uid, m])),
    leadUid: lead ? ME : `${id}-m0`,
    memberUids: all.map((m) => m.uid),
    memberEmails: Object.fromEntries(all.map((m) => [m.uid, m.email])),
    createdAt: NOW,
    updatedAt: NOW,
  };
};

const PLCS: Plc[] = [
  plc('p1', 'Digital Learning Leadership Team', true, 3),
  plc('p2', 'Emerging Technology Committee', true, 1),
  plc('p3', 'OPS Tech Lead Team', false, 6, 'department'),
  plc('p4', 'TEST PLC', true, 2),
  plc('p5', 'Grade 7 Social Studies Professional Learning Community', false, 4),
];

const FakeDashboard: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [activeRosterId, setActiveRosterId] = useState<string | null>('r2');
  const value = useMemo(
    () =>
      ({
        rosters: ROSTERS,
        activeRosterId,
        setActiveRoster: setActiveRosterId,
        addRoster: () => Promise.resolve('new'),
        updateRoster: asyncNoop,
        deleteRoster: asyncNoop,
        addToast: () => undefined,
      }) as unknown as DashboardContextValue,
    [activeRosterId]
  );
  return (
    <DashboardContext.Provider value={value}>
      {children}
    </DashboardContext.Provider>
  );
};

const Frame: React.FC<{
  testId: string;
  children: React.ReactNode;
}> = ({ testId, children }) => (
  <div
    data-testid={testId}
    className="relative h-[760px] w-80 overflow-hidden border-r border-slate-200 bg-white shadow-2xl"
  >
    {children}
  </div>
);

export const SidebarListsDevHarness: React.FC = () => (
  <DialogProvider>
    <AuthProvider>
      <FakeDashboard>
        <div className="flex min-h-screen items-start gap-6 bg-slate-100 p-6">
          <Frame testId="sidebar-lists-classes">
            <SidebarClasses isVisible />
          </Frame>
          <Frame testId="sidebar-lists-teams">
            <SidebarPlcs
              isVisible
              plcs={PLCS}
              plcsLoading={false}
              createPlc={() => Promise.resolve('new')}
              leavePlc={asyncNoop}
              deletePlc={asyncNoop}
              pendingInvites={[]}
              onOpenDashboard={() => undefined}
            />
          </Frame>
        </div>
        <DialogContainer />
      </FakeDashboard>
    </AuthProvider>
  </DialogProvider>
);
