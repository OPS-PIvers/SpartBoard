import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { useFolders } from '@/hooks/useFolders';
import { useQuiz } from '@/hooks/useQuiz';
import { useQuestionBanks } from '@/hooks/useQuestionBanks';
import { useFlashcardSets } from '@/hooks/useFlashcardSets';
import { useActivityWallLibrary } from '@/hooks/useActivityWallLibrary';
import { useGoogleDrive } from '@/hooks/useGoogleDrive';
import { useStorage, MAX_PDF_SIZE_BYTES } from '@/hooks/useStorage';
import { useViewAsOutward } from '@/hooks/useViewAsOutward';
import { useImportConversionSettings } from '@/hooks/useImportConversionSettings';
import { WIDGET_DEFAULTS } from '@/config/widgetDefaults';
import type { LibraryFolder, QuizData } from '@/types';
import { createFlashcardImportAdapter } from '@/components/widgets/Flashcards/adapters/flashcardImportAdapter';
import {
  buildImportedWall,
  createActivityWallImportAdapter,
} from '@/components/widgets/ActivityWall/adapters/activityWallImportAdapter';
import { resolveActivityWallBuildingDefaults } from '@/components/widgets/ActivityWall/buildingDefaults';
import type { ImportAdapter } from '@/components/common/library/types';
import {
  attachDocumentImages,
  courseFileReader,
  driveStimulusUploader,
  extractedToQuizData,
  type CartridgeBank,
} from '@/utils/quizDocumentImport';
import { ensureFolderPath } from '@/utils/cartridgeBankImport';
import { UNIVERSAL_IMPORT_FEATURE } from '@/utils/import/contract';
import { isDuplicate, type CourseRow } from '@/utils/import/coursePlan';
import type { CourseImportApi } from './courseImportApi';
import { CourseImportScreen } from './CourseImportScreen';

const BOARD_WAIT_MS = 2000;

const nextFrame = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

type FolderLibrary = 'quiz' | 'question_bank' | 'flashcards';

const quizFromBank = (bank: CartridgeBank): QuizData =>
  extractedToQuizData(
    { title: bank.title, questions: bank.questions, images: [], warnings: [] },
    { title: bank.title }
  );

