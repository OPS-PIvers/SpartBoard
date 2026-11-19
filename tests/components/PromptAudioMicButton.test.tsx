import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { PromptAudioMicButton } from '@/components/widgets/QuizWidget/components/PromptAudioField';
import type { PromptAudioState } from '@/components/widgets/QuizWidget/components/PromptAudioField';

const audio = { driveFileId: 'f1', durationSec: 12, mimeType: 'audio/mp4' };

const makeState = (onChange = vi.fn()): PromptAudioState =>
  ({
    audio,
    onChange,
    saving: false,
    recorder: { phase: 'idle', elapsed: 0, start: vi.fn(), stop: vi.fn() },
  }) as unknown as PromptAudioState;

const renderInEditorDialog = (state = makeState()) =>
  render(
    <div role="dialog" aria-label="Quiz editor">
      <p>Prompt text</p>
      <PromptAudioMicButton state={state} canRecord />
    </div>
  );

const popover = () => screen.queryByRole('dialog', { name: 'Question audio' });

describe('PromptAudioMicButton popover', () => {
  it('closes on a click away inside the editor dialog', () => {
    renderInEditorDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Question audio' }));
    expect(popover()).not.toBeNull();
    fireEvent.pointerDown(screen.getByText('Prompt text'));
    expect(popover()).toBeNull();
  });

  it('stays open for clicks inside the popover', () => {
    renderInEditorDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Question audio' }));
    fireEvent.pointerDown(screen.getByRole('radio', { name: 'None' }));
    expect(popover()).not.toBeNull();
  });

  it('closes on Escape without reaching the editor', () => {
    const editorEscape = vi.fn();
    window.addEventListener('keydown', editorEscape);
    renderInEditorDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Question audio' }));
    fireEvent.keyDown(document.body, { key: 'Escape' });
    window.removeEventListener('keydown', editorEscape);
    expect(popover()).toBeNull();
    expect(editorEscape).not.toHaveBeenCalled();
  });

  it('sets the replay limit from the segmented control', () => {
    const onChange = vi.fn();
    renderInEditorDialog(makeState(onChange));
    fireEvent.click(screen.getByRole('button', { name: 'Question audio' }));
    fireEvent.click(screen.getByRole('radio', { name: '2' }));
    expect(onChange).toHaveBeenCalledWith({ ...audio, playLimit: 3 });
    fireEvent.click(screen.getByRole('radio', { name: 'Unlimited' }));
    expect(onChange).toHaveBeenLastCalledWith(audio);
  });
});
