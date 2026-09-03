import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AnnotatedResponseView } from '@/components/widgets/QuizWidget/components/AnnotatedResponseView';
import { AudioAnnotatedResponseView } from '@/components/widgets/QuizWidget/components/AudioAnnotatedResponseView';
import { getAudioCtx } from '@/utils/timeToolAudio';
import type { WrittenAnswerAnnotation } from '@/types';

vi.mock('@/utils/timeToolAudio', () => ({
  getAudioCtx: vi.fn(),
  resumeAudio: vi.fn(),
}));
vi.mock('@/utils/logError', () => ({ logError: vi.fn() }));

const mockedGetAudioCtx = vi.mocked(getAudioCtx);

/**
 * Controlled wrapper for the edit-mode tests. The component now requires
 * the parent to own `activeId`; this harness handles that so tests can
 * focus on observable behavior (popover open/close, comment edits).
 */
const EditHarness: React.FC<{
  snapshot: string;
  annotations: WrittenAnswerAnnotation[];
  onChange: (next: WrittenAnswerAnnotation[]) => void;
  initialActiveId?: string | null;
}> = ({ snapshot, annotations, onChange, initialActiveId = null }) => {
  const [activeId, setActiveId] = React.useState<string | null>(
    initialActiveId
  );
  return (
    <AnnotatedResponseView
      mode="edit"
      snapshot={snapshot}
      annotations={annotations}
      authorUid="teacher-1"
      onChange={onChange}
      activeId={activeId}
      onActiveIdChange={setActiveId}
    />
  );
};

const ann = (
  from: number,
  to: number,
  overrides: Partial<WrittenAnswerAnnotation> = {}
): WrittenAnswerAnnotation => ({
  id: `a-${from}-${to}`,
  from,
  to,
  highlightColor: 'yellow',
  authorUid: 'teacher',
  createdAt: 0,
  ...overrides,
});

describe('AnnotatedResponseView — read mode', () => {
  it('renders the snapshot with no margin column when no comments exist', () => {
    render(
      <AnnotatedResponseView
        mode="read"
        snapshot="<p>hello world</p>"
        annotations={[ann(0, 5)]}
      />
    );
    expect(screen.queryByText('Teacher notes')).not.toBeInTheDocument();
    // The highlighted text is present.
    expect(screen.getByText(/hello/)).toBeInTheDocument();
  });

  it('shows the margin column only for annotations with comments', () => {
    render(
      <AnnotatedResponseView
        mode="read"
        snapshot="<p>alpha beta gamma</p>"
        annotations={[
          ann(0, 5, { id: 'a1', comment: 'Good word' }),
          ann(6, 10), // no comment
        ]}
      />
    );
    expect(screen.getByText('Teacher notes')).toBeInTheDocument();
    expect(screen.getByText('Good word')).toBeInTheDocument();
  });

  it('renders no palette in read mode', () => {
    render(
      <AnnotatedResponseView
        mode="read"
        snapshot="<p>hello</p>"
        annotations={[]}
      />
    );
    expect(
      screen.queryByRole('toolbar', { name: /annotation palette/i })
    ).not.toBeInTheDocument();
  });
});

