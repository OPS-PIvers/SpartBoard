import React, { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { QuizQuestion } from '@/types';
import { ChoiceOptionsEditor } from './ChoiceOptionsEditor';
import {
  MatchingAnswerEditor,
  OrderingAnswerEditor,
} from './MatchingOrderingEditor';

const URL_A = 'https://lh3.googleusercontent.com/d/a';
const URL_B = 'https://lh3.googleusercontent.com/d/b';
const png = new File(['x'], 'shot.png', { type: 'image/png' });
const imagePaste = { files: [png], types: ['Files'] };
const flush = () => act(async () => Promise.resolve());

const mc: QuizQuestion = {
  id: 'q1',
  type: 'MC',
  text: 'Pick',
  timeLimit: 30,
  correctAnswer: 'Right',
  incorrectAnswers: ['Wrong'],
};

const seen: { q?: QuizQuestion } = {};
const ChoiceHarness: React.FC<{
  initial: QuizQuestion;
  upload?: (file: File) => Promise<string | null>;
}> = ({ initial, upload }) => {
  const [q, setQ] = useState(initial);
  return (
    <ChoiceOptionsEditor
      question={q}
      onChange={(u) => {
        seen.q = { ...(seen.q ?? initial), ...u };
        setQ((prev) => ({ ...prev, ...u }));
      }}
      onUploadImage={upload}
    />
  );
};

describe('ChoiceOptionsEditor pictures', () => {
  beforeEach(() => {
    seen.q = undefined;
  });

  it('pastes a copied image onto the option being edited', async () => {
    const upload = vi.fn().mockResolvedValue(URL_A);
    render(<ChoiceHarness initial={mc} upload={upload} />);
    fireEvent.paste(screen.getByRole('textbox', { name: 'Option B' }), {
      clipboardData: imagePaste,
    });
    await flush();
    expect(upload).toHaveBeenCalledWith(png);
    expect(seen.q?.answerImages).toEqual([{ text: 'Wrong', url: URL_A }]);
  });

  it('leaves copied text to paste as text', () => {
    const upload = vi.fn();
    render(<ChoiceHarness initial={mc} upload={upload} />);
    fireEvent.paste(screen.getByRole('textbox', { name: 'Option A' }), {
      clipboardData: { files: [png], types: ['text/plain', 'Files'] },
    });
    expect(upload).not.toHaveBeenCalled();
  });

  it('keeps a picture on its option when the text is edited', () => {
    render(
      <ChoiceHarness
        initial={{ ...mc, answerImages: [{ text: 'Wrong', url: URL_A }] }}
        upload={vi.fn()}
      />
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'Option B' }), {
      target: { value: 'Still wrong' },
    });
    expect(seen.q?.answerImages).toEqual([{ text: 'Still wrong', url: URL_A }]);
  });

  it('removes a picture', () => {
    render(
      <ChoiceHarness
        initial={{ ...mc, answerImages: [{ text: 'Wrong', url: URL_A }] }}
        upload={vi.fn()}
      />
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove image from option B' })
    );
    expect(seen.q?.answerImages).toBeUndefined();
  });

  it('asks for text when a blank option gets a picture', async () => {
    const upload = vi.fn().mockResolvedValue(URL_A);
    render(
      <ChoiceHarness
        initial={{ ...mc, incorrectAnswers: [''] }}
        upload={upload}
      />
    );
    fireEvent.paste(screen.getByRole('textbox', { name: 'Option B' }), {
      clipboardData: imagePaste,
    });
    await flush();
    expect(screen.getByRole('textbox', { name: 'Option B' })).toHaveAttribute(
      'placeholder',
      'Add text for this image'
    );
  });

  // Unpositioned, its hit area stretches over the whole editor and takes every click.
  it('keeps the add button hit area on the button', () => {
    render(<ChoiceHarness initial={mc} upload={vi.fn()} />);
    expect(
      screen.getByRole('button', { name: 'Add image to option A' })
    ).toHaveClass('relative', 'touch-target-expand');
  });

  it('hides the buttons without an upload', () => {
    render(<ChoiceHarness initial={mc} />);
    expect(
      screen.queryByRole('button', { name: 'Add image to option A' })
    ).toBeNull();
  });

  it('only lets a saved picture be removed without an upload', () => {
    render(
      <ChoiceHarness
        initial={{ ...mc, answerImages: [{ text: 'Wrong', url: URL_A }] }}
      />
    );
    expect(
      screen.getByRole('button', { name: 'Remove image from option B' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Add image to option A' })
    ).toBeNull();
  });

  it('keeps a switch to choose-all made during an upload', async () => {
    let finish: (url: string) => void = () => undefined;
    const upload = vi.fn(
      () => new Promise<string>((resolve) => (finish = resolve))
    );
    render(<ChoiceHarness initial={mc} upload={upload} />);
    fireEvent.paste(screen.getByRole('textbox', { name: 'Option B' }), {
      clipboardData: imagePaste,
    });
    await flush();
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Multiple correct answers' })
    );
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Option B is correct' })
    );
    finish(URL_A);
    await flush();
    expect(seen.q).toMatchObject({
      type: 'MA',
      correctAnswer: 'Right|Wrong',
      answerImages: [{ text: 'Wrong', url: URL_A }],
    });
  });

  it('writes nothing when the editor is gone before the upload ends', async () => {
    let finish: (url: string) => void = () => undefined;
    const upload = vi.fn(
      () => new Promise<string>((resolve) => (finish = resolve))
    );
    const { unmount } = render(<ChoiceHarness initial={mc} upload={upload} />);
    fireEvent.paste(screen.getByRole('textbox', { name: 'Option B' }), {
      clipboardData: imagePaste,
    });
    await flush();
    unmount();
    finish(URL_A);
    await flush();
    expect(seen.q).toBeUndefined();
  });

  it('uploads a second paste after the first instead of dropping it', async () => {
    const finishes: ((url: string) => void)[] = [];
    const upload = vi.fn(
      () => new Promise<string>((resolve) => finishes.push(resolve))
    );
    render(<ChoiceHarness initial={mc} upload={upload} />);
    fireEvent.paste(screen.getByRole('textbox', { name: 'Option A' }), {
      clipboardData: imagePaste,
    });
    fireEvent.paste(screen.getByRole('textbox', { name: 'Option B' }), {
      clipboardData: imagePaste,
    });
    await flush();
    expect(upload).toHaveBeenCalledTimes(1);
    finishes[0](URL_A);
    await flush();
    expect(upload).toHaveBeenCalledTimes(2);
    finishes[1](URL_B);
    await flush();
    expect(seen.q?.answerImages).toEqual([
      { text: 'Right', url: URL_A },
      { text: 'Wrong', url: URL_B },
    ]);
  });
});

