import type { ImportAdapter } from '@/components/common/library/types';
import type { CartridgeBank, CourseMaterial } from '@/utils/quizDocumentImport';
import type {
  CourseRow,
  CourseRowAccess,
  CourseRowTarget,
} from '@/utils/import/coursePlan';

/** A course export, read: its quizzes, banks and other materials. */
export interface ReadCourse {
  title: string;
  tests: CartridgeBank[];
  banks: CartridgeBank[];
  materials: CourseMaterial[];
}

/** What the course checklist needs from the app; the host wires it to the libraries. */
export interface CourseImportApi {
  /** Saves one parser row into its library under `courseName`; links aren't saved here. */
  save: (
    row: CourseRow,
    target: Exclude<CourseRowTarget, 'skip' | 'links'>,
    courseName: string,
    withPictures: boolean
  ) => Promise<void>;
  /** A review adapter for one AI row, already holding where it saves. */
  reviewAdapter: (
    row: CourseRow,
    target: 'flashcards' | 'activityWall',
    courseName: string
  ) => ImportAdapter<unknown>;
  /** View as: asks before writing or running AI as someone else; false stops it. */
  confirm: (label: string) => Promise<boolean>;
  /** Makes a board named after the course holding one Links widget. */
  createLinksBoard: (
    courseName: string,
    links: readonly { url: string; title: string }[]
  ) => Promise<boolean>;
  /** Titles already in each library, to mark rows already imported. */
  isDuplicate: (
    row: CourseRow,
    target: CourseRowTarget,
    courseName: string
  ) => boolean;
  canUploadPictures: boolean;
  /** Which targets this teacher may pick. */
  access: CourseRowAccess;
}
