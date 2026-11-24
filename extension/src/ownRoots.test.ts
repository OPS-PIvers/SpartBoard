import { afterEach, describe, expect, it } from 'vitest';
import { ownRootsIn, shareOwnRoot } from './ownRoots';

afterEach(() => {
  document.body.innerHTML = '';
  globalThis.__sbOwnShadowRoots = undefined;
});

const closedRoot = () =>
  shareOwnRoot(document.createElement('div').attachShadow({ mode: 'closed' }));

describe('own shadow roots', () => {
  it('lists a registered root once its host is on the page, and not after it leaves', () => {
    expect(ownRootsIn(document)).toEqual([]);
    const root = closedRoot();
    expect(ownRootsIn(document)).toEqual([]);
    document.body.append(root.host);
    expect(ownRootsIn(document)).toEqual([root]);
    root.host.remove();
    expect(ownRootsIn(document)).toEqual([]);
  });

  it('forgets roots whose host left the page when the next one registers', () => {
    const first = closedRoot();
    document.body.append(first.host);
    first.host.remove();
    const second = closedRoot();
    expect([...(globalThis.__sbOwnShadowRoots ?? [])]).toEqual([second]);
  });
});
