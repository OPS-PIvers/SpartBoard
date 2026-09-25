import { describe, expect, it } from 'vitest';
import type { GuidedLearningSet } from '@/types';
import type { TourAnchorDef } from '@/config/tourAnchors';
import {
  COPY_INSTRUCTION,
  anchorFingerprint,
  canRebind,
  fingerprintSource,
  formatUnmappedAnchors,
  isFingerprint,
  parseQueueItem,
  queueDisplayState,
  reboundAnchorRef,
  rebindSteps,
  removedOccurrences,
  type TourAnchorQueueItem,
  type UnmappedAnchorContext,
} from './anchorQueue';

const context = (
  extra: Partial<UnmappedAnchorContext> = {}
): UnmappedAnchorContext => ({
  suggestedId: 'button.start',
  role: 'button',
  name: 'start',
  widgetType: 'time-tool',
  pathname: '/',
  nearestAnchor: 'widget.root',
  ancestors: [
    { tag: 'button' },
    { tag: 'div', testId: 'timer-panel', role: 'group' },
  ],
  htmlExcerpt: '<button class="px-2">Start</button>',
  ...extra,
});

const item = (
  extra: Partial<TourAnchorQueueItem> = {}
): TourAnchorQueueItem => ({
  ...context(),
  fingerprint: 'f'.repeat(40),
  status: 'open',
  occurrences: [{ setId: 's1', stepId: 'a' }],
  ...extra,
});

const registry: Record<string, TourAnchorDef> = {
  'timer.start': { label: 'Start button' },
  'dock.item': { label: 'Dock item', perWidgetType: true },
};

describe('anchorFingerprint', () => {
  it('is a stable sha-1 of type, path, chain and name', async () => {
    expect(fingerprintSource(context())).toBe(
      'time-tool|/|button,,,>div,timer-panel,,group|start'
    );
    const a = await anchorFingerprint(context());
    // Pinned, so a change to the hashing is caught.
    expect(a).toBe('8eb433b44b80199ca07f5cd9fc0d494e97ceee26');
    expect(isFingerprint(a)).toBe(true);
    // Unhashed fields don't move it.
    expect(
      await anchorFingerprint(
        context({ htmlExcerpt: 'changed', suggestedId: null })
      )
    ).toBe(a);
  });

  it('changes with any hashed field', async () => {
    const base = await anchorFingerprint(context());
    for (const extra of [
      { widgetType: 'clock' as const },
      { pathname: '/quiz' },
      { name: 'stop' },
      { ancestors: [{ tag: 'button' }] },
    ]) {
      expect(await anchorFingerprint(context(extra))).not.toBe(base);
    }
  });
});

describe('queueDisplayState and rebind gating', () => {
  it('shows a PR anchor as mapped only once this build registers it', () => {
    expect(
      queueDisplayState(
        item({ status: 'pr-open', anchorId: 'timer.start' }),
        registry
      )
    ).toBe('mapped');
    expect(
      queueDisplayState(
        item({ status: 'pr-open', anchorId: 'timer.new' }),
        registry
      )
    ).toBe('waiting-deploy');
    expect(queueDisplayState(item({ status: 'pr-open' }), registry)).toBe(
      'pr-open'
    );
    expect(queueDisplayState(item({ status: 'needs-human' }), registry)).toBe(
      'needs-human'
    );
    expect(
      queueDisplayState(
        item({ status: 'rebound', anchorId: 'timer.start' }),
        registry
      )
    ).toBe('rebound');
  });

  it('offers Rebind only for a registered anchor with steps to fix', () => {
    expect(
      canRebind(item({ status: 'pr-open', anchorId: 'timer.start' }), registry)
    ).toBe(true);
    expect(
      canRebind(item({ status: 'mapped', anchorId: 'timer.start' }), registry)
    ).toBe(true);
    expect(
      canRebind(item({ status: 'pr-open', anchorId: 'timer.new' }), registry)
    ).toBe(false);
    expect(
      canRebind(
        item({ status: 'pr-open', anchorId: 'timer.start', occurrences: [] }),
        registry
      )
    ).toBe(false);
    expect(canRebind(item({ status: 'open' }), registry)).toBe(false);
  });

  it('adds the widget type only for per-type anchors', () => {
    expect(reboundAnchorRef(item({ anchorId: 'timer.start' }), registry)).toBe(
      'timer.start'
    );
    expect(reboundAnchorRef(item({ anchorId: 'dock.item' }), registry)).toBe(
      'dock.item:time-tool'
    );
    expect(reboundAnchorRef(item({ anchorId: 'nope' }), registry)).toBeNull();
    expect(
      reboundAnchorRef(item({ anchorId: 'toString' }), registry)
    ).toBeNull();
  });
});

