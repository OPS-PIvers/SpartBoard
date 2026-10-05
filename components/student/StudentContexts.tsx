import React, { ReactNode } from 'react';
import { AuthContext } from '@/context/AuthContextValue';
import { DashboardContext } from '@/context/DashboardContextValue';
import { mockAuth, mockDashboard } from './studentMocks';

interface StudentProviderProps {
  children: ReactNode;
}

export const StudentProvider: React.FC<StudentProviderProps> = ({
  children,
}) => {
  return (
    <AuthContext.Provider value={mockAuth}>
      <DashboardContext.Provider value={mockDashboard}>
        {children}
      </DashboardContext.Provider>
    </AuthContext.Provider>
  );
};
