import { describe, expect, it } from 'vitest';
import {
  planAnchorRequests,
  requestFingerprint,
  settingsFieldAnchor,
} from './glAnchorRequests';

const fallbackStep = (id: string, name = 'Flip digits') => ({
  id,
  imageIndex: 0,
  tour: {
    anchor: '',
    action: 'click',
    fallback: { role: 'switch', name },
  },
});

describe('planAnchorRequests', () => {
  it('queues a fallback-only step with its context and stamps the fingerprint', () => {
    const steps = [
      {
        id: 'a',
        imageIndex: 0,
        tour: { anchor: 'widget.settings-opener', action: 'click' },
      },
      fallbackStep('b'),
    ];
    const notes = new Map([
      ['b', { where: 'Clock settings, under Display', widget_type: 'clock' }],
    ]);
    const { steps: out, requests } = planAnchorRequests(steps, [], notes);
    const fp = requestFingerprint('switch', 'Flip digits', 'clock');
    expect(fp).toMatch(/^[0-9a-f]{40}$/);
    expect(out[1].tour).toMatchObject({ unmapped: fp });
    expect(requests).toEqual([
      {
        fingerprint: fp,
        stepIds: ['b'],
        context: {
          suggestedId: null,
          role: 'switch',
          name: 'Flip digits',
          widgetType: 'clock',
          pathname: '/',
          nearestAnchor: 'widget.settings-opener',
          ancestors: [],
          htmlExcerpt: '',
          requestNote: 'Clock settings, under Display',
        },
      },
    ]);
  });

  it('groups steps that point at the same control', () => {
    const { requests } = planAnchorRequests(
      [fallbackStep('a'), fallbackStep('b'), fallbackStep('c', 'Other')],
      [],
      new Map()
    );
    expect(requests.map((r) => r.stepIds)).toEqual([['a', 'b'], ['c']]);
  });

  it('keeps a stored fingerprint and does not queue it again', () => {
    const prior = [
      {
        ...fallbackStep('a'),
        tour: { ...fallbackStep('a').tour, unmapped: 'f'.repeat(40) },
      },
    ];
    const { steps, requests } = planAnchorRequests(
      [fallbackStep('a')],
      prior,
      new Map()
    );
    expect(steps[0].tour).toMatchObject({ unmapped: 'f'.repeat(40) });
    expect(requests).toEqual([]);
  });

  it('queues a new request when Claude points the step at a different control', () => {
    const prior = [
      {
        ...fallbackStep('a'),
        tour: { ...fallbackStep('a').tour, unmapped: 'f'.repeat(40) },
      },
    ];
    const { steps, requests } = planAnchorRequests(
      [fallbackStep('a', 'Show date')],
      prior,
      new Map()
    );
    const fp = requestFingerprint('switch', 'Show date', null);
    expect(steps[0].tour).toMatchObject({ unmapped: fp });
    expect(requests.map((r) => r.fingerprint)).toEqual([fp]);
  });

  it('ignores a fingerprint Claude sends and drops it once the step has an anchor', () => {
    const sent = {
      id: 'a',
      imageIndex: 0,
      tour: { ...fallbackStep('a').tour, unmapped: 'e'.repeat(40) },
    };
    const planned = planAnchorRequests([sent], [], new Map());
    expect(planned.steps[0].tour).toMatchObject({
      unmapped: requestFingerprint('switch', 'Flip digits', null),
    });
    const bound = planAnchorRequests(
      [
        {
          id: 'a',
          imageIndex: 0,
          tour: { anchor: 'widget.pin', action: 'click' },
        },
      ],
      [{ ...sent, tour: { ...sent.tour, unmapped: 'e'.repeat(40) } }],
      new Map()
    );
    expect(bound.steps[0].tour).not.toHaveProperty('unmapped');
    expect(bound.requests).toEqual([]);
  });

  it('leaves steps without a tour alone', () => {
    const step = { id: 'a', imageIndex: 0 };
    const { steps, requests } = planAnchorRequests([step], [], new Map());
    expect(steps[0]).toBe(step);
    expect(requests).toEqual([]);
  });
});

describe('settings drawer fields', () => {
  it('binds a fallback step that names a settings field instead of queueing it', () => {
    const step = fallbackStep('a', 'auto-complete items');
    const notes = new Map([
      ['a', { where: 'Schedule settings', widget_type: 'schedule' }],
    ]);
    const { steps, requests } = planAnchorRequests([step], [], notes);
    expect(steps[0].tour).toMatchObject({
      anchor: 'settings.toggle:schedule#autoProgress',
    });
    expect(steps[0].tour).not.toHaveProperty('unmapped');
    expect(requests).toEqual([]);
  });

  it('matches section headings only for heading roles', () => {
    expect(settingsFieldAnchor('heading', 'Behavior', 'schedule')).toBe(
      'settings.group:schedule#behavior'
    );
    expect(settingsFieldAnchor('button', 'Behavior', 'schedule')).toBeNull();
  });

  it('needs a single match when the widget type is unknown', () => {
    expect(settingsFieldAnchor('heading', 'Behavior', null)).toBeNull();
    expect(settingsFieldAnchor('switch', 'Behavior', 'toString')).toBeNull();
    expect(settingsFieldAnchor('switch', 'Auto-scroll view', null)).toBe(
      'settings.toggle:schedule#autoScroll'
    );
  });
});
