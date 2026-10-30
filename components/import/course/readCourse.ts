import {
  readCartridgeBanks,
  readCourseMaterials,
} from '@/utils/quizDocumentImport';
import { titleFromFileName } from '@/utils/quizDocumentImport/fileKind';
import { fetchImageThroughServer } from '@/utils/quizDocumentImport/remoteImageFetcher';
import type { ReadCourse } from './courseImportApi';

/** Every quiz, bank, page, file, link and discussion in a Schoology course export. */
export async function readCourseExport(file: File): Promise<ReadCourse> {
  const fallback = titleFromFileName(file.name);
  const options = {
    multiAnswer: true,
    fetchRemoteImage: fetchImageThroughServer,
  };
  const [tests, banks, materials] = await Promise.all([
    readCartridgeBanks(file, fallback, { ...options, read: 'tests' }),
    readCartridgeBanks(file, fallback, { ...options, read: 'banks' }),
    readCourseMaterials(file, fallback),
  ]);
  return {
    title: materials.title,
    tests: tests.banks,
    banks: banks.banks,
    materials: materials.materials,
  };
}
