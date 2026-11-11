// The card data the connector's quiz and rubric tools send (functions/src/mcp/apps.ts).
import type { QuizBehaviorSettings, QuizData } from '@/types';

export interface RubricLevelView {
  label: string;
  points: number;
  description: string;
}

export interface RubricCriterionView {
  name: string;
  description: string;
  examples: string[];
  levels: RubricLevelView[];
}

export interface RubricCardView {
  title: string;
  description: string;
  max_points: number;
  criteria: RubricCriterionView[];
}

export interface QuestionView {
  n: number;
  id?: string;
  type:
    | 'multiple_choice'
    | 'choose_all'
    | 'fill_in_blank'
    | 'matching'
    | 'ordering'
    | 'free_response';
  text: string;
  points: number;
  changed: boolean;
  correct_answer?: string;
  incorrect_answers?: string[];
  correct_answers?: string[];
  accepted_alternates?: string[];
  blanks?: { answer: string; accepted_alternates?: string[] }[];
  pairs?: { term: string; match: string }[];
  extra_matches?: string[];
  items_in_order?: string[];
  placeholder?: string;
  min_words?: number;
  max_words?: number;
  standards?: string[];
  learning_targets?: string[];
  needs_answer_key?: boolean;
  rubric: (RubricCardView & { shown_to_students: boolean }) | null;
}

export interface QuizView {
  view: 'quiz';
  kind: 'quiz' | 'bank';
  id: string;
  title: string;
  shared_with_plc: boolean;
  updated_at: number;
  total_points: number;
  missing_answer_keys: number;
  sections: number;
  passages: number;
  bank_pulls: number;
  removed_questions: number;
  open_url: string;
  questions: QuestionView[];
  /** The saved quiz as the student player reads it. */
  quiz: QuizData;
  behavior: QuizBehaviorSettings | null;
}

export interface RubricView extends RubricCardView {
  view: 'rubric';
  rubric_id: string;
  updated_at: number;
  open_url: string;
}

export type PreviewView = QuizView | RubricView;

export function isPreviewView(value: unknown): value is PreviewView {
  if (!value || typeof value !== 'object') return false;
  const view = (value as { view?: unknown }).view;
  return view === 'quiz' || view === 'rubric';
}
