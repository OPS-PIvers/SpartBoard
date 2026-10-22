// Links whose import is running, so membership sync doesn't import the same boards a second time.

const importing = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;

const notify = () => {
  version += 1;
  listeners.forEach((cb) => cb());
};

export const beginLinkedCollectionImport = (linkId: string): void => {
  importing.add(linkId);
  notify();
};

export const endLinkedCollectionImport = (linkId: string): void => {
  if (importing.delete(linkId)) notify();
};

export const isLinkedCollectionImporting = (linkId: string): boolean =>
  importing.has(linkId);

/** For `useSyncExternalStore`: changes whenever an import starts or ends. */
export const subscribeLinkedCollectionImports = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};

export const linkedCollectionImportsVersion = (): number => version;
