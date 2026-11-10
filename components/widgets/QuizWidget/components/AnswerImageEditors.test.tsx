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

  it('saves a blank option with a picture under a generated label', async () => {
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
    const label = seen.q?.incorrectAnswers[0] ?? '';
    expect(label).toMatch(/^Picture [A-Z0-9]{3}$/);
    expect(seen.q?.answerImages).toEqual([{ text: label, url: URL_A }]);
    expect(seen.q?.imageOnlyAnswers).toEqual([{ text: label }]);
    expect(screen.getByRole('textbox', { name: 'Option B' })).toHaveValue('');
    expect(screen.getByRole('textbox', { name: 'Option B' })).toHaveAttribute(
      'placeholder',
      'Picture only, or add text'
    );
  });

  it('reads a picture-only option back with an empty box and saves its description', () => {
    render(
      <ChoiceHarness
        initial={{
          ...mc,
          correctAnswer: 'Picture ACD',
          answerImages: [{ text: 'Picture ACD', url: URL_A }],
          imageOnlyAnswers: [{ text: 'Picture ACD' }],
        }}
        upload={vi.fn()}
      />
    );
    expect(screen.getByRole('textbox', { name: 'Option A' })).toHaveValue('');
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Describe the picture in option A' }),
      {
        target: { value: 'A red triangle' },
      }
    );
    expect(seen.q?.correctAnswer).toBe('Picture ACD');
    expect(seen.q?.imageOnlyAnswers).toEqual([
      { text: 'Picture ACD', alt: 'A red triangle' },
    ]);
  });

  it('typing text on a picture-only option makes it a normal option', () => {
    render(
      <ChoiceHarness
        initial={{
          ...mc,
          correctAnswer: 'Picture ACD',
          answerImages: [{ text: 'Picture ACD', url: URL_A }],
          imageOnlyAnswers: [{ text: 'Picture ACD' }],
        }}
        upload={vi.fn()}
      />
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'Option A' }), {
      target: { value: 'Triangle' },
    });
    expect(seen.q?.correctAnswer).toBe('Triangle');
    expect(seen.q?.answerImages).toEqual([{ text: 'Triangle', url: URL_A }]);
    expect(seen.q?.imageOnlyAnswers).toBeUndefined();
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

  it('saves picture-only terms and matches under labels and reads them back', () => {
    const onChange = vi.fn();
    render(
      <MatchingAnswerEditor
        correctAnswer="Picture ACD:Picture CDE|Frog:Amphibian"
        matchingDistractors={['Picture DEF']}
        answerImages={[
          { text: 'Picture CDE', url: URL_B },
          { text: 'Picture DEF', url: URL_B },
        ]}
        termImages={[{ text: 'Picture ACD', url: URL_A }]}
        imageOnlyAnswers={[
          { text: 'Picture ACD' },
          { text: 'Picture CDE', alt: 'A dog' },
          { text: 'Picture DEF' },
        ]}
        onChange={onChange}
        onUploadImage={vi.fn()}
      />
    );
    expect(screen.queryByDisplayValue('Picture ACD')).toBeNull();
    fireEvent.change(screen.getByDisplayValue('Frog'), {
      target: { value: 'Toad' },
    });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        correctAnswer: 'Picture ACD:Picture CDE|Toad:Amphibian',
        matchingDistractors: ['Picture DEF'],
        imageOnlyAnswers: [
          { text: 'Picture ACD' },
          { text: 'Picture CDE', alt: 'A dog' },
          { text: 'Picture DEF' },
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
    expect(onChange).toHaveBeenLastCalledWith(
      'First|Second',
      ['', URL_A],
      undefined
    );
  });

  it('saves a blank item with a picture under a generated label', async () => {
    const onChange = vi.fn();
    render(
      <OrderingAnswerEditor
        correctAnswer="First|Second"
        onChange={onChange}
        onUploadImage={vi.fn().mockResolvedValue(URL_A)}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add Row' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Add image to item 3' })
    );
    const input = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [png] } });
    await flush();
    const [answer, images, imageOnly] = (onChange.mock.lastCall ??
      []) as unknown[];
    const label = String(answer).split('|')[2];
    expect(label).toMatch(/^Picture [A-Z0-9]{3}$/);
    expect(images).toEqual(['', '', URL_A]);
    expect(imageOnly).toEqual([{ text: label }]);
  });
});
