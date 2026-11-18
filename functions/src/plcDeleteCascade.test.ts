import { describe, expect, it } from 'vitest';
import { cascadePlcDelete, type CascadeDeps } from './plcDeleteCascade';

describe('cascadePlcDelete (security #15)', () => {
  it('deletes every subcollection and both Storage prefixes of the deleted PLC', async () => {
    const deleted: string[] = [];
    const prefixes: string[] = [];
    const deps: CascadeDeps = {
      listSubcollections: () =>
        Promise.resolve(
          [
            'recordings',
            'aggregates',
            'comments',
            'activity',
            'workspaces',
          ].map((id) => ({ id }))
        ),
      deleteSubcollection: (plcId, name) => {
        deleted.push(`${plcId}/${name}`);
        return Promise.resolve();
      },
      deleteStoragePrefix: (prefix) => {
        prefixes.push(prefix);
        return Promise.resolve();
      },
    };
    await cascadePlcDelete(deps, 'p1');
    expect(deleted).toEqual([
      'p1/recordings',
      'p1/aggregates',
      'p1/comments',
      'p1/activity',
      'p1/workspaces',
    ]);
    expect(prefixes).toEqual([
      'plc_meeting_audio/p1/',
      'plc_norming_media/p1/',
    ]);
  });
});
