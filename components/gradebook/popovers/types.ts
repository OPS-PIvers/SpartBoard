import type {
  FinalScore,
  GradebookColumnConfig,
  GradebookKind,
  GradebookMark,
  GradebookSettingsBody,
  GradeIndexRow,
} from '@/utils/gradebook/gradebookCore';

export interface GradebookStudentRef {
  uid: string;
  /** Display name in the grid's current name format. */
  name: string;
}

export interface GradebookColumnRef {
  sessionId: string;
  kind: GradebookKind;
  title: string;
  dueAt: number | null;
  closeAt: number | null;
  /** The `gradebook_columns` doc, or null before the teacher saves one. */
  config: GradebookColumnConfig | null;
}

export interface GradebookCellData {
  student: GradebookStudentRef;
  row: GradeIndexRow | null;
  mark: GradebookMark | null;
  final: FinalScore;
}

export interface GradebookPopoverContext {
  rosterId: string;
  /** The class's effective settings set (personal, PLC or district). */
  settings: GradebookSettingsBody;
  now: number;
}
