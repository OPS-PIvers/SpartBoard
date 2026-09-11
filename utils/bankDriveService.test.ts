import { describe, it, expect, vi } from 'vitest';
import type { QuestionBankData, QuizData } from '@/types';
import type { QuizDriveLike } from './mockQuizDriveService';
import { BankDriveService } from './bankDriveService';

function fakeDrive(store: Map<string, QuizData>) {
  const saveQuiz = vi.fn((quiz: QuizData, existingFileId?: string) => {
    const id = existingFileId ?? `file-${store.size + 1}`;
    store.set(id, JSON.parse(JSON.stringify(quiz)) as QuizData);
    return Promise.resolve(id);
  });
  const loadQuiz = vi.fn((fileId: string) => {
    const data = store.get(fileId);
    return data ? Promise.resolve(data) : Promise.reject(new Error('missing'));
  });
  const deleteQuizFile = vi.fn((fileId: string) => {
    store.delete(fileId);
    return Promise.resolve();
  });
  const drive: QuizDriveLike = {
    saveQuiz,
    loadQuiz,
    deleteQuizFile,
    importFromGoogleSheet: vi.fn(),
    createQuizTemplate: vi.fn(),
    createVideoActivityTemplate: vi.fn(),
  };
  return { drive, saveQuiz, deleteQuizFile };
}

const bank: QuestionBankData = {
  id: 'bank-1',
  title: 'Bank',
  questions: [],
  targets: [{ id: 't1', kind: 'personal', label: 'T1' }],
  createdAt: 1,
  updatedAt: 2,
};

describe('BankDriveService', () => {
  it('round-trips targets through the quiz Drive service', async () => {
    const store = new Map<string, QuizData>();
    const { drive, saveQuiz } = fakeDrive(store);
    const svc = new BankDriveService(drive);
    const id = await svc.saveBank(bank);
    expect(saveQuiz).toHaveBeenCalledWith(
      expect.objectContaining({ targets: bank.targets }),
      undefined
    );
    const loaded = await svc.loadBank(id);
    expect(loaded.targets).toEqual(bank.targets);
    expect(loaded.questions).toEqual([]);
  });

  it('reuses the existing file id and deletes through the wrapper', async () => {
    const store = new Map<string, QuizData>();
    const { drive, deleteQuizFile } = fakeDrive(store);
    const svc = new BankDriveService(drive);
    expect(await svc.saveBank(bank, 'file-x')).toBe('file-x');
    await svc.deleteBankFile('file-x');
    expect(deleteQuizFile).toHaveBeenCalledWith('file-x');
    await expect(svc.loadBank('file-x')).rejects.toThrow('missing');
  });
});
