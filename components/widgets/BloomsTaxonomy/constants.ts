/** Bloom's Taxonomy levels ordered bottom (widest) to top (narrowest). */
export const BLOOMS_LEVELS = [
  'remember',
  'understand',
  'apply',
  'analyze',
  'evaluate',
  'create',
] as const;

export type BloomsLevel = (typeof BLOOMS_LEVELS)[number];

export const BLOOMS_COLORS: Record<BloomsLevel, string> = {
  remember: '#3730A3',
  understand: '#2563EB',
  apply: '#0891B2',
  analyze: '#059669',
  evaluate: '#D97706',
  create: '#DC2626',
};

export const BLOOMS_LABELS: Record<BloomsLevel, string> = {
  remember: 'Remember',
  understand: 'Understand',
  apply: 'Apply',
  analyze: 'Analyze',
  evaluate: 'Evaluate',
  create: 'Create',
};

export const CONTENT_CATEGORIES = [
  'questionStems',
  'actionVerbs',
  'activityTypes',
  'assessmentIdeas',
  'iCanStatements',
  'dokAlignment',
] as const;

export type ContentCategory = (typeof CONTENT_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<ContentCategory, string> = {
  questionStems: 'Question Stems',
  actionVerbs: 'Action Verbs',
  activityTypes: 'Activity Types',
  assessmentIdeas: 'Assessment Ideas',
  iCanStatements: '"I Can…" Statements',
  dokAlignment: 'DOK Alignment',
};
