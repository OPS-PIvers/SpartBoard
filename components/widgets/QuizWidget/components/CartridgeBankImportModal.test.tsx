import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { QuestionBankMetadata, QuizData } from '@/types';
import type {
  CartridgeBank,
  CartridgeBankCollection,
} from '@/utils/quizDocumentImport';
import { CartridgeBankImportModal } from './CartridgeBankImportModal';

const readCartridgeBanks = vi.fn<() => Promise<CartridgeBankCollection>>();
vi.mock('@/utils/quizDocumentImport', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/quizDocumentImport')>()),
  readCartridgeBanks: () => readCartridgeBanks(),
}));

const bank = (
  id: string,
  title: string,
  folderPath: string[],
  count: number
): CartridgeBank => ({
  id,
  title,
  folderPath,
  images: [],
  questions: Array.from({ length: count }, (_, i) => ({
    number: i + 1,
    text: `${title} question ${i + 1}`,
    type: 'MC' as const,
    options: [
      { letter: 'A', text: 'Right' },
      { letter: 'B', text: 'Wrong' },
    ],
    correctAnswer: 'Right',
    imageIds: [],
    warnings: [],
  })),
});

const COLLECTION: CartridgeBankCollection = {
  title: 'World History Tests',
  skippedTests: 2,
  banks: [
    bank('b1', 'Greece', ['Unit 2'], 2),
    bank('b2', 'Rome', ['Unit 2'], 3),
    bank('b3', 'Matching', ['Unit 2'], 0),
  ],
};

const existing = (title: string): QuestionBankMetadata =>
  ({ id: title, title, folderId: 'u2' }) as QuestionBankMetadata;

function setup(
  overrides: Partial<React.ComponentProps<typeof CartridgeBankImportModal>> = {}
) {
  const props: React.ComponentProps<typeof CartridgeBankImportModal> = {
    file: new File(['x'], 'export.imscc'),
    onClose: vi.fn(),
    existingBanks: [],
    folders: [],
    createFolder: vi.fn((name: string) => Promise.resolve(`folder-${name}`)),
    saveBank: vi.fn(() => Promise.resolve({} as QuestionBankMetadata)),
    attachPictures: vi.fn((quiz: QuizData) => Promise.resolve(quiz)),
    canUploadPictures: true,
    multiAnswer: false,
    ...overrides,
  };
  render(<CartridgeBankImportModal {...props} />);
  return props;
}

describe('CartridgeBankImportModal', () => {
  beforeEach(() => {
    readCartridgeBanks.mockReset();
    readCartridgeBanks.mockResolvedValue(COLLECTION);
  });

  it('lists every bank, greys out empty ones, and says tests were skipped', async () => {
    setup();
    expect(await screen.findByText('Greece')).toBeInTheDocument();
    expect(screen.getByLabelText('Import Matching')).toBeDisabled();
    expect(
      screen.getByText(/Schoology can’t export Matching/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/2 quizzes and tests in the export were skipped/)
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Import 2 banks' })
    ).toBeEnabled();
  });

  it('leaves a bank already in the library unticked', async () => {
    setup({
      existingBanks: [existing('Greece')],
      folders: [
        {
          id: 'root',
          name: 'World History Tests',
          parentId: null,
          order: 0,
          createdAt: 0,
        },
        { id: 'u2', name: 'Unit 2', parentId: 'root', order: 0, createdAt: 0 },
      ],
    });
    expect(
      await screen.findByText('Already in your library')
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Import Greece')).not.toBeChecked();
    expect(screen.getByLabelText('Import Rome')).toBeChecked();
  });

  it('shows a bank’s questions on request', async () => {
    setup();
    fireEvent.click(await screen.findByLabelText('Show questions in Rome'));
    expect(screen.getByText('Rome question 3')).toBeInTheDocument();
  });

  it('creates the folder tree once and saves each ticked bank into it', async () => {
    const props = setup();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Import 2 banks' })
    );

    expect(await screen.findByText(/2 banks saved/)).toBeInTheDocument();
    expect(props.createFolder).toHaveBeenCalledTimes(2);
    expect(props.createFolder).toHaveBeenNthCalledWith(
      1,
      'World History Tests',
      null
    );
    expect(props.createFolder).toHaveBeenNthCalledWith(
      2,
      'Unit 2',
      'folder-World History Tests'
    );
    expect(props.saveBank).toHaveBeenCalledTimes(2);
    expect(props.saveBank).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Greece' }),
      undefined,
      { folderId: 'folder-Unit 2' }
    );

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(props.onClose).toHaveBeenCalledWith({ saved: 2, failed: 0 });
  });

  it('keeps the banks that saved and retries only the ones that failed', async () => {
    let failRome = true;
    const saveBank = vi.fn((b: { title: string }) =>
      b.title === 'Rome' && failRome
        ? Promise.reject(new Error('Drive hiccup'))
        : Promise.resolve({} as QuestionBankMetadata)
    );
    setup({ saveBank });
    fireEvent.click(
      await screen.findByRole('button', { name: 'Import 2 banks' })
    );

    expect(
      await screen.findByText(/1 bank couldn’t be saved/)
    ).toBeInTheDocument();
    failRome = false;
    fireEvent.click(screen.getByRole('button', { name: 'Retry failed' }));

    await waitFor(() =>
      expect(screen.getByText(/2 banks saved/)).toBeInTheDocument()
    );
    expect(saveBank).toHaveBeenCalledTimes(3);
  });

  it('shows why an export could not be read', async () => {
    readCartridgeBanks.mockRejectedValue(
      new Error('That doesn’t look like an LMS export.')
    );
    setup();
    expect(await screen.findByRole('alert')).toHaveTextContent('LMS export');
  });
});
