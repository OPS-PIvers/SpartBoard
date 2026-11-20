// Layout contexts for the question editor's metadata fields.
import React from 'react';

/** Learning targets and DOK side by side on one line. */
export const MetaInlineContext = React.createContext(false);

/** Stimuli and Modified sit in the prompt box footer; their panels portal to `slot`. */
export const PromptFooterContext = React.createContext<{
  slot: HTMLElement | null;
} | null>(null);
