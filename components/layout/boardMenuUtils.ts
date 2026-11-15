/** True when a right-click landed on empty board, not on a widget or app chrome. */
export const isBoardBackgroundTarget = (
  target: EventTarget | null
): boolean => {
  if (!(target instanceof Element)) return false;
  if (target.closest('[data-board-background]')) return true;
  return (
    target.id === 'dashboard-root' ||
    target.id === 'dashboard-zoom-surface' ||
    target.hasAttribute('data-board-surface') ||
    target.matches('[data-board-surface] > [data-board-id]')
  );
};

export const isMacPlatform = (): boolean =>
  /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

export const modKey = (): string => (isMacPlatform() ? '⌘' : 'Ctrl+');

/** Reads the system clipboard and replays it as a paste on the board, so it runs the same handlers as Ctrl+V. */
export const replayClipboardAsPaste = async (): Promise<'pasted' | 'empty'> => {
  const items = await navigator.clipboard.read();
  const data = new DataTransfer();
  let found = false;
  for (const item of items) {
    for (const type of item.types) {
      const blob = await item.getType(type);
      if (type.startsWith('image/')) {
        if (data.files.length > 0) continue;
        const ext = type.split('/')[1] ?? 'png';
        data.items.add(new File([blob], `pasted-image.${ext}`, { type }));
        found = true;
      } else if (type === 'text/plain' || type === 'text/html') {
        data.setData(type, await blob.text());
        found = true;
      }
    }
  }
  if (!found) return 'empty';
  document.body.dispatchEvent(
    new ClipboardEvent('paste', {
      clipboardData: data,
      bubbles: true,
      cancelable: true,
    })
  );
  return 'pasted';
};
