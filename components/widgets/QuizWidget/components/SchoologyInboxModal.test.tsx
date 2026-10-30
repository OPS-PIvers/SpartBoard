import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { QuizData } from '@/types';
import {
  parseInboxItem,
  type SchoologyInboxItem,
} from '@/utils/schoologyInbox';
import {
  SchoologyInboxModal,
  type SchoologyLibraryTarget,
} from './SchoologyInboxModal';

const item = (
  kind: string,
  itemId: string,
  title: string,
  folderPath: string[]
): SchoologyInboxItem => {
  const parsed = parseInboxItem(`${kind}_${itemId}`, {
    source: { kind, itemId },
    folderPath,
    quiz: {
      title,
      warnings: [],
      questions: [
        {
          number: 1,
          text: `${title} prompt`,
          type: 'MC',
          options: [
            { letter: 'A', text: 'Right' },
            { letter: 'B', text: 'Wrong' },
          ],
          correctAnswer: 'Right',
          imageIds: [],
          warnings: [],
        },
      ],
    },
    settings: { attempts: 3 },
    images: [],
    receivedAt: 1,
  });
  if (!parsed) throw new Error('bad fixture');
  return parsed;
};

const target = (
  over: Partial<SchoologyLibraryTarget> = {}
): SchoologyLibraryTarget => ({
  existing: [],
  folders: [],
  createFolder: vi.fn((name: string) => Promise.resolve(`folder-${name}`)),
  load: vi.fn(),
  save: vi.fn(() => Promise.resolve()),
  ...over,
});

function setup(
  items: SchoologyInboxItem[],
  over: Partial<React.ComponentProps<typeof SchoologyInboxModal>> = {}
) {
  const props: React.ComponentProps<typeof SchoologyInboxModal> = {
    items,
    quizzes: target(),
    banks: target(),
    loadImages: vi.fn(() => Promise.resolve([])),
    removeItem: vi.fn(() => Promise.resolve()),
    attachPictures: vi.fn((quiz: QuizData) => Promise.resolve(quiz)),
    canUploadPictures: true,
    onClose: vi.fn(),
    ...over,
  };
  render(<SchoologyInboxModal {...props} />);
  return props;
}

describe('SchoologyInboxModal', () => {
  it('saves a new quiz into its course folder with its settings, then clears the inbox entry', async () => {
    const props = setup([item('testQuiz', '1', 'Unit 1 Quiz', ['Biology'])]);
    expect(screen.getByText('Settings: 3 attempts')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Save 1 item/ }));
    await waitFor(() =>
      expect(props.removeItem).toHaveBeenCalledWith('testQuiz_1')
    );
    expect(props.quizzes.createFolder).toHaveBeenCalledWith('Biology', null);
    const [saved, placement] = vi.mocked(props.quizzes.save).mock.calls[0];
    expect(saved.source).toMatchObject({
      system: 'schoology',
      kind: 'testQuiz',
      itemId: '1',
    });
    expect(placement).toMatchObject({
      folderId: 'folder-Biology',
      replaces: null,
    });
    expect(placement.behavior?.attemptLimit).toBe(3);
    expect(
      await screen.findByText('1 item saved to your library.')
    ).toBeInTheDocument();
  });

  it('updates the earlier copy in place, keeping its id', async () => {
    const earlier = {
      id: 'old-quiz',
      title: 'Old copy',
      driveFileId: 'drive-1',
      sourceKey: 'schoology:testQuiz:1',
    };
    const quizzes = target({
      existing: [earlier],
      load: vi.fn(() =>
        Promise.resolve({
          id: 'old-quiz',
          title: 'Old copy',
          questions: [],
          stimuli: [
            { id: 'slot-pic', type: 'image', url: 'u1', label: 'Map' },
            { id: 'old-q-pic', type: 'image', url: 'u2', label: 'Old' },
          ],
          bankSlots: [
            { id: 's1', bankId: 'b1', count: 1, stimulusIds: ['slot-pic'] },
          ],
          createdAt: 1,
          updatedAt: 1,
        } as unknown as QuizData)
      ),
    });
    setup([item('testQuiz', '1', 'Unit 1 Quiz', ['Biology'])], { quizzes });
    expect(
      screen.getByText(/You brought this in before as “Old copy”/)
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Save 1 item/ }));
    await waitFor(() => expect(quizzes.save).toHaveBeenCalled());
    const [saved, placement] = vi.mocked(quizzes.save).mock.calls[0];
    expect(saved.id).toBe('old-quiz');
    expect(saved.title).toBe('Unit 1 Quiz');
    expect(saved.stimuli?.map((st) => st.id)).toEqual(['slot-pic']);
    expect(placement).toEqual({ folderId: null, replaces: earlier });
    expect(quizzes.createFolder).not.toHaveBeenCalled();
  });

  it('saves a bank into the bank library and keeps a failed item for retry', async () => {
    const banks = target({
      save: vi
        .fn()
        .mockRejectedValueOnce(new Error('Drive down'))
        .mockResolvedValue(undefined),
    });
    const props = setup(
      [item('questionBank', '9', 'Cells bank', ['Resources'])],
      {
        banks,
      }
    );
    fireEvent.click(screen.getByRole('button', { name: /Save 1 item/ }));
    expect(
      await screen.findByText('1 item couldn’t be saved:')
    ).toBeInTheDocument();
    expect(props.removeItem).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry failed' }));
    await waitFor(() =>
      expect(props.removeItem).toHaveBeenCalledWith('questionBank_9')
    );
    expect(banks.createFolder).toHaveBeenCalledTimes(1);
    expect(props.quizzes.save).not.toHaveBeenCalled();
  });

  it('discards an entry without saving it', () => {
    const props = setup([item('assessment', '4', 'Unit test', [])]);
    fireEvent.click(screen.getByRole('button', { name: 'Discard Unit test' }));
    expect(props.removeItem).toHaveBeenCalledWith('assessment_4');
    expect(props.quizzes.save).not.toHaveBeenCalled();
  });
});
