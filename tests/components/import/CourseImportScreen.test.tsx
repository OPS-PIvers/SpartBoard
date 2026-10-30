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

const readCourse = vi.hoisted(() => vi.fn());
vi.mock('@/components/import/course/readCourse', () => ({
  readCourseExport: readCourse,
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
  suggestTitle: () => 'Cell set',
  save: vi.fn().mockResolvedValue(undefined),
};

const makeApi = (over: Partial<CourseImportApi> = {}): CourseImportApi => ({
  save: vi.fn().mockResolvedValue(undefined),
  reviewAdapter: vi.fn(() => adapter),
  confirm: vi.fn().mockResolvedValue(true),
  createLinksBoard: vi.fn().mockResolvedValue(true),
  isDuplicate: () => false,
  canUploadPictures: true,
  access: { target: () => true, ai: true, drive: true },
  ...over,
});

const file = new File(['x'], 'biology.imscc');

describe('CourseImportScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readCourse.mockResolvedValue(course);
  });

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

  it('reads each AI page once, even though a save also closes the review', async () => {
    const parse = vi.fn().mockResolvedValue({
      data: { cards: [] },
      warnings: [],
    });
    const api = makeApi({
      reviewAdapter: vi.fn(() => ({ ...adapter, parse })),
    });
    const twoPages: ReadCourse = {
      ...course,
      materials: [
        ...course.materials,
        { id: 'p2', kind: 'page', title: 'More', folderPath: [], text: 'x' },
      ],
    };
    readCourse.mockResolvedValueOnce(twoPages);
    render(<CourseImportScreen file={file} api={api} onClose={vi.fn()} />);
    fireEvent.change(await screen.findByLabelText('Import Reading as'), {
      target: { value: 'flashcards' },
    });
    fireEvent.change(screen.getByLabelText('Import More as'), {
      target: { value: 'flashcards' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Import 5 items/ }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Review pages' })
    );
    await screen.findByText('AI preview');
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(
      await screen.findByRole('button', { name: /Save to library/ })
    );
    await waitFor(() => expect(parse).toHaveBeenCalledTimes(2));
    await screen.findByText('AI preview');
    expect(parse).toHaveBeenCalledTimes(2);
  });

  it('keeps listing a row that fails again on retry', async () => {
    const save = vi.fn().mockRejectedValue(new Error('Drive down'));
    render(
      <CourseImportScreen
        file={file}
        api={makeApi({ save })}
        onClose={vi.fn()}
      />
    );
    fireEvent.click(await screen.findByRole('button', { name: /Import 3/ }));
    await screen.findByText(/2 items couldn’t be saved/);
    fireEvent.click(screen.getByRole('button', { name: 'Retry failed' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(4));
    expect(
      await screen.findByText(/2 items couldn’t be saved/)
    ).toBeInTheDocument();
  });

  it('stops the batch when a review is closed, keeping later pages queued', async () => {
    const parse = vi.fn(() => new Promise(() => undefined));
    const api = makeApi({
      reviewAdapter: vi.fn(() => ({ ...adapter, parse })),
    });
    readCourse.mockResolvedValueOnce({
      ...course,
      materials: [
        ...course.materials,
        { id: 'p2', kind: 'page', title: 'More', folderPath: [], text: 'x' },
      ],
    });
    render(<CourseImportScreen file={file} api={api} onClose={vi.fn()} />);
    fireEvent.change(await screen.findByLabelText('Import Reading as'), {
      target: { value: 'flashcards' },
    });
    fireEvent.change(screen.getByLabelText('Import More as'), {
      target: { value: 'flashcards' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Import 5 items/ }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Review pages' })
    );
    await screen.findByText(/Reading “Reading” with AI/);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(
      await screen.findByText(/1 page to make with AI/)
    ).toBeInTheDocument();
    expect(parse).toHaveBeenCalledTimes(1);
  });
});
