import React, { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { AuthContext, type AuthContextType } from '@/context/AuthContextValue';
import type {
  PaperSheetStimulus,
  QuizQuestion,
  WhiteboardPlacedImage,
  WhiteboardStartingImage,
} from '@/types';
import { ChoiceOptionsEditor } from './ChoiceOptionsEditor';
import { WhiteboardInsertImageModal } from './WhiteboardInsertImageModal';
import { PaperSheetStimuliSection } from './PaperSheetStimuliSection';

vi.mock('@/hooks/useGooglePicker', () => ({
  useGooglePicker: () => ({ openPicker: vi.fn(), isConnected: true }),
}));
vi.mock('@/hooks/useGoogleDrive', () => ({
  useGoogleDrive: () => ({ getDriveFileAsBlob: vi.fn() }),
}));

const flagOn = {
  canAccessFeature: (id: string) => id === 'unified-image-picker',
} as unknown as AuthContextType;
const withFlag = (ui: React.ReactElement) =>
  render(<AuthContext.Provider value={flagOn}>{ui}</AuthContext.Provider>);

const png = (name = 'a.png') => new File([name], name, { type: 'image/png' });
const pdf = new File(['%PDF'], 'test.pdf', { type: 'application/pdf' });
const pickerInput = () =>
  document.querySelector<HTMLInputElement>('input[type="file"][aria-hidden]');

const mc: QuizQuestion = {
  id: 'q1',
  type: 'MC',
  text: 'Pick',
  timeLimit: 30,
  correctAnswer: 'Right',
  incorrectAnswers: ['Wrong'],
};

describe('Quiz answer pictures with the shared picker', () => {
  it('opens the picker from the answer and saves through its queue', async () => {
    const upload = vi
      .fn()
      .mockResolvedValue('https://lh3.googleusercontent.com/d/a');
    const seen: { q?: Partial<QuizQuestion> } = {};
    const Harness = () => {
      const [q, setQ] = useState(mc);
      return (
        <ChoiceOptionsEditor
          question={q}
          onChange={(u) => {
            seen.q = u;
            setQ((prev) => ({ ...prev, ...u }));
          }}
          onUploadImage={upload}
        />
      );
    };
    withFlag(<Harness />);
    const open = screen.getByRole('button', { name: 'Add image to option B' });
    expect(open.getAttribute('data-tour')).toBe('quiz-editor.option-image');
    fireEvent.click(open);
    expect(
      screen.getByRole('dialog', { name: 'Add image to option B' })
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Google Drive' })).toBeTruthy();
    // Each answer's picker keeps its own file input beside its button.
    const input = open.previousElementSibling;
    act(() => {
      fireEvent.change(input as HTMLInputElement, {
        target: { files: [png()] },
      });
    });
    await waitFor(() =>
      expect(seen.q?.answerImages).toEqual([
        { text: 'Wrong', url: 'https://lh3.googleusercontent.com/d/a' },
      ])
    );
    expect(upload).toHaveBeenCalledTimes(1);
  });
});

const IMG: WhiteboardStartingImage = {
  driveFileId: 'f1',
  url: 'https://lh3.googleusercontent.com/d/f1',
  mimeType: 'image/png',
  width: 800,
  height: 600,
};

describe('Whiteboard images with the shared picker', () => {
  it('adds several dropped images in order and stops at the limit', async () => {
    const upload = vi.fn((file: File) =>
      Promise.resolve({ ...IMG, driveFileId: file.name.replace('.png', '') })
    );
    const spy = vi.fn();
    const five = Array.from({ length: 5 }, (_, i) => ({
      ...IMG,
      driveFileId: `f${i}`,
      x: 0,
      y: 0,
      w: 10,
      h: 10,
    }));
    const Harness = () => {
      const [images, setImages] = useState<WhiteboardPlacedImage[]>(five);
      return (
        <WhiteboardInsertImageModal
          images={images}
          onUploadImage={upload}
          onChange={(next) => {
            spy(next);
            setImages(next);
          }}
          onClose={vi.fn()}
        />
      );
    };
    withFlag(<Harness />);
    expect(
      screen.getByRole('button', { name: 'Upload' }).getAttribute('data-tour')
    ).toBe('quiz-editor.whiteboard-image-choose');
    const zone = screen.getByText('Drop or paste an image')
      .parentElement as HTMLElement;
    fireEvent.drop(zone, {
      dataTransfer: { types: ['Files'], files: [png('a.png'), png('b.png')] },
    });
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    const last = spy.mock.calls[0][0] as WhiteboardPlacedImage[];
    expect(last.map((i) => i.driveFileId)).toEqual([
      'f0',
      'f1',
      'f2',
      'f3',
      'f4',
      'a',
    ]);
    await waitFor(() =>
      expect(screen.getByText('Up to 6 images.')).toBeTruthy()
    );
    expect(upload).toHaveBeenCalledTimes(1);
  });
});

describe('Response sheet items with the shared picker', () => {
  it('takes a PDF and an image through the caller upload', async () => {
    const onChange = vi.fn();
    const added: PaperSheetStimulus = {
      id: 'new',
      label: 'a.png',
      source: 'image',
      driveFileId: 'd',
    };
    const onUploadFile = vi.fn((file: File) =>
      Promise.resolve(file.type === 'application/pdf' ? null : added)
    );
    withFlag(
      <PaperSheetStimuliSection
        stimuli={[]}
        onChange={onChange}
        quizImageStimuli={[]}
        pageCount={2}
        imageSrc={{}}
        failed={[]}
        onUploadFile={onUploadFile}
        onPickFromDrive={vi.fn()}
        busy={false}
      />
    );
    fireEvent.click(
      screen.getByRole('button', { name: /Add to the response sheet/ })
    );
    expect(screen.queryByText('Upload or PDF')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Upload' }).getAttribute('data-tour')
    ).toBe('quiz-print.sheet-stimuli-upload');
    const input = pickerInput() as HTMLInputElement;
    expect(input.accept).toBe('image/*,application/pdf');
    act(() => {
      fireEvent.change(input, { target: { files: [pdf] } });
    });
    await waitFor(() => expect(onUploadFile).toHaveBeenCalledWith(pdf));
    expect(onChange).not.toHaveBeenCalled();
    act(() => {
      fireEvent.change(input, { target: { files: [png()] } });
    });
    await waitFor(() => expect(onChange).toHaveBeenCalledWith([added]));
  });
});
