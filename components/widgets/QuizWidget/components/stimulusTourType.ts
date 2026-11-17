import { createContext } from 'react';

/** Widget types whose editors reuse the quiz prompt, word limit and Stimuli parts. */
export type SharedEditorTourType = 'quiz' | 'writing';

/** Widget type the Stimuli panel's tour anchors are scoped to. */
export const StimulusTourTypeContext =
  createContext<SharedEditorTourType>('quiz');
