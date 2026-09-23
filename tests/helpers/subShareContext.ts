// One definition of the sub-share context a test provides, so a field added to
// `SubShareContentValue` is filled in once rather than in every widget test —
// and so no test can pass against a shape the provider never produces.

import type { SubShareContentValue } from '@/context/SubShareContentContextValue';

const rejectUnexpected = (name: string) => () => {
  throw new Error(`${name} was called by a test that did not stub it`);
};

/**
 * The defaults match a collection share with nothing bundled: both readers
 * throw rather than resolving null, so a test that meant to stub one and did
 * not fails loudly instead of rendering an empty widget.
 */
export function subShareContextValue(
  overrides: Partial<SubShareContentValue> = {}
): SubShareContentValue {
  return {
    shareId: 'share-1',
    version: 0,
    boardId: 'board-1',
    rosters: [],
    load: rejectUnexpected('load') as SubShareContentValue['load'],
    loadKey: rejectUnexpected('loadKey') as SubShareContentValue['loadKey'],
    ...overrides,
  };
}