describe('MatchingAnswerEditor pictures', () => {
  it('pictures a term, a match and an extra separately', async () => {
    const upload = vi.fn().mockResolvedValue(URL_A);
    const onChange = vi.fn();
    render(
      <MatchingAnswerEditor
        correctAnswer="Dog:Mammal|Frog:Amphibian"
        matchingDistractors={['Reptile']}
        onChange={onChange}
        onUploadImage={upload}
      />
    );
    fireEvent.paste(screen.getByDisplayValue('Dog'), {
      clipboardData: imagePaste,
    });
    await flush();
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        matchingTermImages: [{ text: 'Dog', url: URL_A }],
        answerImages: undefined,
      })
    );
    fireEvent.paste(screen.getByDisplayValue('Amphibian'), {
      clipboardData: imagePaste,
    });
    await flush();
    fireEvent.paste(screen.getByDisplayValue('Reptile'), {
      clipboardData: imagePaste,
    });
    await flush();
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        correctAnswer: 'Dog:Mammal|Frog:Amphibian',
        matchingDistractors: ['Reptile'],
        matchingTermImages: [{ text: 'Dog', url: URL_A }],
        answerImages: [
          { text: 'Amphibian', url: URL_A },
          { text: 'Reptile', url: URL_A },
        ],
      })
    );
  });

  it('shows saved pictures on their rows', () => {
    render(
      <MatchingAnswerEditor
        correctAnswer="Dog:Mammal|Frog:Amphibian"
        matchingDistractors={[]}
        termImages={[{ text: 'Frog', url: URL_A }]}
        onChange={vi.fn()}
        onUploadImage={vi.fn()}
      />
    );
    expect(
      screen.getByRole('button', { name: 'Remove image from term 2' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Add image to term 1' })
    ).toBeInTheDocument();
  });
});

describe('OrderingAnswerEditor pasting', () => {
  it('pastes a copied image onto the item', async () => {
    const onChange = vi.fn();
    render(
      <OrderingAnswerEditor
        correctAnswer="First|Second"
        onChange={onChange}
        onUploadImage={vi.fn().mockResolvedValue(URL_A)}
      />
    );
    fireEvent.paste(screen.getByDisplayValue('Second'), {
      clipboardData: imagePaste,
    });
    await flush();
    expect(onChange).toHaveBeenLastCalledWith('First|Second', ['', URL_A]);
  });
});
