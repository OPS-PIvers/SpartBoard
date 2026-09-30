import { createContext, useContext } from 'react';
import type { ClassRoster, Student } from '@/types';
import type {
  FinalScore,
  GradebookClassStateDoc,
  GradebookColumnConfig,
  GradebookComment,
  GradebookHistoryField,
  GradebookMark,
  GradebookOverride,
  GradebookSettingsBody,
  GradebookSort,
  GradeIndexRow,
  GradingPeriod,
  OverallResult,
  ProficiencyScale,
} from '@/utils/gradebook/gradebookCore';
import type {
  CellFormat,
  GradebookColumn,
  NameFormat,
} from '@/utils/gradebook/gradebookModel';

export type { GradebookColumn } from '@/utils/gradebook/gradebookModel';

export interface GradebookStudentRow {
  uid: string;
  firstName: string;
  lastName: string;
  displayName: string;
  missing: number;
  student: Student;
}

export interface GradebookCell {
  sessionId: string;
  studentUid: string;
  row: GradeIndexRow | null;
  mark: GradebookMark | null;
  final: FinalScore;
  published: boolean;
}

export interface GradebookViewState {
  cellFormat: CellFormat;
  nameFormat: NameFormat;
  tint: boolean;
  sort: GradebookSort;
}

export interface GradebookFilters {
  categoryId: string | null;
  kind: string | null;
  needsGrading: boolean;
}

export interface MarkPatch {
  override?: GradebookOverride | null;
  comment?: GradebookComment | null;
  flags?: string[];
  suppressedAuto?: string[];
  publishOverride?: 'published' | 'unpublished' | null;
}

export interface GradebookMarkWriter {
  update: (
    sessionId: string,
    studentUid: string,
    patch: MarkPatch,
    opts?: { field?: GradebookHistoryField; label?: string }
  ) => Promise<void>;
  bulk: (
    items: { sessionId: string; studentUid: string; patch: MarkPatch }[],
    opts: { field: GradebookHistoryField; label: string }
  ) => Promise<void>;
  toggleFlag: (
    sessionId: string,
    studentUid: string,
    flagId: string
  ) => Promise<void>;
  undo: () => Promise<void>;
  canUndo: boolean;
}

export type GradebookPopover =
  | {
      type: 'cell';
      sessionId: string;
      studentUid: string;
      prefill: string | null;
    }
  | { type: 'header'; sessionId: string }
  | null;

export interface GradebookContextValue {
  rosterId: string;
  roster: ClassRoster;
  /** Gradebook-eligible rosters only (D8). */
  rosters: ClassRoster[];
  status: 'loading' | 'ready' | 'error';
  settings: GradebookSettingsBody;
  scale: ProficiencyScale;
  classState: GradebookClassStateDoc | null;
  periods: GradingPeriod[];
  /** Selected grading period id, or null for all periods. */
  periodId: string | null;
  setPeriodId: (id: string | null) => void;
  students: GradebookStudentRow[];
  /** Visible columns: period, filters and not hidden, oldest to newest. */
  columns: GradebookColumn[];
  /** Every column for the class, any period, including hidden ones. */
  allColumns: GradebookColumn[];
  getCell: (sessionId: string, studentUid: string) => GradebookCell;
  overall: (studentUid: string) => OverallResult;
  now: number;
  privacy: boolean;
  setPrivacy: (on: boolean) => void;
  view: GradebookViewState;
  setView: (patch: Partial<GradebookViewState>) => void;
  /** Merges card layouts (student view, analysis) into the class state doc. */
  saveCardLayouts: (patch: Record<string, string[]>) => Promise<void>;
  filters: GradebookFilters;
  setFilters: (patch: Partial<GradebookFilters>) => void;
  marks: GradebookMarkWriter;
  updateColumn: (
    sessionId: string,
    patch: Partial<GradebookColumnConfig>
  ) => Promise<void>;
  popover: GradebookPopover;
  openCell: (sessionId: string, studentUid: string, prefill?: string) => void;
  openHeader: (sessionId: string) => void;
  closePopover: () => void;
  toast: (message: string, undo?: () => void) => void;
}

export const GradebookContext = createContext<GradebookContextValue | null>(
  null
);

export function useGradebook(): GradebookContextValue {
  const ctx = useContext(GradebookContext);
  if (!ctx) throw new Error('useGradebook must be used inside the gradebook');
  return ctx;
}
