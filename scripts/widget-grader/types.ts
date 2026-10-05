// Shared types for the widget quality rubric (docs/plans/WIDGET_RUBRIC.md).

export type DimensionId =
  | 'layout'
  | 'visual'
  | 'interaction'
  | 'config'
  | 'robustness'
  | 'ecosystem';

export type CriterionId =
  | 'S1'
  | 'S2'
  | 'S3'
  | 'S4'
  | 'S5'
  | 'S6'
  | 'S7'
  | 'S8'
  | 'I1'
  | 'I2'
  | 'I3'
  | 'I4'
  | 'I5'
  | 'I6'
  | 'I7'
  | 'V1'
  | 'V2'
  | 'V3'
  | 'V4'
  | 'V5'
  | 'V6'
  | 'C1'
  | 'C2'
  | 'C3'
  | 'C4'
  | 'C5'
  | 'C6'
  | 'R1'
  | 'R2'
  | 'R3'
  | 'R4'
  | 'R5'
  | 'E1'
  | 'E2'
  | 'E3';

export type GateId = 'G1' | 'G2' | 'G3' | 'G4';

export type Level = 0 | 1 | 2 | 3 | 4;

export type GradeMethod = 'script' | 'judge' | 'both';

export type ScoreSource = 'script' | 'judge' | 'paul';

export type LetterGrade = 'A' | 'B' | 'C' | 'D' | 'F';

export type FixtureName = 'empty' | 'typical' | 'stress';

export type SizeName =
  | 'envelope-min'
  | 'default'
  | 'large-1400x900'
  | 'maximized-1920x1080'
  | 'widest-aspect'
  | 'tallest-aspect';

/** The only rules that may mark a criterion N/A (R15). */
export type ApplicabilityKind =
  | 'all'
  | 'scrollableContent'
  | 'hasControls'
  | 'hasSettings'
  | 'animates'
  | 'holdsTeacherContent'
  | 'showsRosterData';

export interface Applicability {
  applies: ApplicabilityKind;
  rule: string;
}

export interface Criterion {
  id: CriterionId;
  name: string;
  applicability: Applicability;
  method: GradeMethod;
  methodNotes: string;
  /** Keyed by level "0".."4"; levels the plan omits are absent. */
  descriptors: Partial<Record<`${Level}`, string>>;
  thresholds?: Record<string, number | string>;
  banList?: string[];
  budgets?: string[];
  protectedData?: string[];
  proposeOnly?: boolean;
}

export interface Dimension {
  id: DimensionId;
  name: string;
  weight: number;
  criteria: Criterion[];
}

export interface Gate {
  id: GateId;
  name: string;
  method: 'script';
  failsWhen: string;
}

export interface Rubric {
  version: string;
  source: string;
  scale: Record<`${Level}`, string>;
  levelZeroRule: string;
  letterGrades: { letter: LetterGrade; min: number }[];
  gateCap: LetterGrade;
  loopTarget: { minDimensionScore: number; gateFailures: number };
  thresholds: Record<string, number>;
  sizes: SizeName[];
  fixtures: FixtureName[];
  gates: Gate[];
  dimensions: Dimension[];
}

export interface MeasurementSize {
  name: SizeName;
  width: number;
  height: number;
}

/** One scripted observation. `size` and `fixture` are null for static (non-render) measurements. */
export interface Measurement {
  widgetType: string;
  criterionId: CriterionId | null;
  size: MeasurementSize | null;
  fixture: FixtureName | null;
  values: Record<string, number | string | boolean>;
  impliedLevel?: Level | null;
  gate?: GateId;
  pass?: boolean;
}

export interface CriterionEvidence {
  measurements?: Measurement[];
  /** Paths or run-id references; screenshots are never committed. */
  screenshots?: string[];
  runId?: string;
}

export interface CriterionScore {
  /** The official score; null means N/A by the applicability rule. */
  score: Level | null;
  source: ScoreSource;
  /** Per-source scores kept for disagreement review; `score` is the winner (R2). */
  candidates?: Partial<Record<ScoreSource, Level | null>>;
  evidence?: CriterionEvidence;
  note?: string;
  rubricVersion: string;
  gradedAt: string;
  stale: boolean;
}

export interface GateResult {
  pass: boolean;
  evidence?: CriterionEvidence;
  gradedAt: string;
}

export interface Scorecard {
  $schema?: string;
  widgetType: string;
  rubricVersion: string;
  gradedAt: string | null;
  stale: boolean;
  /** Criteria not yet graded are absent. */
  criteria: Partial<Record<CriterionId, CriterionScore>>;
  /** Gates not yet checked are absent. */
  gates: Partial<Record<GateId, GateResult>>;
}

export interface DimensionResult {
  id: DimensionId;
  name: string;
  weight: number;
  /** Mean of the applicable, scored criteria; null when none are scored. */
  score: number | null;
  scored: number;
}

export interface RollupResult {
  dimensions: DimensionResult[];
  /** Weighted mean over the dimensions that have a score; null when none do. */
  weighted: number | null;
  /** Letter from the weighted score before any gate cap. */
  uncappedLetter: LetterGrade | null;
  letter: LetterGrade | null;
  gateFailures: GateId[];
  gateCapped: boolean;
}
