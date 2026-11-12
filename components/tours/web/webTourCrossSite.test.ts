// The hub's half of cross-site web tours (docs/plans/WEB_TOURS_CROSS_SITE.md X8, X9, X13, X14).
import { describe, expect, it, vi } from 'vitest';
import type { WebTourMessageStep } from '@/types';
import type { WebTourStep } from '@/components/widgets/GuidedLearning/utils/liveTour';
import { CROSS_SITE_PROTOCOL } from './extensionProtocol';
import { buildStartTour, pageUrlOf, startUrlOf } from './handoff';
import { hubGateOf } from './webTourHub';

vi.mock('@/config/firebase', () => ({
  storage: {},
  db: {},
  isConfigured: false,
}));

const step = (
  id: string,
  urlPattern: string,
  extra: Record<string, unknown> = {}
): WebTourStep =>
  ({
    id,
    label: `Step ${id}`,
    text: 'Click it',
    web: {
      urlPattern,
      locator: { role: 'button', name: 'Save' },
      action: 'click',
      ...extra,
    },
  }) as unknown as WebTourStep;

const message = (id: string): WebTourMessageStep =>
  ({
    id,
    label: `Message ${id}`,
    text: 'Now we move on',
    message: true,
  }) as WebTourMessageStep;

const GEMINI = 'https://gemini.google.com/app';
const CLAUDE = 'https://claude.ai/customize/skills';

describe('hubGateOf', () => {
  const oneSite = [step('a', GEMINI), step('b', GEMINI)];
  const switching = [step('a', GEMINI), step('b', CLAUDE)];
  const withMessage = [message('m'), step('a', GEMINI)];

  it('plays a one-site tour on any extension', () => {
    expect(hubGateOf(2, oneSite)).toBe('play');
    expect(hubGateOf(13, oneSite)).toBe('play');
  });

  it('refuses a Message step or a Site switch below protocol 14 and sends it at 14', () => {
    for (const steps of [switching, withMessage]) {
      expect(hubGateOf(13, steps)).toBe('update');
      expect(hubGateOf(CROSS_SITE_PROTOCOL, steps)).toBe('play');
    }
  });
});

describe('handoff with Message steps', () => {
  const steps = [
    message('intro'),
    step('a', GEMINI, { showWhen: { kind: 'target' } }),
    message('switch'),
    step('b', CLAUDE),
    message('outro'),
  ];

  it('keeps Message steps in order with words only', () => {
    const tour = buildStartTour('set', 1, 'T', steps, new Map(), true, true);
    expect(tour.steps.map((s) => s.id)).toEqual([
      'intro',
      'a',
      'switch',
      'b',
      'outro',
    ]);
    expect(tour.steps[0]).toEqual({
      id: 'intro',
      label: 'Message intro',
      text: 'Now we move on',
      message: true,
    });
    expect(tour.conditions).toEqual({ a: { showWhen: { kind: 'target' } } });
  });

  it('opens on the first targeted step past an opening message (X8)', () => {
    expect(startUrlOf(steps)).toBe(GEMINI);
    expect(startUrlOf([message('m')])).toBeNull();
  });

  it('resumes a Message step on the next targeted page, or the last one at the end', () => {
    expect(pageUrlOf(steps, 2)).toBe(CLAUDE);
    expect(pageUrlOf(steps, 4)).toBe(CLAUDE);
  });
});
