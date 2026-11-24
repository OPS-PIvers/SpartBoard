import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DictationController } from '@/utils/speechToText/types';
import { DictateButton } from './DictateButton';

const controller = (
  overrides: Partial<DictationController> = {}
): DictationController => ({
  supported: true,
  status: 'idle',
  error: null,
  interim: '',
  language: 'en',
  languages: ['en'],
  setLanguage: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  toggle: vi.fn(),
  ...overrides,
});

describe('DictateButton', () => {
  it('renders nothing when dictation is unsupported', () => {
    const { container } = render(
      <DictateButton controller={controller({ supported: false })} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows Dictate and toggles on click', () => {
    const c = controller();
    render(<DictateButton controller={c} light />);
    const button = screen.getByRole('button', { name: 'Dictate' });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(button);
    expect(c.toggle).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('keeps focus in the text box on mouse down', () => {
    render(<DictateButton controller={controller()} />);
    const event = new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
    });
    screen.getByRole('button', { name: 'Dictate' }).dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('shows the listening state', () => {
    render(<DictateButton controller={controller({ status: 'listening' })} />);
    const button = screen.getByRole('button', {
      name: 'Listening… tap to stop',
    });
    expect(button).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows the starting state as busy', () => {
    render(<DictateButton controller={controller({ status: 'starting' })} />);
    expect(screen.getByRole('button', { name: 'Starting…' })).toHaveAttribute(
      'aria-busy',
      'true'
    );
  });

  it('respects disabled', () => {
    const c = controller();
    render(<DictateButton controller={c} disabled />);
    const button = screen.getByRole('button', { name: 'Dictate' });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(c.toggle).not.toHaveBeenCalled();
  });

  it('offers a language switch with native names', () => {
    const c = controller({ languages: ['en', 'es'] });
    render(<DictateButton controller={c} />);
    const select = screen.getByRole('combobox', { name: 'Dictation language' });
    expect(screen.getByRole('option', { name: 'English' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Español' })).toBeInTheDocument();
    fireEvent.change(select, { target: { value: 'es' } });
    expect(c.setLanguage).toHaveBeenCalledWith('es');
  });

  it.each([
    ['mic-blocked', /Microphone is blocked/],
    ['no-mic', /No microphone found/],
    ['network', /needs the internet/],
    ['language-unsupported', /listening in English/],
    ['unknown', /Dictate stopped/],
  ] as const)('explains the %s error', (error, text) => {
    render(<DictateButton controller={controller({ error })} />);
    expect(screen.getByRole('status')).toHaveTextContent(text);
  });

  it('compact size is an icon button with a label', () => {
    const c = controller();
    render(<DictateButton controller={c} size="compact" />);
    const button = screen.getByRole('button', { name: 'Dictate' });
    expect(button).toHaveTextContent('');
    fireEvent.click(button);
    expect(c.toggle).toHaveBeenCalledTimes(1);
  });

  it('compact size shows listening and errors without visible text', () => {
    const { rerender } = render(
      <DictateButton
        controller={controller({ status: 'listening' })}
        size="compact"
      />
    );
    expect(
      screen.getByRole('button', { name: 'Stop dictating' })
    ).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('Listening');

    rerender(
      <DictateButton
        controller={controller({ error: 'mic-blocked' })}
        size="compact"
      />
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      /Microphone is blocked/
    );
    expect(screen.getByRole('button', { name: 'Dictate' })).toHaveAttribute(
      'title',
      expect.stringMatching(/Microphone is blocked/)
    );
  });

  it('compact size cycles the language', () => {
    const c = controller({ languages: ['en', 'es'], language: 'es' });
    render(<DictateButton controller={c} size="compact" />);
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Dictating in Español. Switch to English.',
      })
    );
    expect(c.setLanguage).toHaveBeenCalledWith('en');
  });
});
