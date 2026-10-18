import type React from 'react';

// Safari fires the IME-confirming keydown after compositionend, with keyCode 229.
export const isImeComposing = (e: React.KeyboardEvent): boolean =>
  e.nativeEvent.isComposing || e.keyCode === 229;
