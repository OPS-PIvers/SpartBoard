import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProfileSection } from '@/components/settingsModal/sections/ProfileSection';

const updateTeachingProfile = vi.fn().mockResolvedValue(undefined);
const setSelectedBuildings = vi.fn().mockResolvedValue(undefined);
const authState = {
  selectedBuildings: ['high'],
  gradesTaught: null as string[] | null,
  effectiveGrades: ['9', '10', '11', '12'],
  buildingGrades: ['9', '10', '11', '12'],
  subjectsTaught: [] as string[],
};

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    ...authState,
    setSelectedBuildings,
    updateTeachingProfile,
  }),
}));

vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => [
    {
      id: 'high',
      name: 'High School',
      gradeLevels: ['9-12'],
      gradeLabel: '9-12',
    },
    {
      id: 'middle',
      name: 'Middle School',
      gradeLevels: ['6-8'],
      gradeLabel: '6-8',
    },
  ],
}));

vi.mock('@/hooks/useSubjects', () => ({
  useSubjects: () => ({
    subjects: [],
    active: [
      { id: 'ela', label: 'English Language Arts' },
      { id: 'math', label: 'Math' },
    ],
    byId: new Map(),
    loading: false,
  }),
}));

describe('ProfileSection', () => {
  beforeEach(() => {
    updateTeachingProfile.mockClear();
    setSelectedBuildings.mockClear();
    authState.gradesTaught = null;
    authState.effectiveGrades = ['9', '10', '11', '12'];
    authState.subjectsTaught = [];
  });

  it('shows building-derived grades and hides the reset link when unset', () => {
    render(<ProfileSection />);
    expect(screen.getByRole('button', { name: '10' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('button', { name: '8' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    expect(
      screen.queryByRole('button', { name: /reset to building default/i })
    ).toBeNull();
  });

  it('deselecting a grade saves the remaining grades explicitly', () => {
    render(<ProfileSection />);
    fireEvent.click(screen.getByRole('button', { name: '9' }));
    expect(updateTeachingProfile).toHaveBeenCalledWith({
      gradesTaught: ['10', '11', '12'],
    });
  });

  it('offers a reset back to the building default once grades are set', () => {
    authState.gradesTaught = ['10'];
    authState.effectiveGrades = ['10'];
    render(<ProfileSection />);
    fireEvent.click(
      screen.getByRole('button', { name: /reset to building default/i })
    );
    expect(updateTeachingProfile).toHaveBeenCalledWith({ gradesTaught: null });
  });

  it('toggles buildings and subjects', () => {
    render(<ProfileSection />);
    fireEvent.click(screen.getByRole('button', { name: /middle school/i }));
    expect(setSelectedBuildings).toHaveBeenCalledWith(['high', 'middle']);
    fireEvent.click(screen.getByRole('button', { name: 'Math' }));
    expect(updateTeachingProfile).toHaveBeenCalledWith({
      subjectsTaught: ['math'],
    });
  });
});
