// Layout contexts for the question editor's metadata fields.
import React from 'react';

/** Learning targets and DOK side by side on one line. */
export const MetaInlineContext = React.createContext(false);

/** Stimuli and Modified sit in the prompt box footer; their panels portal under the box. */
export const PromptFooterContext = React.createContext<{
  stimuliSlot: HTMLElement | null;
  modifiedSlot: HTMLElement | null;
} | null>(null);