const set = (steps: GuidedLearningSet['steps']) =>
  ({ id: 's1', steps, updatedAt: 1 }) as unknown as GuidedLearningSet;
const fp = 'f'.repeat(40);

describe('rebindSteps', () => {
  it('writes the anchor and clears unmapped only on matching steps', () => {
    const before = set([
      { id: 'a', tour: { anchor: '', action: 'click', unmapped: fp } },
      { id: 'b', tour: { anchor: '', action: 'click', unmapped: 'other' } },
      { id: 'c', tour: { anchor: '', action: 'click', unmapped: fp } },
    ] as GuidedLearningSet['steps']);
    const { set: after, count } = rebindSteps(
      before,
      fp,
      new Set(['a', 'b']),
      'timer.start'
    );
    expect(count).toBe(1);
    expect(after.steps[0].tour).toEqual({
      anchor: 'timer.start',
      action: 'click',
    });
    expect(after.steps[1]).toBe(before.steps[1]);
    expect(after.steps[2]).toBe(before.steps[2]);
  });
});

describe('removedOccurrences', () => {
  it('lists unmapped steps a save deleted', () => {
    const stored = set([
      { id: 'a', tour: { anchor: '', action: 'click', unmapped: fp } },
      { id: 'b', tour: { anchor: '', action: 'click', unmapped: fp } },
      { id: 'c', tour: { anchor: 'x', action: 'click' } },
    ] as GuidedLearningSet['steps']);
    const next = set([{ id: 'a' }] as GuidedLearningSet['steps']);
    expect(removedOccurrences(stored, next)).toEqual([
      { fingerprint: fp, setId: 's1', stepId: 'b' },
    ]);
    expect(removedOccurrences(undefined, next)).toEqual([]);
  });
});

describe('parseQueueItem', () => {
  it('reads a stored item and rejects an unknown status', () => {
    expect(
      parseQueueItem(fp, {
        ...context(),
        status: 'pr-open',
        occurrences: [{ setId: 's1', stepId: 'a' }, { bad: true }],
        anchorId: 'timer.start',
        prUrl: 'https://github.com/x/pull/1',
      })
    ).toMatchObject({
      fingerprint: fp,
      status: 'pr-open',
      occurrences: [{ setId: 's1', stepId: 'a' }],
      anchorId: 'timer.start',
    });
    expect(parseQueueItem(fp, { status: 'weird' })).toBeNull();
  });
});

describe('formatUnmappedAnchors', () => {
  it('writes the instruction and every captured field', () => {
    const md = formatUnmappedAnchors([
      item({ occurrences: [{ setId: 's1', stepId: 'a' }] }),
    ]);
    expect(md.startsWith(COPY_INSTRUCTION)).toBe(true);
    expect(md).toContain('## 1. button.start');
    expect(md).toContain(`- Fingerprint: \`${'f'.repeat(40)}\``);
    expect(md).toContain('- Suggested id: `button.start`');
    expect(md).toContain('- Role: button');
    expect(md).toContain('- Name: start');
    expect(md).toContain('- Widget type: `time-tool`');
    expect(md).toContain('- Page: `/`');
    expect(md).toContain('- Nearest anchor: `widget.root`');
    expect(md).toContain(
      '- Ancestors (innermost first): `button` > `div[data-testid="timer-panel"][role="group"]`'
    );
    expect(md).toContain('- Clicked in: s1 / a');
    expect(md).toContain('```html\n<button class="px-2">Start</button>\n```');
    expect(md).not.toMatch(/\n{3,}/);
  });

  it('numbers entries and fences an excerpt that has backticks', () => {
    const md = formatUnmappedAnchors([
      context({ suggestedId: null, name: null }),
      context({ htmlExcerpt: '<code>```</code>' }),
    ]);
    expect(md).toContain('## 1. button');
    expect(md).toContain('## 2. button.start');
    expect(md).toContain('````html\n<code>```</code>\n````');
  });
});
