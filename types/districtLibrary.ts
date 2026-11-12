// District library (docs/plans/QUIZ_MCA_PRACTICE.md M26-M31).

export type DistrictLibraryKind = 'quiz' | 'bank';

/** Drafts are admin-only; published items reach the teachers they target. */
export type DistrictLibraryStatus = 'draft' | 'published';

/** Who an item reaches. Building ids are stored with their legacy aliases. */
export interface DistrictLibraryTargeting {
  everyone: boolean;
  targetBuildings: string[];
  /** 'K' and '1'..'12'. */
  targetGrades: string[];
  /** Lowercased staff emails. */
  targetEmails: string[];
}

/** Teacher-only extras a package carries per question. */
export interface DistrictLibraryQuestionNote {
  attribution?: string;
  resultsPictureUrl?: string;
}

/** `district_library/{itemId}`; content lives in `synced_quizzes` or `synced_question_banks` at `syncGroupId`. */
export interface DistrictLibraryItem extends DistrictLibraryTargeting {
  id: string;
  kind: DistrictLibraryKind;
  title: string;
  description?: string;
  tags?: string[];
  questionCount: number;
  status: DistrictLibraryStatus;
  /** Buildings whose grade bands include a targeted grade; matches teachers who picked no grades. */
  gradeBuildings: string[];
  syncGroupId: string;
  /** The canonical doc's `version` after the last admin write. */
  contentVersion: number;
  packageTitle?: string;
  packageGeneratedAt?: number;
  sourceName?: string;
  /** Keyed by question id. */
  questionNotes?: Record<string, DistrictLibraryQuestionNote>;
  createdAt: number;
  updatedAt: number;
  updatedBy: string;
  /** District folder; absent means the top level. */
  folderId?: string;
  /** True when the item keeps its own audience instead of its folder's. */
  ownTargeting?: boolean;
}

/** One folder in `district_library_index/folders`; names only, so any staff member may read it. */
export interface DistrictLibraryFolder {
  name: string;
  parentId: string | null;
  order: number;
}

export interface DistrictLibraryFolders {
  folders: Record<string, DistrictLibraryFolder>;
  updatedAt: number;
}

/** `district_library_index/audiences`: each folder's audience; admins only, since it names teachers. */
export interface DistrictLibraryFolderAudiences {
  folders: Record<
    string,
    DistrictLibraryTargeting & { gradeBuildings: string[] }
  >;
  updatedAt: number;
}

/** One published item in `district_library_index/published`: targeting without names. */
export interface DistrictLibraryIndexEntry {
  everyone: boolean;
  targetBuildings: string[];
  targetGrades: string[];
  gradeBuildings: string[];
}

export interface DistrictLibraryIndex {
  items: Record<string, DistrictLibraryIndexEntry>;
  updatedAt: number;
}

/** `users/{uid}/district_links/{itemId}`: a District library bank the teacher added. */
export interface DistrictLibraryBankLink {
  itemId: string;
  kind: 'bank';
  syncGroupId: string;
  /** Owner of the synced bank doc; bank slots pin to it. */
  ownerUid: string;
  title: string;
  questionCount: number;
  targetIds: string[];
  addedAt: number;
  /** The teacher's own Quiz library folder; absent keeps it in the District library folder. */
  folderId?: string;
}

/** A link as the teacher sees it; `unavailable` is computed on read and never stored. */
export interface DistrictBankLinkView extends DistrictLibraryBankLink {
  unavailable?: boolean;
}

/** What a teacher's profile says about where they teach. */
export interface DistrictLibraryViewer {
  email: string;
  buildings: readonly string[];
  grades: readonly string[];
}
