// Shared reference-counted body scroll lock used by every overlay system
// (Modal, DialogContainer). A single counter means the page unlocks only when
// the LAST overlay closes — a dialog opened over a modal must not unlock the
// page behind it when the dialog alone closes.

let lockCount = 0;

// Acquire a lock; hides body scroll on the first acquisition.
export const acquireBodyScrollLock = (): void => {
  if (typeof document === 'undefined') return;
  if (lockCount === 0) {
    document.body.style.overflow = 'hidden';
  }
  lockCount += 1;
};

// Release a lock; restores body scroll only when the last lock is released.
export const releaseBodyScrollLock = (): void => {
  if (typeof document === 'undefined') return;
  if (lockCount === 0) return;
  lockCount -= 1;
  if (lockCount === 0) {
    document.body.style.overflow = 'unset';
  }
};

// Current lock count, synchronous. Exposed for tests.
export const getBodyScrollLockCount = (): number => lockCount;
