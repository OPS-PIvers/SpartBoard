import type React from 'react';
import type { TourAnchorAttrs } from '@/config/tourAnchors';

export interface AnswerInputProps {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  anchor?: TourAnchorAttrs;
}

/** Swaps an answer-key text box for another input, e.g. a math box. */
export type RenderAnswerInput = (props: AnswerInputProps) => React.ReactNode;
