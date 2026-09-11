import type { QuestionBankData, QuizData } from '@/types';
import type { QuizDriveLike } from '@/utils/mockQuizDriveService';

/** Drive surface for question banks; bank JSON is QuizData-compatible and lives in the quiz folder. */
export interface BankDriveLike {
  saveBank(bank: QuestionBankData, existingFileId?: string): Promise<string>;
  loadBank(fileId: string): Promise<QuestionBankData>;
  deleteBankFile(fileId: string): Promise<void>;
}

/** Thin wrapper: the quiz service saves the whole object, so `targets` round-trips. */
export class BankDriveService implements BankDriveLike {
  constructor(private readonly drive: QuizDriveLike) {}

  saveBank(bank: QuestionBankData, existingFileId?: string): Promise<string> {
    const payload: QuizData = { ...bank };
    return this.drive.saveQuiz(payload, existingFileId);
  }

  async loadBank(fileId: string): Promise<QuestionBankData> {
    const data = (await this.drive.loadQuiz(fileId)) as QuestionBankData;
    return { ...data, questions: data.questions ?? [] };
  }

  deleteBankFile(fileId: string): Promise<void> {
    return this.drive.deleteQuizFile(fileId);
  }
}
