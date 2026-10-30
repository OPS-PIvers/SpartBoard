import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReadCourse } from '@/components/import/course/courseImportApi';
import type { CourseImportApi } from '@/components/import/course/courseImportApi';
import type { ImportAdapter } from '@/components/common/library/types';
import type { ExtractedQuestion } from '@/utils/quizDocumentImport/types';

const course: ReadCourse = {
  title: 'Biology',
  tests: [
    {
      id: 't1',
      title: 'Cells quiz',
      folderPath: ['Unit 1'],
      questions: [{ number: 1, text: 'Q' } as unknown as ExtractedQuestion],
      images: [],
    },
  ],
  banks: [],
  materials: [
    {
      id: 'd1',
      kind: 'discussion',
      title: 'Cells at home',
      folderPath: ['Unit 1'],
      text: 'Where do you see cells?',
    },
    {
      id: 'l1',
      kind: 'link',
      title: 'Cells Alive',
      folderPath: [],
      url: 'https://www.cellsalive.com/',
    },
    {
      id: 'p1',
      kind: 'page',
      title: 'Reading',
      folderPath: [],
      text: 'Cells are the unit of life.',
    },
  ],
};

vi.mock('@/components/import/course/readCourse', () => ({
  readCourseExport: () => Promise.resolve(course),
}));

import { CourseImportScreen } from '@/components/import/course/CourseImportScreen';

const adapter: ImportAdapter<unknown> = {
  widgetLabel: 'Flashcards',
  supportedSources: [],
  parse: () =>
    Promise.resolve({
      data: { cards: [] },
      warnings: [],
      note: 'Made with AI',
    }),
  validate: () => ({ ok: true, errors: [] }),
  renderPreview: () => <p>AI preview</p>,
  save: vi.fn().mockResolvedValue(undefined),
};

const makeApi = (over: Partial<CourseImportApi> = {}): CourseImportApi => ({
  save: vi.fn().mockResolvedValue(undefined),
  reviewAdapter: vi.fn(() => adapter),
  confirmAi: vi.fn().mockResolvedValue(true),
  createLinksBoard: vi.fn().mockResolvedValue(true),
  isDuplicate: () => false,
  canUploadPictures: true,
  access: { target: () => true, ai: true, drive: true },
  ...over,
});

const file = new File(['x'], 'biology.imscc');

describe('CourseImportScreen', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists items under their folders with a guessed target each', async () => {
    render(
      <CourseImportScreen file={file} api={makeApi()} onClose={vi.fn()} />
    );
    expect(
      await screen.findByLabelText('Import Cells quiz as')
    ).toHaveDisplayValue('Quiz');
    expect(screen.getByLabelText('Import Cells at home as')).toHaveDisplayValue(
      'Activity Wall'
    );
    expect(screen.getByLabelText('Import Reading as')).toHaveDisplayValue(
      'Skip'
    );
    expect(screen.getByText('Biology › Unit 1')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Biology')).toBeInTheDocument();
  });

  it('saves parser rows, then offers the links board and the AI reviews', async () => {
    const api = makeApi();
    render(<CourseImportScreen file={file} api={api} onClose={vi.fn()} />);
    fireEvent.change(await screen.findByLabelText('Import Reading as'), {
      target: { value: 'flashcards' },
    });
    expect(
      screen.getByText('Converting with AI counts toward your daily AI limit.')
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Import 4 items/ }));

    await screen.findByText(/2 items saved/);
    expect(api.save).toHaveBeenCalledTimes(2);
    expect(api.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'quiz:t1' }),
      'quiz',
      'Biology',
      true
    );
    expect(api.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'discussion:d1' }),
      'activityWall',
      'Biology',
      true
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Put these links on a new board' })
    );
    await waitFor(() =>
      expect(api.createLinksBoard).toHaveBeenCalledWith('Biology', [
        { url: 'https://www.cellsalive.com/', title: 'Cells Alive' },
      ])
    );
    await screen.findByText('The board is ready.');

    fireEvent.click(screen.getByRole('button', { name: 'Review pages' }));
    await screen.findByText('AI preview');
    expect(api.reviewAdapter).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'page:p1' }),
      'flashcards',
      'Biology'
    );
  });

  it('starts a duplicate on Skip', async () => {
    render(
      <CourseImportScreen
        file={file}
        api={makeApi({ isDuplicate: (row) => row.kind === 'quiz' })}
        onClose={vi.fn()}
      />
    );
    expect(
      await screen.findByLabelText('Import Cells quiz as')
    ).toHaveDisplayValue('Skip');
    expect(screen.getByText(/Already in your library/)).toBeInTheDocument();
  });

  it('lists a row that failed and retries only it', async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error('Drive down'))
      .mockResolvedValue(undefined);
    const api = makeApi({ save });
    render(<CourseImportScreen file={file} api={api} onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: /Import 3/ }));
    await screen.findByText(/couldn’t be saved/);
    fireEvent.click(screen.getByRole('button', { name: 'Retry failed' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(3));
    await waitFor(() =>
      expect(screen.queryByText(/couldn’t be saved/)).not.toBeInTheDocument()
    );
  });
});
