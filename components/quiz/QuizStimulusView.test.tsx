import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { StimulusRenderer } from './QuizStimulusView';
import type { QuizStimulus } from '@/types';

const audio = (overrides: Partial<QuizStimulus> = {}): QuizStimulus => ({
  id: 'stim-1',
  type: 'audio',
  url: 'https://example.com/clip.mp3',
  label: 'Listening clip',
  ...overrides,
});

// The player is rendered without an accessible role, so query the raw element.
const player = (container: HTMLElement) => container.querySelector('audio');

describe('StimulusRenderer play limit', () => {
  it('renders the player and the remaining count while plays are left', () => {
    const { container } = render(
      <StimulusRenderer stimulus={audio({ playLimit: 2 })} playsUsed={1} />
    );
    expect(player(container)).not.toBeNull();
    expect(screen.getByText('1 play remaining')).toBeTruthy();
  });

  it('blocks the player once the plays are used up', () => {
    const { container } = render(
      <StimulusRenderer stimulus={audio({ playLimit: 2 })} playsUsed={2} />
    );
    expect(player(container)).toBeNull();
    expect(screen.getByText('Play limit reached (2 plays).')).toBeTruthy();
  });

  it('treats an over-count as exhausted rather than showing negative plays', () => {
    const { container } = render(
      <StimulusRenderer stimulus={audio({ playLimit: 1 })} playsUsed={5} />
    );
    expect(player(container)).toBeNull();
    expect(screen.getByText('Play limit reached (1 play).')).toBeTruthy();
  });

  it('leaves an unlimited stimulus uncounted', () => {
    const { container } = render(
      <StimulusRenderer stimulus={audio()} playsUsed={99} />
    );
    expect(player(container)).not.toBeNull();
    expect(screen.queryByText(/plays? remaining/)).toBeNull();
  });

  it('counts a play only when the media reaches the end', () => {
    const onPlayCompleted = vi.fn();
    const { container } = render(
      <StimulusRenderer
        stimulus={audio({ playLimit: 2 })}
        playsUsed={0}
        onPlayCompleted={onPlayCompleted}
      />
    );
    const el = player(container);
    if (!el) throw new Error('expected an audio element');
    fireEvent.pause(el);
    expect(onPlayCompleted).not.toHaveBeenCalled();
    fireEvent.ended(el);
    expect(onPlayCompleted).toHaveBeenCalledWith('stim-1');
  });

  it('ignores the limit when enforcement is off (monitor and review views)', () => {
    const { container } = render(
      <StimulusRenderer
        stimulus={audio({ playLimit: 1 })}
        playsUsed={3}
        enforcePlayLimit={false}
      />
    );
    expect(player(container)).not.toBeNull();
    expect(screen.queryByText(/Play limit reached/)).toBeNull();
  });

  it('reports a load failure and offers a scoped reload', () => {
    const onLoadError = vi.fn();
    const { container } = render(
      <StimulusRenderer stimulus={audio()} onLoadError={onLoadError} />
    );
    const el = player(container);
    if (!el) throw new Error('expected an audio element');
    fireEvent.error(el);
    expect(onLoadError).toHaveBeenCalledWith('stim-1');
    expect(player(container)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /reload/i }));
    expect(player(container)).not.toBeNull();
  });
});
