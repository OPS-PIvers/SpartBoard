import { describe, expect, it, vi } from 'vitest';
import type { AssignedStatus } from '@/utils/assignedStatus';
import { publishChipOptions, statusChipOptions } from './assignedChips';

const run = (
  classes: { key: string; status: string }[],
  singleLine = false
): AssignedStatus => ({ classes, singleLine }) as unknown as AssignedStatus;

const base = {
  menuActions: [],
  classControls: true,
  canPause: true,
  rowKey: 'row-1',
  tourWidgetType: 'quiz',
};

describe('statusChipOptions', () => {
  it('Paused pauses each open class the status names', () => {
    const onClassAction = vi.fn();
    const opts = statusChipOptions({
      ...base,
      onClassAction,
      status: run([
        { key: 'p1', status: 'open' },
        { key: 'p2', status: 'open' },
        { key: 'p3', status: 'closed' },
      ]),
    });
    opts.find((o) => o.id === 'paused')?.onSelect?.();
    expect(onClassAction.mock.calls).toEqual([
      ['pause', 'p1'],
      ['pause', 'p2'],
    ]);
  });

  it('offers no whole-row Open when several classes are paused', () => {
    const opts = statusChipOptions({
      ...base,
      onClassAction: vi.fn(),
      status: run([
        { key: 'p1', status: 'paused' },
        { key: 'p2', status: 'paused' },
      ]),
    });
    expect(opts.map((o) => o.id)).toEqual(['paused']);
  });

  it('resumes the one paused class', () => {
    const onClassAction = vi.fn();
    const opts = statusChipOptions({
      ...base,
      onClassAction,
      status: run([
        { key: 'p1', status: 'paused' },
        { key: 'p2', status: 'closed' },
      ]),
    });
    opts.find((o) => o.id === 'open')?.onSelect?.();
    expect(onClassAction).toHaveBeenCalledWith('resume', 'p1');
  });

  it('a single-line row closes itself and every option has an anchor', () => {
    const onClassAction = vi.fn();
    const opts = statusChipOptions({
      ...base,
      onClassAction,
      status: run([{ key: 'p1', status: 'open' }], true),
    });
    opts.find((o) => o.id === 'closed')?.onSelect?.();
    expect(onClassAction).toHaveBeenCalledWith('close', null);
    expect(opts.every((o) => o.anchor)).toBe(true);
  });
});

describe('publishChipOptions', () => {
  it('without an Unpublish item, Not published opens the Publish dialog', () => {
    const publish = vi.fn();
    const chip = publishChipOptions(
      [
        {
          id: 'publish-scores',
          label: 'Publish settings',
          onClick: publish,
          chip: 'publish',
          selected: true,
        },
      ],
      'row-1',
      'video-activity'
    );
    chip?.options.find((o) => o.id === 'not-published')?.onSelect?.();
    expect(publish).toHaveBeenCalled();
    expect(chip?.options.every((o) => o.anchor)).toBe(true);
  });
});
