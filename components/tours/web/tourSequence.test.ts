import { describe, expect, it } from 'vitest';
import type { GuidedLearningSet, GuidedLearningStep } from '@/types';
import {
  firstTargetedIndex,
  hostOf,
  isMessageStep,
  needsCrossSite,
  siteSwitchesOf,
  switchUrlFor,
  webTourSequenceOf,
  type WebTourSequenceStep,
} from './tourSequence';

const targeted = (id: string, urlPattern: string): WebTourSequenceStep => ({
  id,
  xPct: 50,
  yPct: 50,
  imageIndex: 0,
  interactionType: 'text-popover',
  web: { urlPattern, action: 'click', locator: { role: 'button', name: id } },
});

const message = (id: string): WebTourSequenceStep => ({
  id,
  xPct: 50,
  yPct: 50,
  imageIndex: 0,
  interactionType: 'text-popover',
  text: 'Hello',
  message: true,
});

const G1 = 'https://gemini.google.com/app';
const C1 = 'https://claude.ai/customize/skills';

const set = (
  steps: GuidedLearningStep[],
  surface: GuidedLearningSet['surface'] = 'web'
): Pick<GuidedLearningSet, 'surface' | 'steps'> => ({ surface, steps });

describe('isMessageStep', () => {
  it('is true only for message: true with no web', () => {
    expect(isMessageStep(message('m'))).toBe(true);
    expect(isMessageStep(targeted('a', G1))).toBe(false);
    expect(isMessageStep({ ...targeted('a', G1), message: true })).toBe(false);
  });
});

describe('webTourSequenceOf', () => {
  it('keeps targeted and Message steps in authored order', () => {
    const steps = [message('m1'), targeted('a', G1), message('m2')];
    expect(webTourSequenceOf(set(steps)).map((s) => s.id)).toEqual([
      'm1',
      'a',
      'm2',
    ]);
  });

  it('drops steps with neither a target nor message, and non-web sets', () => {
    const plain = { ...message('x'), message: undefined };
    expect(webTourSequenceOf(set([plain, targeted('a', G1)]))).toHaveLength(1);
    expect(webTourSequenceOf({ steps: [targeted('a', G1)] })).toEqual([]);
    expect(webTourSequenceOf(set([message('m')], 'spartboard'))).toEqual([]);
  });
});

describe('hostOf', () => {
  it('reads the host, lowercased, with a port and wildcards kept', () => {
    expect(hostOf('https://Claude.ai/chat/*')).toBe('claude.ai');
    expect(hostOf('https://*.example.com/x')).toBe('*.example.com');
    expect(hostOf('http://localhost:3000/a')).toBe('localhost:3000');
    expect(hostOf('not a url')).toBeNull();
  });

  it('ignores userinfo and a default port', () => {
    expect(hostOf('https://claude.ai:443/x')).toBe('claude.ai');
    expect(hostOf('https://a@claude.ai/')).toBe('claude.ai');
  });
});

describe('switchUrlFor', () => {
  it('keeps a pattern with no wildcard whole', () => {
    expect(switchUrlFor('https://claude.ai/customize/skills')).toBe(
      'https://claude.ai/customize/skills'
    );
  });

  it('cuts at the first wildcard segment', () => {
    expect(switchUrlFor('https://claude.ai/chat/*')).toBe(
      'https://claude.ai/chat'
    );
    expect(switchUrlFor('https://claude.ai/*')).toBe('https://claude.ai/');
    expect(switchUrlFor('https://claude.ai/a/*/b')).toBe('https://claude.ai/a');
  });

  it('keeps query parameters and hash that have no wildcard', () => {
    expect(switchUrlFor('https://a.com/p?tab=1#*')).toBe(
      'https://a.com/p?tab=1'
    );
    expect(switchUrlFor('https://a.com/p?a=1&b=*')).toBe('https://a.com/p?a=1');
    expect(switchUrlFor('https://a@b.com/')).toBe('https://b.com/');
  });

  it('drops a wildcard query and keeps the path', () => {
    expect(switchUrlFor('https://claude.ai/new?q=*')).toBe(
      'https://claude.ai/new'
    );
  });

  it('is null when the host has a wildcard or the address is not https', () => {
    expect(switchUrlFor('https://*.example.com/x')).toBeNull();
    expect(switchUrlFor('http://example.com/x')).toBeNull();
  });
});

describe('siteSwitchesOf', () => {
  it('finds each switch in Gemini > Claude > Gemini', () => {
    const steps = [
      targeted('g1', G1),
      targeted('g2', G1),
      targeted('c1', C1),
      targeted('g3', 'https://gemini.google.com/gems'),
    ];
    expect(siteSwitchesOf(steps)).toEqual([
      { fromIndex: 1, toIndex: 2, host: 'claude.ai', goStepIndex: 1 },
      { fromIndex: 2, toIndex: 3, host: 'gemini.google.com', goStepIndex: 2 },
    ]);
    expect(needsCrossSite(steps)).toBe(true);
  });

  it('has none for one site', () => {
    const steps = [targeted('a', G1), targeted('b', G1 + '/x')];
    expect(siteSwitchesOf(steps)).toEqual([]);
    expect(needsCrossSite(steps)).toBe(false);
  });

  it('points Go at the Message step right before the next targeted step', () => {
    const steps = [targeted('g', G1), message('m'), targeted('c', C1)];
    expect(siteSwitchesOf(steps)).toEqual([
      { fromIndex: 0, toIndex: 2, host: 'claude.ai', goStepIndex: 1 },
    ]);
  });

  it('keeps Go on the last targeted step when the message comes earlier', () => {
    const steps = [message('m'), targeted('g', G1), targeted('c', C1)];
    expect(siteSwitchesOf(steps)[0].goStepIndex).toBe(1);
  });

  it('uses the Message step nearest the switch when several sit between', () => {
    const steps = [
      targeted('g', G1),
      message('m1'),
      message('m2'),
      targeted('c', C1),
    ];
    expect(siteSwitchesOf(steps)[0]).toMatchObject({
      fromIndex: 0,
      toIndex: 3,
      goStepIndex: 2,
    });
  });

  it('ignores Message steps between two steps on the same site', () => {
    const steps = [targeted('a', G1), message('m'), targeted('b', G1 + '/x')];
    expect(siteSwitchesOf(steps)).toEqual([]);
  });

  it('ignores Message steps at the start and the end', () => {
    const steps = [message('m1'), targeted('a', G1), message('m2')];
    expect(siteSwitchesOf(steps)).toEqual([]);
  });
});

describe('needsCrossSite', () => {
  it('is true for a Message step even on one site', () => {
    expect(needsCrossSite([message('m'), targeted('a', G1)])).toBe(true);
    expect(needsCrossSite([targeted('a', G1), message('m')])).toBe(true);
  });
});

describe('firstTargetedIndex', () => {
  it('skips Message steps at the start', () => {
    expect(
      firstTargetedIndex([message('m1'), message('m2'), targeted('a', G1)])
    ).toBe(2);
    expect(firstTargetedIndex([targeted('a', G1)])).toBe(0);
  });

  it('is -1 for a tour with no targeted step', () => {
    expect(firstTargetedIndex([message('m1'), message('m2')])).toBe(-1);
    expect(firstTargetedIndex([])).toBe(-1);
    expect(siteSwitchesOf([message('m1'), message('m2')])).toEqual([]);
    expect(needsCrossSite([message('m1')])).toBe(true);
  });
});