/** Wires the course checklist to the teacher's libraries; mounted only while it is open. */
export const CourseImportHost: React.FC<{
  file: File;
  onClose: () => void;
}> = ({ file, onClose }) => {
  const {
    user,
    canAccessWidget,
    canAccessFeature,
    featurePermissions,
    selectedBuildings,
  } = useAuth();
  const dashboard = useDashboard();
  const uid = user?.uid;
  const { driveService } = useGoogleDrive();
  const { quizzes, saveQuiz } = useQuiz(uid);
  const { banks, saveBank } = useQuestionBanks(uid);
  const { saveSet } = useFlashcardSets(uid);
  const { saveActivity } = useActivityWallLibrary(uid);
  const { uploadAndRegisterPdf } = useStorage();
  const outward = useViewAsOutward();
  const conversion = useImportConversionSettings();
  const quizFolders = useFolders(uid, 'quiz');
  const bankFolders = useFolders(uid, 'question_bank');
  const flashcardFolders = useFolders(uid, 'flashcards');

  // Saves run across many renders; they read the newest hook values through this.
  const latest = useRef({
    dashboard,
    quizFolders,
    bankFolders,
    flashcardFolders,
  });
  useLayoutEffect(() => {
    latest.current = { dashboard, quizFolders, bankFolders, flashcardFolders };
  });
  const madeFolders = useRef(new Map<FolderLibrary, Map<string, string>>());
  // One folder made at a time, so rows sharing a new folder never make it twice.
  const folderChain = useRef<Promise<unknown>>(Promise.resolve());

  const wallDefaults = useMemo(
    () =>
      resolveActivityWallBuildingDefaults(
        featurePermissions,
        selectedBuildings
      ),
    [featurePermissions, selectedBuildings]
  );

  const api = useMemo<CourseImportApi>(() => {
    const foldersOf = (library: FolderLibrary) => {
      const now = latest.current;
      return library === 'quiz'
        ? now.quizFolders
        : library === 'question_bank'
          ? now.bankFolders
          : now.flashcardFolders;
    };
    const folderFor = (
      library: FolderLibrary,
      path: readonly string[]
    ): Promise<string | null> => {
      const run = folderChain.current.then(() => {
        const tree = foldersOf(library);
        let made = madeFolders.current.get(library);
        if (!made) {
          made = new Map();
          madeFolders.current.set(library, made);
        }
        return ensureFolderPath(path, tree.folders, tree.createFolder, made);
      });
      folderChain.current = run.catch(() => undefined);
      return run;
    };
    const pathFor = (row: CourseRow, courseName: string) => [
      courseName,
      ...row.path.slice(1),
    ];
    const uploader = driveStimulusUploader({
      uploadFile: (blob, name, folder) => {
        if (!driveService) throw new Error('Google Drive is not connected.');
        return driveService.uploadFile(blob, name, folder);
      },
      makePublic: (id, domain) => {
        if (!driveService) throw new Error('Google Drive is not connected.');
        return driveService.makePublic(id, domain);
      },
      deleteFile: async (id) => {
        await driveService?.deleteFile(id);
      },
    });
    const readFile = courseFileReader(file);

    const flashcardAdapter = (folderPath: readonly string[]) =>
      createFlashcardImportAdapter({
        loadSheet: () => Promise.resolve([]),
        pickSheet: () => Promise.resolve(null),
        save: async (cards, title) => {
          const folderId = await folderFor('flashcards', folderPath);
          const now = Date.now();
          await saveSet({
            id: crypto.randomUUID(),
            title: title.trim(),
            description: '',
            termLanguage: 'en-US',
            definitionLanguage: 'en-US',
            cards,
            folderId,
            createdAt: now,
            updatedAt: now,
          });
        },
      });

    const libraryFolders = (library: FolderLibrary): readonly LibraryFolder[] =>
      foldersOf(library).folders;

    return {
      save: async (row, target, courseName, withPictures) => {
        const path = pathFor(row, courseName);
        if (target === 'quiz' || target === 'questionBank') {
          if (!row.bank) throw new Error('Nothing to save.');
          const quiz = await attachDocumentImages(
            quizFromBank(row.bank),
            withPictures ? row.bank.images : [],
            uploader
          );
          if (target === 'quiz') {
            const folderId = await folderFor('quiz', path);
            const meta = await saveQuiz(quiz);
            if (folderId) await quizFolders.moveItem(meta.id, folderId);
            return;
          }
          const folderId = await folderFor('question_bank', path);
          await saveBank(
            {
              id: crypto.randomUUID(),
              title: quiz.title,
              questions: quiz.questions,
              ...(quiz.stimuli ? { stimuli: quiz.stimuli } : {}),
              createdAt: quiz.createdAt,
              updatedAt: quiz.updatedAt,
            },
            undefined,
            folderId ? { folderId } : undefined
          );
          return;
        }
        if (target === 'activityWall') {
          const text = row.material?.text?.trim() ?? '';
          const prompt = text.length > 0 ? text : row.title;
          await saveActivity(
            buildImportedWall(
              { title: row.title, prompt, layout: 'wall', sections: [] },
              row.title,
              wallDefaults
            )
          );
          return;
        }
        if (target === 'pdf') {
          if (!uid || !row.material) throw new Error('Nothing to save.');
          const pdf = await readFile(row.material, MAX_PDF_SIZE_BYTES);
          await uploadAndRegisterPdf(uid, pdf);
          return;
        }
        throw new Error(`Can’t save to ${target} yet.`);
      },
      reviewAdapter: (row, target, courseName) => {
        const path = pathFor(row, courseName);
        if (target === 'flashcards')
          return flashcardAdapter(path) as ImportAdapter<unknown>;
        return createActivityWallImportAdapter({
          defaults: wallDefaults,
          save: saveActivity,
        }) as ImportAdapter<unknown>;
      },
      confirmAi: () =>
        outward.active
          ? outward.confirm('Import with AI')
          : Promise.resolve(true),
      createLinksBoard: async (courseName, links) => {
        const { collectionsApi, createNewDashboard } = latest.current.dashboard;
        const name = courseName.trim();
        const existing = collectionsApi.collections.find(
          (c) =>
            !c.parentCollectionId &&
            c.name.trim().toLowerCase() === name.toLowerCase()
        );
        let collectionId: string | null = existing?.id ?? null;
        if (!collectionId) {
          try {
            collectionId = await collectionsApi.createCollection(name, null);
          } catch (err) {
            console.error('[CourseImport] collection create failed', err);
          }
        }
        const id = await createNewDashboard(name, undefined, {
          collectionId,
        });
        const deadline = performance.now() + BOARD_WAIT_MS;
        while (
          id &&
          latest.current.dashboard.activeDashboard?.id !== id &&
          performance.now() < deadline
        ) {
          await nextFrame();
        }
        if (!id || latest.current.dashboard.activeDashboard?.id !== id) {
          if (id)
            latest.current.dashboard.addToast(
              'The board could not be opened. Try again.',
              'error'
            );
          return false;
        }
        latest.current.dashboard.addWidget('url', {
          config: {
            ...WIDGET_DEFAULTS.url.config,
            urls: links.map((link) => ({
              id: crypto.randomUUID(),
              url: link.url,
              title: link.title,
            })),
          },
        });
        return true;
      },
      isDuplicate: (row, target, courseName) => {
        const path = pathFor(row, courseName);
        if (target === 'quiz')
          return isDuplicate(path, row.title, quizzes, libraryFolders('quiz'));
        if (target === 'questionBank')
          return isDuplicate(
            path,
            row.title,
            banks,
            libraryFolders('question_bank')
          );
        return false;
      },
      canUploadPictures: !!driveService,
      access: {
        target: (target) => {
          switch (target) {
            case 'quiz':
            case 'questionBank':
              return canAccessWidget('quiz');
            case 'flashcards':
              return canAccessWidget('flashcards');
            case 'activityWall':
              return canAccessWidget('activity-wall');
            case 'pdf':
              return canAccessWidget('pdf');
            case 'links':
              return canAccessWidget('url');
          }
        },
        ai:
          canAccessFeature(UNIVERSAL_IMPORT_FEATURE) &&
          conversion.enabled &&
          !outward.locked,
        drive: !!driveService,
      },
    };
  }, [
    file,
    uid,
    driveService,
    quizzes,
    banks,
    saveQuiz,
    saveBank,
    saveSet,
    saveActivity,
    uploadAndRegisterPdf,
    wallDefaults,
    outward,
    conversion.enabled,
    canAccessWidget,
    canAccessFeature,
    quizFolders,
  ]);

  return <CourseImportScreen file={file} api={api} onClose={onClose} />;
};
