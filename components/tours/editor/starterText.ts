import type { GuidedLearningStep, GuidedLearningTourBinding } from '@/types';
import {
  TOUR_ANCHORS,
  WHOLE_BOARD_ANCHOR,
  isTourAnchorId,
  parseTourAnchorRef,
} from '@/config/tourAnchors';
import { anchorName, toolName } from './anchorAreas';

export interface StarterText {
  label: string;
  text: string;
}

// "Widget settings button" reads "Clock settings button" once the widget type is known.
const nounOf = (label: string, widgetType?: string): string => {
  let noun = label.replace(/^(A|An|The) /, '').split(/, by /)[0];
  if (widgetType) noun = noun.replace(/^Widget\b/, toolName(widgetType));
  const name = noun.split(/ (?:in|inside|on|for) /)[0];
  const [first = '', ...rest] = name.split(' ');
  // Keep a control's own name ("the Open Tools button"), acronyms and widget names; lower the rest.
  const keep =
    /^(\S+ ){1,5}(button|tab|link|toggle|switch|checkbox|option)$/.test(name) ||
    rest.some((w) => /^[A-Z]/.test(w)) ||
    first.length < 2 ||
    first[1] !== first[1].toLowerCase() ||
    (!!widgetType && noun.startsWith(toolName(widgetType)));
  return keep ? noun : noun.charAt(0).toLowerCase() + noun.slice(1);
};

const sentenceFor = (
  binding: GuidedLearningTourBinding,
  target: string
): string => {
  const { action, value } = binding;
  const quoted = typeof value === 'string' && value.trim() ? value.trim() : '';
  switch (action) {
    case 'observe':
      return `Take a look at ${target}.`;
    case 'toggle':
      if (value === true) return `Turn on ${target}.`;
      if (value === false) return `Turn off ${target}.`;
      return `Switch ${target}.`;
    case 'select':
      return quoted
        ? `Choose "${quoted}" in ${target}.`
        : `Choose an option in ${target}.`;
    case 'type':
      return quoted ? `Type "${quoted}" in ${target}.` : `Type in ${target}.`;
    default:
      return `Click ${target}.`;
  }
};

/** A starting title and text for a step bound to `binding`, or null when there is nothing to say. */
export function starterStepText(
  binding: GuidedLearningTourBinding | undefined
): StarterText | null {
  if (!binding) return null;
  if (!binding.anchor) {
    const name = binding.fallback?.name.trim();
    if (!name) return null;
    return {
      label: name.charAt(0).toUpperCase() + name.slice(1),
      text: sentenceFor(binding, name),
    };
  }
  const { id, widgetType } = parseTourAnchorRef(binding.anchor);
  if (id === WHOLE_BOARD_ANCHOR || !isTourAnchorId(id)) return null;
  const label = TOUR_ANCHORS[id].label.replace(/\s*\([^)]*\)/g, '');
  const named = widgetType
    ? label.replace(/^Widget\b/, toolName(widgetType))
    : label;
  return {
    label: anchorName(named),
    text: sentenceFor(binding, `the ${nounOf(label, widgetType)}`),
  };
}

const untouched = (value: string | undefined, starter: string | undefined) =>
  !value?.trim() || value === starter;

/** A step patch with the new binding, refreshing a title or text that is empty or still the previous starter. */
export function bindWithStarterText(
  step: GuidedLearningStep,
  tour: GuidedLearningTourBinding
): Partial<GuidedLearningStep> {
  const before = starterStepText(step.tour);
  const after = starterStepText(tour);
  const patch: Partial<GuidedLearningStep> = { tour };
  if (!after) return patch;
  if (untouched(step.label, before?.label)) patch.label = after.label;
  if (untouched(step.text, before?.text)) patch.text = after.text;
  return patch;
}