describe('AnnotatedResponseView — edit mode', () => {
  it('renders the article without a popover when no annotation is active', () => {
    render(
      <EditHarness
        snapshot="<p>hello world</p>"
        annotations={[]}
        onChange={vi.fn()}
      />
    );
    expect(
      screen.queryByRole('group', { name: /edit annotation/i })
    ).not.toBeInTheDocument();
    // The article content renders.
    expect(screen.getByText(/hello/)).toBeInTheDocument();
  });

  it('opens an anchored popover when an existing mark is clicked', () => {
    render(
      <EditHarness
        snapshot="<p>hello world</p>"
        annotations={[ann(0, 5, { id: 'a1', comment: 'note' })]}
        onChange={vi.fn()}
      />
    );
    // Click the highlighted mark in the article — the parent harness
    // surfaces the popover.
    const mark = document.querySelector('mark[data-annotation-id="a1"]');
    if (!mark) throw new Error('Expected a <mark> for the annotation');
    fireEvent.click(mark);
    // Popover renders with the comment pre-filled.
    expect(
      screen.getByRole('group', { name: /edit annotation/i })
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/margin comment/i)).toHaveValue('note');
  });

  it('updates the annotation list when the popover textarea changes', () => {
    const onChange = vi.fn();
    render(
      <EditHarness
        snapshot="<p>hello world</p>"
        annotations={[ann(0, 5, { id: 'a1', comment: '' })]}
        onChange={onChange}
        initialActiveId="a1"
      />
    );
    const ta = screen.getByPlaceholderText(/margin comment/i);
    fireEvent.change(ta, { target: { value: 'edited' } });
    const last = onChange.mock.calls.at(-1)?.[0] as WrittenAnswerAnnotation[];
    expect(last[0].comment).toBe('edited');
  });

  it('deletes the active annotation via the trash button', () => {
    const onChange = vi.fn();
    render(
      <EditHarness
        snapshot="<p>hello world</p>"
        annotations={[ann(0, 5, { id: 'a1', comment: 'x' })]}
        onChange={onChange}
        initialActiveId="a1"
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /delete annotation/i }));
    const last = onChange.mock.calls.at(-1)?.[0] as WrittenAnswerAnnotation[];
    expect(last).toEqual([]);
  });

  it('changes color when a swatch is clicked in the popover', () => {
    const onChange = vi.fn();
    render(
      <EditHarness
        snapshot="<p>hello</p>"
        annotations={[ann(0, 5, { id: 'a1', highlightColor: 'yellow' })]}
        onChange={onChange}
        initialActiveId="a1"
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /pink highlight/i }));
    const last = onChange.mock.calls.at(-1)?.[0] as WrittenAnswerAnnotation[];
    expect(last[0].highlightColor).toBe('pink');
  });
});

describe('AudioAnnotatedResponseView — waveform decode', () => {
  const fetchMock = vi.fn();

  const renderAudio = () =>
    render(
      <AudioAnnotatedResponseView
        src="blob:take"
        durationMs={60_000}
        loading={false}
        error={null}
        unplayableReason={null}
        annotations={[]}
        onChange={vi.fn()}
        authorUid="teacher-1"
        activeId={null}
        onActiveIdChange={vi.fn()}
      />
    );

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('keeps the range input and hides skip when decode fails', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue({
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
    });
    mockedGetAudioCtx.mockReturnValue({
      decodeAudioData: vi.fn().mockRejectedValue(new Error('bad codec')),
    } as unknown as AudioContext);

    renderAudio();
    await waitFor(() =>
      expect(screen.queryByTestId('waveform-loading')).not.toBeInTheDocument()
    );
    const range = screen.getByRole('slider', { name: /playback position/i });
    expect(range.tagName).toBe('INPUT');
    expect(
      screen.queryByRole('button', { name: /skip to next speech/i })
    ).not.toBeInTheDocument();
  });

  it('swaps in the waveform and skip button once decoded with a gap', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue({
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
    });
    const data = new Float32Array(1000);
    for (let i = 0; i < 400; i++) data[i] = 0.8;
    for (let i = 600; i < 1000; i++) data[i] = 0.8;
    mockedGetAudioCtx.mockReturnValue({
      decodeAudioData: vi.fn().mockResolvedValue({
        numberOfChannels: 1,
        getChannelData: () => data,
      }),
    } as unknown as AudioContext);

    renderAudio();
    const skip = await screen.findByRole('button', {
      name: /skip to next speech/i,
    });
    const slider = screen.getByRole('slider', { name: /playback position/i });
    expect(slider.tagName).toBe('DIV');
    fireEvent.click(skip);
    expect(slider).toHaveAttribute('aria-valuenow', '36');
  });
});
