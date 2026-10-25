import { useSyncExternalStore } from 'react';

const subscribe = (onChange: () => void) => {
  document.addEventListener('visibilitychange', onChange);
  return () => document.removeEventListener('visibilitychange', onChange);
};
const isVisible = () => document.visibilityState !== 'hidden';

/** False while the browser tab is hidden, when the meter's animation loop is paused. */
export const usePageVisible = () =>
  useSyncExternalStore(subscribe, isVisible, () => true);
