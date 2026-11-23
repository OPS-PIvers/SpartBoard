// Start page and Step page: the pages an admin sets for where a web tour opens.
import { describe, expect, it, vi } from 'vitest';
import type { WebTourMessageStep } from '@/types';
import type { WebTourStep } from '@/components/widgets/GuidedLearning/utils/liveTour';
import { parseWebTourStartTour } from './extensionProtocol';
import {
  buildStartTour,
  openablePage,
  pageUrlOf,
  startUrlAt,
  startUrlOf,
} from './handoff';

vi.mock('@/config/firebase', () => ({
  storage: {},
  db: {},
  isConfigured: false,
}));

const step = (id: string, urlPattern: string, openUrl?: string): WebTourStep =>
  ({
    id,
    label: `Step ${id}`,
    text: 'Click it',
    web: {
      urlPattern,
      locator: { role: 'button', name: 'Save' },
      action: 'click',
      ...(openUrl ? { openUrl } : {}),
    },
  }) as unknown as WebTourStep;

const message = (id: string): WebTourMessageStep =>
  ({
    id,
    label: 'Next',
    text: 'On we go',
    message: true,
  }) as WebTourMessageStep;

const VIDS = 'https://docs.google.com/videos/d/*/edit';
const GEMINI = 'https://gemini.google.com/app';

describe('openablePage', () => {
  it('takes an https page and refuses the rest', () => {
    expect(openablePage('https://vids.new')).toBe('https://vids.new/');
    expect(openablePage(' https://vids.new/ ')).toBe('https://vids.new/');
    expect(openablePage('http://vids.new')).toBeNull();
    expect(openablePage('vids.new')).toBeNull();
    expect(openablePage('https://docs.google.com/videos/d/*/edit')).toBeNull();
    expect(openablePage('https://me:pw@vids.new')).toBeNull();
    expect(openablePage('')).toBeNull();
    expect(openablePage(undefined)).toBeNull();
  });
});

describe('start page', () => {
  const steps = [step('a', VIDS), step('b', VIDS)];

  it('opens the start page instead of the site root a wildcard path guesses', () => {
    expect(startUrlOf(steps)).toBe('https://docs.google.com/');
    expect(startUrlOf(steps, 'https://vids.new')).toBe('https://vids.new/');
  });

  it('falls back to the guess when the start page is blank or not openable', () => {
    expect(startUrlOf(steps, '')).toBe('https://docs.google.com/');
    expect(startUrlOf(steps, 'vids.new')).toBe('https://docs.google.com/');
  });

  it('uses the start page for a start up to the first targeted step only', () => {
    const withMessage = [message('m'), ...steps];
    expect(startUrlAt(withMessage, 0, 'https://vids.new')).toBe(
      'https://vids.new/'
    );
    expect(startUrlAt(withMessage, 1, 'https://vids.new')).toBe(
      'https://vids.new/'
    );
    expect(startUrlAt(withMessage, 2, 'https://vids.new')).toBe(
      'https://docs.google.com/'
    );
  });
});

describe('step page', () => {
  it('opens a step on its set page, and a Message step on the next one', () => {
    const steps = [
      step('a', GEMINI),
      message('m'),
      step('b', VIDS, 'https://vids.new'),
    ];
    expect(pageUrlOf(steps, 2)).toBe('https://vids.new/');
    expect(pageUrlOf(steps, 1)).toBe('https://vids.new/');
    expect(startUrlOf([steps[2]])).toBe('https://vids.new/');
  });

  it('never reopens the step before a closing Message step, which would make another new file', () => {
    const steps = [step('a', VIDS, 'https://vids.new'), message('m')];
    expect(pageUrlOf(steps, 1)).toBe('https://docs.google.com/');
  });

  it('sends set pages only to an extension that opens them', () => {
    const steps = [step('a', GEMINI), step('b', VIDS, 'https://vids.new')];
    const old = buildStartTour('set', 1, 'T', steps, new Map(), true, true);
    expect(old.openUrls).toBeUndefined();
    expect(parseWebTourStartTour(old)).not.toBeNull();
    const now = buildStartTour(
      'set',
      1,
      'T',
      steps,
      new Map(),
      true,
      true,
      true
    );
    expect(now.openUrls).toEqual({ b: 'https://vids.new/' });
    expect(parseWebTourStartTour(now)?.openUrls).toEqual({
      b: 'https://vids.new/',
    });
  });

  it('refuses a set page for an unknown step or a page that cannot be opened', () => {
    const tour = buildStartTour('set', 1, 'T', [step('a', GEMINI)], new Map());
    expect(
      parseWebTourStartTour({ ...tour, openUrls: { z: 'https://vids.new/' } })
    ).toBeNull();
    expect(
      parseWebTourStartTour({ ...tour, openUrls: { a: 'http://vids.new/' } })
    ).toBeNull();
    expect(
      parseWebTourStartTour({ ...tour, openUrls: { a: 'https://x.com/*' } })
    ).toBeNull();
  });
});
