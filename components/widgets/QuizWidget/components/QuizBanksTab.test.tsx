import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { QuestionBankMetadata } from '@/types';
import { useFolders } from '@/hooks/useFolders';
import { QuizBanksTab } from './QuizBanksTab';

vi.mock('@/hooks/useFolders');

const bank = (
  overrides: Partial<QuestionBankMetadata> = {}
): QuestionBankMetadata => ({
  id: 'bank-1',
  title: 'Cell Biology',
  driveFileId: 'drive-1',
  questionCount: 12,
  targetIds: [],
  targetCounts: {},
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
});

const renderTab = (
  props: Partial<React.ComponentProps<typeof QuizBanksTab>> = {}
) =>
  render(
    <QuizBanksTab
      userId="teacher-1"
      banks={[bank()]}
      loading={false}
      sharedBankSources={[]}
      plcs={[]}
      shell={{
        tab: 'banks',
        onTabChange: vi.fn(),
        widgetLabel: 'Quiz',
        widgetType: 'quiz',
      }}
      onNewBank={vi.fn()}
      onEditBank={vi.fn()}
      onDuplicateBank={vi.fn()}
      onDeleteBank={vi.fn()}
      {...props}
    />
  );

describe('QuizBanksTab drop-on-folder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useFolders as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      folders: [
        {
          id: 'folder-1',
          name: 'Unit 1',
          parentId: null,
          order: 0,
          createdAt: 1,
        },
      ],
      loading: false,
      error: null,
      moveItem: vi.fn().mockRejectedValue(new Error('move failed')),
      createFolder: vi.fn(),
      renameFolder: vi.fn(),
      moveFolder: vi.fn(),
      deleteFolder: vi.fn(),
    });
  });

  // A rejected move must surface, not just log — a teacher watching the UI
  // has no other signal that the drop silently did nothing.
  it('reports a failed move through onError instead of swallowing it', async () => {
    const onError = vi.fn();
    renderTab({ onError });

    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move to folder…' }));
    fireEvent.click(screen.getByRole('button', { name: 'Unit 1' }));

    await waitFor(() =>
      expect(onError).toHaveBeenCalledWith(
        'That question bank could not be moved.'
      )
    );
  });
});
