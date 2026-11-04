import type { GuidedLearningTourBinding } from '@/types';
import { findTourAnchor } from '@/components/tours/resolveTourAnchor';
import type { TourSlots } from '@/components/tours/tourSession';

export interface SelectChoice {
  value: string;
  label: string;
}

/** The native dropdown a step points at, when it is on screen. */
export function nativeSelectOf(
  binding: GuidedLearningTourBinding | undefined,
  slots: TourSlots = {}
): HTMLSelectElement | null {
  if (typeof document === 'undefined' || !binding?.anchor) return null;
  const el = findTourAnchor(binding, { slots });
  if (!el) return null;
  return el instanceof HTMLSelectElement ? el : el.querySelector('select');
}

/** The dropdown's options as value and visible text. */
export const selectChoices = (el: HTMLSelectElement): SelectChoice[] =>
  Array.from(el.options).map((o) => ({
    value: o.value,
    label: o.textContent?.replace(/\s+/g, ' ').trim() || o.value,
  }));

/** A click step on a native dropdown becomes a choice step, since its options can't be clicked. */
export function asChoiceStep(
  binding: GuidedLearningTourBinding,
  slots: TourSlots = {}
): GuidedLearningTourBinding {
  if (binding.action !== 'click' || !nativeSelectOf(binding, slots))
    return binding;
  const next: GuidedLearningTourBinding = { ...binding, action: 'select' };
  // No value yet: any choice moves on until the admin picks one.
  delete next.value;
  return next;
}
