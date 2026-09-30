// Props shared with the popover slice (PR #3644 `popovers/types.ts`); swap to its import when it lands.
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
  name: string;
}

export interface GradebookColumnRef {
  sessionId: string;
  kind: GradebookKind;
  title: string;
  dueAt: number | null;
  closeAt: number | null;
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
  settings: GradebookSettingsBody;
  now: number;
}
