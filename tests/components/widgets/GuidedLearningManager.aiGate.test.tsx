import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { GuidedLearningManager } from '@/components/widgets/GuidedLearning/components/GuidedLearningManager';
import { AuthContext } from '@/context/AuthContextValue';

vi.mock('@/hooks/useFolders', () => ({
  useFolders: () => ({
    folders: [],
    loading: false,
    error: null,
    createFolder: vi.fn(),
    renameFolder: vi.fn(),
    moveFolder: vi.fn(),
    deleteFolder: vi.fn(),
    moveItem: vi.fn(),
  }),
}));

vi.mock('@/hooks/useSessionViewCount', () => ({
  useSessionViewCount: () => ({ count: 0 }),
}));

const renderManager = (features: string[], isAdmin = true) => {
  const onOpenAIAuthoring = vi.fn();
  render(
    <AuthContext.Provider
      value={
        {
          canAccessFeature: (id: string) => features.includes(id),
          canSeeShareTracking: () => false,
        } as unknown as React.ContextType<typeof AuthContext>
      }
    >
      <GuidedLearningManager
        userId="teacher-1"
        sets={[]}
        buildingSets={[]}
        assignments={[]}
        loading={false}
        buildingLoading={false}
        assignmentsLoading={false}
        isDriveConnected={true}
        isAdmin={isAdmin}
        onPlay={vi.fn()}
        onEdit={vi.fn()}
        onAssign={vi.fn()}
        onDeletePersonal={vi.fn()}
        onDeleteBuilding={vi.fn()}
        onCreateNewPersonal={vi.fn()}
        onCreateNewBuilding={vi.fn()}
        onOpenAIAuthoring={onOpenAIAuthoring}
        onReorderPersonal={vi.fn()}
        recentSessionIds={{}}
        onViewResults={vi.fn()}
        onAssignmentCopyLink={vi.fn()}
        onAssignmentOpenResults={vi.fn()}
        onAssignmentArchive={vi.fn()}
        onAssignmentUnarchive={vi.fn()}
        onAssignmentDelete={vi.fn()}
      />
    </AuthContext.Provider>
  );
  return onOpenAIAuthoring;
};

afterEach(cleanup);

describe('GuidedLearningManager AI button', () => {
  it('shows AI with gemini-functions and the Guided Learning AI switch', async () => {
    const open = renderManager(['gemini-functions', 'guided-learning-ai']);
    fireEvent.click(await screen.findByRole('button', { name: 'AI' }));
    expect(open).toHaveBeenCalledWith('personal');
  });

  it('hides AI without the gemini-functions feature, even for admins', async () => {
    renderManager([]);
    await screen.findByRole('button', { name: 'New Set' });
    expect(screen.queryByRole('button', { name: 'AI' })).toBeNull();
  });

  it('hides AI while the Guided Learning AI switch is off', async () => {
    renderManager(['gemini-functions']);
    await screen.findByRole('button', { name: 'New Set' });
    expect(screen.queryByRole('button', { name: 'AI' })).toBeNull();
  });

  it('shows AI to a teacher the switch lets in', async () => {
    renderManager(['gemini-functions', 'guided-learning-ai'], false);
    expect(
      await screen.findByRole('button', { name: 'AI' })
    ).toBeInTheDocument();
  });
});
