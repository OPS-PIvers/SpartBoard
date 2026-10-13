let installed = false;

// Browser page translation swaps React's text nodes for <font> wrappers; without this, React's next insert or remove beside one throws and blanks the page.
export function installTranslateDomGuard(): void {
  if (installed || typeof Node !== 'function') return;
  installed = true;

  // eslint-disable-next-line @typescript-eslint/unbound-method -- re-bound with .call below
  const originalRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function removeChild<T extends Node>(
    this: Node,
    child: T
  ): T {
    if (child.parentNode !== this) return child;
    return originalRemoveChild.call(this, child) as T;
  };

  // eslint-disable-next-line @typescript-eslint/unbound-method -- re-bound with .call below
  const originalInsertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function insertBefore<T extends Node>(
    this: Node,
    node: T,
    child: Node | null
  ): T {
    if (child && child.parentNode !== this) {
      return originalInsertBefore.call(this, node, null) as T;
    }
    return originalInsertBefore.call(this, node, child) as T;
  };
}
