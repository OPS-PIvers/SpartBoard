import type React from 'react';

/** v2 player text and callout sizes; the Studio canvas applies the same so placement is WYSIWYG. */
export const PROJECTOR_TEXT_VARS = {
  '--gl-text-title': 'clamp(14px, 4.4cqmin, 30px)',
  '--gl-text-body': 'clamp(14px, 3.8cqmin, 28px)',
  '--gl-text-small': 'clamp(14px, 3cqmin, 22px)',
  '--gl-callout-max-w': 'min(max(340px, 50cqmin), 60cqw)',
  '--gl-popover-max-w': 'min(max(380px, 56cqmin), 90cqw)',
  '--gl-question-max-w': 'min(max(420px, 64cqmin), 90cqw)',
} as React.CSSProperties;
