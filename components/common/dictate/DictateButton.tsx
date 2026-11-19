import React from 'react';
import type { DictationController } from '@/utils/speechToText/types';

export interface DictateButtonProps {
  controller: DictationController;
  /** `compact` is the icon-only mic for a fill-in-the-blank box. */
  size?: 'full' | 'compact';
  /** Light surface, as in self-paced quizzes and Writing. */
  light?: boolean;
  disabled?: boolean;
}

/** Stub: renders nothing until the Dictate control lands. */
export const DictateButton: React.FC<DictateButtonProps> = () => null;
