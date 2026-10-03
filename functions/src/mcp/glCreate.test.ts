import { describe, expect, it } from 'vitest';
import {
  buildNewSet,
  createSource,
  validateCreate,
  type CreateInput,
} from './glCreate';
import type { StepInput } from './glTools';

const step = (over: Partial<StepInput> = {}): StepInput => ({
  id: 's1',
  xPct: 50,
  yPct: 50,
  imageIndex: 0,
  interactionType: 'tooltip',
  text: 'Click **Share**.',
  ...over,
});

const tourStep = (over: Partial<StepInput> = {}): StepInput =>
  step({ tour: { anchor: 'dock.open-tools', action: 'click' }, ...over });

const input = (over: Partial<CreateInput> = {}): CreateInput => ({
  kind: 'live_tour',
  title: ' Open the dock ',
  steps: [tourStep()],
  ...over,
});

describe('create_guided_learning', () => {
  it('saves live tours as building sets and refuses a personal one', () => {
    expect(createSource(input())).toBe('building');
    expect(() => createSource(input({ source: 'mine' }))).toThrow(
      /building sets/
    );
    expect(createSource(input({ kind: 'standard' }))).toBe('mine');
    expect(createSource(input({ kind: 'standard', source: 'building' }))).toBe(
      'building'
    );
  });

  it('builds a slideless live tour with its setup widgets', () => {
    const steps = validateCreate(
      input({ tour_widgets: ['clock', 'clock'], description: '' })
    );
    const set = buildNewSet(
      input({ tour_widgets: ['clock', 'clock'], description: '' }),
      { id: 'g1', uid: 'u1', now: 5 },
      'building',
      steps,
      { urls: [], paths: [] }
    );
    expect(set).toMatchObject({
      id: 'g1',
      title: 'Open the dock',
      imageUrls: [],
      mode: 'tour',
      isBuilding: true,
      authorUid: 'u1',
      hasLiveTour: true,
      tourSetup: { widgets: ['clock'] },
      schemaVersion: 3,
      createdAt: 5,
      updatedAt: 5,
    });
    expect(set).not.toHaveProperty('description');
    expect(set).not.toHaveProperty('imagePaths');
    expect(Object.values(set)).not.toContain(undefined);
  });

  it('starts a tour with Autopilot on only when asked', () => {
    const req = input({ autopilot: true });
    const set = buildNewSet(
      req,
      { id: 'g2', uid: 'u1', now: 5 },
      'building',
      validateCreate(req),
      { urls: [], paths: [] }
    );
    expect(set.tourSetup).toEqual({ widgets: [], autopilot: true });
  });

  it('accepts whole-board opening steps only as observe steps', () => {
    const board = (action: 'observe' | 'click') =>
      tourStep({ tour: { anchor: 'board.whole', action } });
    expect(() =>
      validateCreate(input({ steps: [board('observe')] }))
    ).not.toThrow();
    expect(() => validateCreate(input({ steps: [board('click')] }))).toThrow(
      /"board.whole" steps observe/
    );
  });

  it('needs a tour binding on every live tour step and imageIndex 0 without slides', () => {
    expect(() => validateCreate(input({ steps: [step()] }))).toThrow(
      /steps\[0\]: every live tour step needs a tour binding/
    );
    expect(() =>
      validateCreate(input({ steps: [tourStep(), step({ id: 's2' })] }))
    ).toThrow(/steps\[1\]: every live tour step/);
    expect(() =>
      validateCreate(input({ steps: [tourStep({ imageIndex: 1 })] }))
    ).toThrow(/must be 0 when there are no slides/);
  });

  it('refuses unknown anchors and widget types', () => {
    expect(() =>
      validateCreate(
        input({
          steps: [tourStep({ tour: { anchor: 'nope.x', action: 'click' } })],
        })
      )
    ).toThrow(/not a SpartBoard tour anchor/);
    expect(() => validateCreate(input({ tour_widgets: ['clocks'] }))).toThrow(
      /"clocks" is not a widget type/
    );
    expect(() =>
      validateCreate(
        input({ help_center: { category_id: 'admin', widget_types: ['nope'] } })
      )
    ).toThrow(/help_center.widget_types: "nope" is not a widget type/);
  });

  it('marks a Help Center tour so the library hides it', () => {
    const req = input({ help_center: { category_id: 'admin' } });
    const set = buildNewSet(
      req,
      { id: 'g3', uid: 'u1', now: 9 },
      'building',
      validateCreate(req),
      { urls: [], paths: [] }
    );
    expect(set).toMatchObject({ helpCenter: true, hasLiveTour: true });
    expect(
      buildNewSet(
        input(),
        { id: 'g4', uid: 'u1', now: 9 },
        'building',
        validateCreate(input()),
        { urls: [], paths: [] }
      )
    ).not.toHaveProperty('helpCenter');
  });

  it('needs slides on a standard activity and keeps tours out of it', () => {
    const standard = (over: Partial<CreateInput> = {}) =>
      input({ kind: 'standard', steps: [step()], ...over });
    expect(() => validateCreate(standard())).toThrow(/at least one slide/);
    const slides = { slide_urls: ['https://example.com/a.png'] };
    expect(() =>
      validateCreate(standard({ ...slides, steps: [tourStep()] }))
    ).toThrow(/apply only to live tours/);
    expect(() =>
      validateCreate(standard({ ...slides, tour_widgets: ['clock'] }))
    ).toThrow(/only to live tours/);
    expect(() =>
      validateCreate(standard({ ...slides, steps: [step({ imageIndex: 1 })] }))
    ).toThrow(/past the last slide \(0\)/);
  });

  it('builds a personal standard set with its slide paths', () => {
    const req = input({
      kind: 'standard',
      slide_urls: ['https://example.com/a.png'],
      welcome_enabled: true,
      welcome_message: 'Hi',
      steps: [step({ calloutTone: 'light' })],
    });
    const set = buildNewSet(
      req,
      { id: 'g2', uid: 'u1', now: 7 },
      'mine',
      validateCreate(req),
      { urls: ['https://s/a'], paths: ['users/u1/hotspot_images/a.png'] }
    );
    expect(set).toMatchObject({
      imageUrls: ['https://s/a'],
      imagePaths: ['users/u1/hotspot_images/a.png'],
      welcomeEnabled: true,
      welcomeMessage: 'Hi',
      schemaVersion: 4,
    });
    expect(set).not.toHaveProperty('isBuilding');
    expect(set).not.toHaveProperty('tourSetup');
    expect(set).not.toHaveProperty('hasLiveTour');
  });
});
