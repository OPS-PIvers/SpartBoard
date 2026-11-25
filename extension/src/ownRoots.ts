// The extension's own closed shadow roots, shared through the content scripts' isolated world so tour playback can search them.
declare global {
  var __sbOwnShadowRoots: Set<ShadowRoot> | undefined;
}

/** Registers a closed shadow root this extension made, so a web tour step can point at a control inside it; roots whose host has left the page are dropped. */
export function shareOwnRoot(root: ShadowRoot): ShadowRoot {
  const all = (globalThis.__sbOwnShadowRoots ??= new Set());
  for (const old of all) if (!old.host.isConnected) all.delete(old);
  all.add(root);
  return root;
}

/** The registered roots whose host is in this document now. */
export const ownRootsIn = (doc: Document): ShadowRoot[] =>
  [...(globalThis.__sbOwnShadowRoots ?? [])].filter(
    (root) => root.host.isConnected && root.host.ownerDocument === doc
  );
