// Layout contexts for the question editor's metadata fields.
import React from 'react';

/** Strip layout: the metadata rows become cells of one compact grid. */
export const MetaCellsContext = React.createContext<false | 'cells' | 'inline'>(
  false
);

/** Stimuli and Modified drawn inside the prompt box; their panels portal to `slot`. */
export const PromptInlineContext = React.createContext<{
  mode: 'footer' | 'toolbar';
  slot: HTMLElement | null;
} | null>(null);
