import { describe, expect, it } from 'vitest';
import {
  glSlideStoragePath,
  mergeSteps,
  requiredSchemaVersion,
  revisionStepsFitSlides,
  stepInput,
  type StepInput,
} from './glTools';

const step = (over: Partial<StepInput> = {}): StepInput => ({
  id: 's1',
  xPct: 50,
  yPct: 50,
  imageIndex: 0,
  label: '',
  interactionType: 'tooltip',
  text: 'Click **Share**.',
  ...over,
});

describe('Guided Learning step edits', () => {
  it('keeps the files a stored step owns and ignores them from Claude', () => {
    const stored = [
      {
        id: 's1',
        imageIndex: 0,
        narration: {
          source: 'generated',
          url: 'https://x/n.mp3',
          storagePath: 'n.mp3',
          durationMs: 900,
        },
        audioUrl: 'https://firebasestorage.googleapis.com/v0/b/b/o/a.mp3',
        audioStoragePath: 'a.mp3',
      },
    ];
    const [merged] = mergeSteps(
      stored,
      [
        step({
          interactionType: 'audio',
          audioUrl: 'https://firebasestorage.googleapis.com/v0/b/b/o/a.mp3',
          has_narration: true,
        }),
      ],
      1
    );
    expect(merged.narration).toEqual(stored[0].narration);
    expect(merged).not.toHaveProperty('has_narration');
    expect(merged.audioStoragePath).toBe('a.mp3');
  });

  it('drops the stored file when the media link changes, and refuses a new Storage link', () => {
    const stored = [
      {
        id: 's1',
        imageIndex: 0,
        audioUrl: 'https://firebasestorage.googleapis.com/o/a',
        audioStoragePath: 'a',
      },
    ];
    const [merged] = mergeSteps(
      stored,
      [
        step({
          interactionType: 'audio',
          audioUrl: 'https://example.com/b.mp3',
        }),
      ],
      1
    );
    expect(merged.audioStoragePath).toBeUndefined();
    expect(() =>
      mergeSteps(
        stored,
        [
          step({
            interactionType: 'audio',
            audioUrl: 'https://firebasestorage.googleapis.com/o/other',
          }),
        ],
        1
      )
    ).toThrow(/outside https link/);
  });

  it('rejects slides that do not exist, repeated ids and bad text', () => {
    expect(() => mergeSteps([], [step({ imageIndex: 2 })], 2)).toThrow(
      /past the last slide/
    );
    expect(() => mergeSteps([], [step(), step()], 1)).toThrow(/used twice/);
    expect(() => mergeSteps([], [step({ text: 'a\n\nb\n\nc' })], 1)).toThrow(
      /one paragraph/
    );
    expect(
      mergeSteps(
        [],
        [step({ text: 'Click **Share**.\n\nSubs also see it in ClassLink.' })],
        1
      )
    ).toHaveLength(1);
  });

  it('checks regions, callout boxes and questions like the importer', () => {
    expect(() =>
      mergeSteps(
        [],
        [step({ xPct: 98, region: { shape: 'rect', wPct: 10, hPct: 5 } })],
        1
      )
    ).toThrow(/outside the slide/);
    expect(() =>
      mergeSteps(
        [],
        [
          step({
            calloutBox: { xPct: 0, yPct: 0, wPct: 20, hPct: 10 },
            tooltipPosition: 'auto',
          }),
        ],
        1
      )
    ).toThrow(/leave it out/);
    expect(() =>
      mergeSteps(
        [],
        [step({ interactionType: 'spotlight', calloutTone: 'accent' })],
        1
      )
    ).toThrow(/show a callout/);
    expect(() =>
      mergeSteps(
        [],
        [
          step({
            interactionType: 'question',
            question: {
              type: 'multiple-choice',
              text: 'Q',
              choices: ['a', 'b'],
              correctAnswer: 'c',
            },
          }),
        ],
        1
      )
    ).toThrow(/correctAnswer/);
  });

  it('accepts an untagged tour step only with a fallback', () => {
    expect(() =>
      mergeSteps([], [step({ tour: { anchor: '', action: 'click' } })], 1)
    ).toThrow(/fallback/);
    expect(
      mergeSteps(
        [],
        [
          step({
            tour: {
              anchor: '',
              action: 'click',
              fallback: { role: 'button', name: 'Assign' },
            },
          }),
        ],
        1
      )
    ).toHaveLength(1);
  });

  it('takes a value that fits the step kind', () => {
    const tour = (
      action: 'click' | 'observe' | 'toggle' | 'select' | 'type',
      value?: boolean | string
    ) =>
      step({
        tour: {
          anchor: 'sidebar.boards',
          action,
          ...(value !== undefined ? { value } : {}),
        },
      });
    expect(mergeSteps([], [tour('toggle', false)], 1)).toHaveLength(1);
    expect(mergeSteps([], [tour('type', 'Warm up')], 1)).toHaveLength(1);
    expect(mergeSteps([], [tour('select', 'serif')], 1)).toHaveLength(1);
    expect(() => mergeSteps([], [tour('toggle', 'on')], 1)).toThrow(
      /boolean value/
    );
    expect(() => mergeSteps([], [tour('type')], 1)).toThrow(/string value/);
    expect(() => mergeSteps([], [tour('click', true)], 1)).toThrow(/no value/);
  });

  it('takes missing_anchor only on an untagged step and never saves it', () => {
    const missing = { where: 'Assign menu, last item' };
    expect(() =>
      mergeSteps(
        [],
        [
          step({
            tour: { anchor: 'widget.pin', action: 'click' },
            missing_anchor: missing,
          }),
        ],
        1
      )
    ).toThrow(/missing_anchor/);
    const [merged] = mergeSteps(
      [],
      [
        step({
          tour: {
            anchor: '',
            action: 'click',
            fallback: { role: 'button', name: 'Assign' },
          },
          missing_anchor: missing,
        }),
      ],
      1
    );
    expect(merged).not.toHaveProperty('missing_anchor');
  });

  it('refuses an unknown anchor unless the stored step already had it', () => {
    const tour = (anchor: string) =>
      step({ tour: { anchor, action: 'click' } });
    expect(mergeSteps([], [tour('dock.item:clock')], 1)).toHaveLength(1);
    expect(() => mergeSteps([], [tour('made.up')], 1)).toThrow(
      /list_tour_anchors/
    );
    expect(
      mergeSteps(
        [
          {
            id: 's1',
            imageIndex: 0,
            tour: { anchor: 'made.up', action: 'click' },
          },
        ],
        [tour('made.up')],
        1
      )
    ).toHaveLength(1);
  });

  it('accepts every stored step field the app writes', () => {
    expect(
      stepInput.safeParse({
        ...step(),
        calloutTone: 'dark',
        tour: {
          anchor: 'dock.item:clock',
          action: 'click',
          unmapped: 'Clock',
          spawns: {
            slot: 0,
            type: 'clock',
            xProp: 0.1,
            yProp: 0.1,
            wProp: 0.3,
            hProp: 0.3,
            appearance: { fontFamily: 'mono' },
          },
        },
      }).success
    ).toBe(true);
  });

  it('refuses fields Claude must not set', () => {
    expect(
      stepInput.safeParse({ ...step(), audioStoragePath: 'someone/else.mp3' })
        .success
    ).toBe(false);
    expect(
      stepInput.safeParse({ ...step(), narration: { source: 'generated' } })
        .success
    ).toBe(false);
  });

  it('stamps the schema version the steps need', () => {
    expect(requiredSchemaVersion([{ id: 'a', imageIndex: 0 }])).toBe(3);
    expect(
      requiredSchemaVersion([{ id: 'a', imageIndex: 0, calloutTone: 'accent' }])
    ).toBe(4);
    expect(
      requiredSchemaVersion([
        {
          id: 'a',
          imageIndex: 0,
          calloutBox: { xPct: 0, yPct: 0, wPct: 1, hPct: 1 },
        },
      ])
    ).toBe(5);
  });

  it('reads Storage slides only from Guided Learning upload folders', () => {
    const at = (path: string, bucket = 'sb') =>
      new URL(
        `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media`
      );
    const own = 'users/u1/hotspot_images/1-a.png';
    expect(glSlideStoragePath(at(own), 'sb', 'u1', 'mine')).toBe(own);
    expect(() =>
      glSlideStoragePath(
        at('users/u2/hotspot_images/1-a.png'),
        'sb',
        'u1',
        'mine'
      )
    ).toThrow(/cannot read/);
    expect(
      glSlideStoragePath(
        at('users/u2/hotspot_images/1-a.png'),
        'sb',
        'u1',
        'building'
      )
    ).toBe('users/u2/hotspot_images/1-a.png');
    for (const bad of [
      'quiz_response_media/s/r/a.png',
      'users/u1/notebooks/a.png',
      'users/u1/hotspot_images/../../x/a.png',
    ])
      expect(() => glSlideStoragePath(at(bad), 'sb', 'u1', 'building')).toThrow(
        /cannot read/
      );
    expect(() =>
      glSlideStoragePath(at(own, 'other'), 'sb', 'u1', 'mine')
    ).toThrow(/cannot read/);
  });
});

describe('revisionStepsFitSlides', () => {
  it('lets a recorder-made tour with no slides restore', () => {
    expect(
      revisionStepsFitSlides({ mode: 'tour', imageUrls: [] }, [
        { imageIndex: 0 },
        { imageIndex: 0 },
      ])
    ).toBe(true);
  });

  it('still refuses a standard set whose slides are gone', () => {
    const set = { mode: 'structured', imageUrls: ['a'] };
    expect(revisionStepsFitSlides(set, [{ imageIndex: 0 }])).toBe(true);
    expect(revisionStepsFitSlides(set, [{ imageIndex: 1 }])).toBe(false);
  });
});
