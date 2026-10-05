// Grading deck: what the grading artifact page renders and what /grade-widget writes back.

import type {
  ApplicabilityKind,
  CriterionId,
  DimensionId,
  GateId,
  GradeMethod,
  Level,
} from '../types.ts';

export type GradingMode = 'widget' | 'criterion' | 'disagreements';

/** Applicability facts for one widget; null means the measurer has no reading yet. */
export type ApplicabilityFacts = Record<ApplicabilityKind, boolean | null>;

export interface DeckShot {
  /** Path relative to the published page. */
  src: string;
  /** Repo-relative path in the measurer run, used to copy the file into the publish folder. */
  from: string;
  caption: string;
}

export interface JudgeScore {
  score: Level | null;
  why: string;
}

export interface DeckCard {
  id: string;
  widgetType: string;
  widgetName: string;
  criterionId: CriterionId;
  criterionName: string;
  dimension: DimensionId;
  method: GradeMethod;
  rule: string;
  /** True when the applicability rule marks this card N/A (R15); not editable on the page. */
  na: boolean;
  /** Levels the rubric defines for this criterion, in order. */
  levels: { level: Level; text: string }[];
  /** Script measurements in plain words. */
  measurements: string[];
  scriptLevel: Level | null;
  /** Hidden on the page until Paul picks a level (R29). */
  judge: JudgeScore | null;
  /** Paul's previous official score, if any. */
  previous: Level | null;
  shots: DeckShot[];
  /** Live harness URLs (path only) for feel-test criteria. */
  harness: { label: string; path: string }[];
  /** True for V1/V2/V3 during norming: the card can be picked as a level exemplar. */
  exemplarPick: boolean;
  exemplars: { level: Level; widgetType: string; src: string; from: string }[];
}

export interface DeckGate {
  gate: GateId;
  pass: boolean;
  where: string;
}

export interface GradingDeck {
  deckId: string;
  mode: GradingMode;
  rubricVersion: string;
  runId: string;
  createdAt: string;
  /** Default dev server origin for harness links. */
  harnessOrigin: string;
  gates: Record<string, DeckGate[]>;
  cards: DeckCard[];
}

/** One row of the artifact's db collection `decks/<deckId>/grades`. */
export interface GradeRow {
  cardId: string;
  level: Level;
  note?: string;
  /** Answer to "what did the descriptor miss?" when Paul and the judge are 2+ apart. */
  missed?: string;
  exemplar?: boolean;
  gradedAt: string;
}
