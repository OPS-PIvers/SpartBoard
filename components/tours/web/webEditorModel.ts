import type {
  GuidedLearningStep,
  WebTourAction,
  WebTourCheckResult,
  WebTourLocator,
} from '@/types';
import type { ReviewField } from './webStepReview';
import { hasStarterTitle } from './writeWithClaude';

export type WebStep = GuidedLearningStep & {
  web?: NonNullable<GuidedLearningStep['web']>;
};

export const CHECK_LABEL: Record<WebTourCheckResult, string> = {
  found: 'Found',
  weak: 'Weak match',
  ambiguous: 'Matches more than one',
  none: 'Not found',
};

const FIELD_LABEL: Record<string, string> = {
  label: 'Step title',
  text: 'Tip',
  url: 'Page address',
  role: 'Control type',
  name: 'Control name',
  pageText: 'Text on the control',
  css: 'Page position',
  heading: 'Nearby heading',
  pageTitle: 'Page title',
  'attr:testId': 'Control id',
  'attr:ariaLabel': 'Control label',
  'attr:name': 'Field name',
  'attr:href': 'Link address',
};

export const fieldLabel = (field: ReviewField) =>
  field.startsWith('frame:')
    ? `Frame address ${Number(field.slice(6)) + 1}`
    : FIELD_LABEL[field];

export const NEEDS_NEWER_EXTENSION =
  'Needs a newer SpartBoard extension in this Chrome profile.';

export const ACTION_LABEL: Record<WebTourAction, string> = {
  observe: 'Look',
  click: 'Click',
  type: 'Type',
  select: 'Choose',
};

/** A short name for what the step points at. */
export const webTargetLabel = (loc: WebTourLocator | undefined): string =>
  [loc?.name, loc?.text, loc?.attrs?.ariaLabel]
    .map((v) => v?.trim())
    .find((v): v is string => !!v) ??
  (loc?.css ? 'A spot on the page' : 'No target yet');

/** A web step with nothing a person or Claude wrote: a recording's starter title and no tip. */
export const webStepNeedsText = (step: GuidedLearningStep): boolean =>
  hasStarterTitle(step) && !step.text?.trim();
