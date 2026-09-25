import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type {
  GuidedLearningMode,
  GuidedLearningPublicStep,
  GuidedLearningSet,
} from '@/types';
import { GuidedLearningPlayer } from '../GuidedLearningPlayer';
import { GuidedLearningStage } from '../GuidedLearningStage';
import { DeviceFrame } from './DeviceFrame';
import { DEVICE_PRESETS, customPreset } from './devicePresets';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

const NO_ANSWERS: ReadonlySet<string> = new Set();
const noop = () => undefined;

const makeSet = (mode: GuidedLearningMode): GuidedLearningSet => ({
  id: 'set',
  schemaVersion: 3,
  title: 'Timer tour',
  imageUrls: ['https://example.com/slide.png'],
  steps: [
    {
      id: 's1',
      xPct: 40,
      yPct: 30,
      imageIndex: 0,
      interactionType: 'text-popover',
      showOverlay: 'popover',
      text: 'Click **Start**',
    },
    {
      id: 's2',
      xPct: 60,
      yPct: 60,
      imageIndex: 0,
      interactionType: 'tooltip',
      text: 'Then this',
    },
  ],
  mode,
  createdAt: 1,
  updatedAt: 1,
});

/** Everything that sizes the stage: each box from the stage up to the frame. */
function stageChain(root: HTMLElement) {
  const stage = root.querySelector('[data-gl-stage]');
  if (!stage) throw new Error('no stage');
  const chain: string[] = [];
  let el = stage.parentElement;
  while (el && el.dataset.testid !== 'gl-device-stage') {
    chain.push(`${el.className}|${el.getAttribute('style') ?? ''}`);
    el = el.parentElement;
  }
  const frame = root.querySelector<HTMLElement>(
    '[data-testid="gl-device-frame"]'
  );
  return { chain, frame: frame?.getAttribute('style') };
}

function bar(root: HTMLElement, selector: string) {
  const el = root.querySelector(selector);
  return el ? `${el.className}|${el.getAttribute('style') ?? ''}` : null;
}

describe('Studio frame matches the student player', () => {
  it.each(
    [...DEVICE_PRESETS, customPreset(480, 360)].flatMap((preset) =>
      (['guided', 'structured', 'explore'] as const).flatMap((mode) =>
        [false, true].map((playerV2) => ({ preset, mode, playerV2 }))
      )
    )
  )(
    '$preset.id, $mode, v2 $playerV2: same boxes around the stage',
    ({ preset, mode, playerV2 }) => {
      const set = makeSet(mode);
      const studio = render(
        <DeviceFrame
          preset={preset}
          chrome={{
            title: set.title,
            mode,
            playerV2,
            steps: set.steps as unknown as GuidedLearningPublicStep[],
            stepIndex: 0,
            imageCount: set.imageUrls.length,
            imageIndex: 0,
          }}
        >
          <GuidedLearningStage
            set={set}
            steps={set.steps as unknown as GuidedLearningPublicStep[]}
            imageIndex={0}
            activeStepId="s1"
            authorMode="explore"
            answeredStepIds={NO_ANSWERS}
            teacherMode
            zoomScale={1}
            forceOverlay
            onPinClick={noop}
            onAdvance={noop}
            onDismiss={noop}
          />
        </DeviceFrame>
      ).container;
      const player = render(
        <DeviceFrame preset={preset}>
          <GuidedLearningPlayer set={set} teacherMode playerV2={playerV2} />
        </DeviceFrame>
      ).container;

      expect(stageChain(studio)).toEqual(stageChain(player));
      expect(bar(studio, '[data-gl-topbar]')).toEqual(
        bar(player, '[data-gl-topbar]')
      );
      expect(bar(studio, '[data-gl-footer]')).toEqual(
        bar(player, '[data-gl-footer]')
      );
      expect(Boolean(studio.querySelector('[data-gl-footer]'))).toBe(
        mode !== 'explore'
      );
      // The chrome's text sizes resolve against the same container box.
      expect(
        studio.querySelector('[data-testid="gl-mode-chip"]')?.outerHTML
      ).toEqual(
        player.querySelector('[data-testid="gl-mode-chip"]')?.outerHTML
      );
    }
  );

  it('keeps the Studio bars out of the tab order and accessibility tree', () => {
    const set = makeSet('guided');
    const { container } = render(
      <DeviceFrame
        preset={DEVICE_PRESETS[0]}
        chrome={{
          title: set.title,
          mode: 'guided',
          steps: set.steps as unknown as GuidedLearningPublicStep[],
          stepIndex: 0,
          imageCount: 1,
          imageIndex: 0,
        }}
      >
        <div data-gl-stage="" />
      </DeviceFrame>
    );
    for (const sel of ['[data-gl-topbar]', '[data-gl-footer]']) {
      const el = container.querySelector(sel);
      expect(el).toHaveAttribute('inert');
      expect(el).toHaveAttribute('aria-hidden', 'true');
    }
  });
});
