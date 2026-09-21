import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AnnotatedResponseView } from '@/components/widgets/QuizWidget/components/AnnotatedResponseView';
import { AudioAnnotatedResponseView } from '@/components/widgets/QuizWidget/components/AudioAnnotatedResponseView';
import { getAudioCtx } from '@/utils/timeToolAudio';
import { toggleStrandTag } from '@/utils/rubricStrandTags';
import type { Rubric, WrittenAnswerAnnotation } from '@/types';

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
  rubric?: Rubric;
}> = ({ snapshot, annotations, onChange, initialActiveId = null, rubric }) => {
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
      rubric={rubric}
    />
  );
};

const rubric: Rubric = {
  id: 'r1',
  title: 'Essay rubric',
  createdAt: 0,
  updatedAt: 0,
  criteria: [
    {
      id: 'c1',
      name: 'Thesis',
      levels: [
        { id: 'c1l1', label: 'Below', points: 1 },
        { id: 'c1l2', label: 'Meets', points: 3 },
      ],
    },
    {
      id: 'c2',
      name: 'Evidence',
      levels: [
        { id: 'c2l1', label: 'Below', points: 1 },
        { id: 'c2l2', label: 'Meets', points: 2 },
      ],
    },
  ],
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

describe('toggleStrandTag', () => {
  it('keeps tags in rubric order regardless of click order', () => {
    const afterEvidence = toggleStrandTag(undefined, 'c2', rubric);
    const afterThesis = toggleStrandTag(afterEvidence, 'c1', rubric);
    expect(afterThesis?.map((t) => t.criterionId)).toEqual(['c1', 'c2']);
  });

  it('snapshots the criterion name when a tag is added', () => {
    expect(toggleStrandTag(undefined, 'c1', rubric)).toEqual([
      { criterionId: 'c1', name: 'Thesis' },
    ]);
  });

  it('returns undefined rather than an empty array when the last tag is removed', () => {
    const one = toggleStrandTag(undefined, 'c1', rubric);
    expect(toggleStrandTag(one, 'c1', rubric)).toBeUndefined();
  });

  it('ignores a criterion the rubric does not contain', () => {
    expect(toggleStrandTag(undefined, 'gone', rubric)).toBeUndefined();
  });
});

describe('AnnotatedResponseView — rubric strand tagging', () => {
  it('renders no strand chips when the question has no rubric', () => {
    render(
      <EditHarness
        snapshot="<p>hello world</p>"
        annotations={[ann(0, 5, { id: 'a1' })]}
        onChange={vi.fn()}
        initialActiveId="a1"
      />
    );
    expect(
      screen.queryByRole('group', { name: /rubric strands/i })
    ).not.toBeInTheDocument();
  });

  it('adds a strand tag when a chip is clicked in active mode', () => {
    const onChange = vi.fn();
    render(
      <EditHarness
        snapshot="<p>hello world</p>"
        annotations={[ann(0, 5, { id: 'a1' })]}
        onChange={onChange}
        initialActiveId="a1"
        rubric={rubric}
      />
    );
    fireEvent.click(
      screen.getByRole('button', { name: /tag as evidence for thesis/i })
    );
    const last = onChange.mock.calls.at(-1)?.[0] as WrittenAnswerAnnotation[];
    expect(last[0].rubricCriteria).toEqual([
      { criterionId: 'c1', name: 'Thesis' },
    ]);
  });

  it('omits the field entirely when the last tag is toggled off', () => {
    const onChange = vi.fn();
    render(
      <EditHarness
        snapshot="<p>hello world</p>"
        annotations={[
          ann(0, 5, {
            id: 'a1',
            rubricCriteria: [{ criterionId: 'c1', name: 'Thesis' }],
          }),
        ]}
        onChange={onChange}
        initialActiveId="a1"
        rubric={rubric}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /remove thesis tag/i }));
    const last = onChange.mock.calls.at(-1)?.[0] as WrittenAnswerAnnotation[];
    expect(last[0].rubricCriteria).toBeUndefined();
    expect('rubricCriteria' in last[0]).toBe(true);
  });

  it('shows a strand that left the rubric under its snapshotted name, removable', () => {
    const onChange = vi.fn();
    render(
      <EditHarness
        snapshot="<p>hello world</p>"
        annotations={[
          ann(0, 5, {
            id: 'a1',
            rubricCriteria: [{ criterionId: 'gone', name: 'Old strand' }],
          }),
        ]}
        onChange={onChange}
        initialActiveId="a1"
        rubric={rubric}
      />
    );
    const orphan = screen.getByRole('button', {
      name: /remove old strand tag/i,
    });
    expect(orphan).toBeInTheDocument();
    fireEvent.click(orphan);
    const last = onChange.mock.calls.at(-1)?.[0] as WrittenAnswerAnnotation[];
    expect(last[0].rubricCriteria).toBeUndefined();
  });

  it('commits a pending selection in yellow, carrying the typed comment and the tag', () => {
    // jsdom gives every rect zeros, which the selection handler treats as
    // "nothing was selected". Stub just enough geometry to get past it.
    const rangeProto = Range.prototype as unknown as {
      getBoundingClientRect?: () => DOMRect;
    };
    const originalRangeRect = rangeProto.getBoundingClientRect;
    rangeProto.getBoundingClientRect = () =>
      ({
        top: 10,
        bottom: 24,
        left: 0,
        right: 40,
        width: 40,
        height: 14,
        x: 0,
        y: 10,
        toJSON: () => ({}),
      }) as DOMRect;

    const onChange = vi.fn();
    render(
      <EditHarness
        snapshot="<p>hello world</p>"
        annotations={[]}
        onChange={onChange}
        rubric={rubric}
      />
    );
    const article = document.querySelector('article');
    if (!article) throw new Error('Expected the response article');
    const textNode = article.querySelector('p')?.firstChild;
    if (!textNode) throw new Error('Expected a text node to select');
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, 5);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    fireEvent.mouseUp(article);

    fireEvent.change(screen.getByPlaceholderText(/margin comment/i), {
      target: { value: 'strong opening' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: /tag as evidence for evidence/i })
    );

    const last = onChange.mock.calls.at(-1)?.[0] as WrittenAnswerAnnotation[];
    expect(last).toHaveLength(1);
    expect(last[0]).toMatchObject({
      from: 0,
      to: 5,
      highlightColor: 'yellow',
      comment: 'strong opening',
      rubricCriteria: [{ criterionId: 'c2', name: 'Evidence' }],
    });
    rangeProto.getBoundingClientRect = originalRangeRect;
  });

  it('gives a tagged, uncommented highlight a margin chip on the student side', () => {
    render(
      <AnnotatedResponseView
        mode="read"
        snapshot="<p>alpha beta gamma</p>"
        annotations={[
          ann(0, 5, {
            id: 'a1',
            rubricCriteria: [{ criterionId: 'c1', name: 'Thesis' }],
          }),
        ]}
      />
    );
    expect(screen.getByText('Teacher notes')).toBeInTheDocument();
    expect(screen.getByText('Thesis')).toBeInTheDocument();
  });
});

describe('AnnotatedResponseView — jumping to a tagged passage', () => {
  const stubRect = (top: number, bottom: number): DOMRect =>
    ({
      top,
      bottom,
      left: 0,
      right: 80,
      width: 80,
      height: bottom - top,
      x: 0,
      y: top,
      toJSON: () => ({}),
    }) as DOMRect;

  // The grader's center column is the scroll container; `window.innerHeight`
  // is jsdom's 768, so a mark below the column is still above the window.
  const COLUMN = stubRect(0, 200);
  const MARK = stubRect(400, 420);

  const renderInColumn = (scrollIntoView: () => void) => {
    const proto = Element.prototype as unknown as {
      scrollIntoView?: () => void;
      getClientRects: () => DOMRectList;
      getBoundingClientRect: () => DOMRect;
    };
    const original = {
      scrollIntoView: proto.scrollIntoView,
      getClientRects: proto.getClientRects,
      getBoundingClientRect: proto.getBoundingClientRect,
      scrollHeight: Object.getOwnPropertyDescriptor(
        Element.prototype,
        'scrollHeight'
      ),
      clientHeight: Object.getOwnPropertyDescriptor(
        Element.prototype,
        'clientHeight'
      ),
    };
    const isColumn = (el: Element) => el.hasAttribute('data-scroll-column');
    proto.scrollIntoView = scrollIntoView;
    proto.getClientRects = function (this: Element) {
      return (this.tagName === 'MARK' ? [MARK] : []) as unknown as DOMRectList;
    };
    proto.getBoundingClientRect = function (this: Element) {
      if (isColumn(this)) return COLUMN;
      return this.tagName === 'MARK' ? MARK : stubRect(0, 0);
    };
    Object.defineProperty(Element.prototype, 'scrollHeight', {
      configurable: true,
      get(this: Element) {
        return isColumn(this) ? 1000 : 0;
      },
    });
    Object.defineProperty(Element.prototype, 'clientHeight', {
      configurable: true,
      get(this: Element) {
        return isColumn(this) ? 200 : 0;
      },
    });
    const restore = () => {
      proto.scrollIntoView = original.scrollIntoView;
      proto.getClientRects = original.getClientRects;
      proto.getBoundingClientRect = original.getBoundingClientRect;
      if (original.scrollHeight)
        Object.defineProperty(
          Element.prototype,
          'scrollHeight',
          original.scrollHeight
        );
      if (original.clientHeight)
        Object.defineProperty(
          Element.prototype,
          'clientHeight',
          original.clientHeight
        );
    };
    render(
      <div data-scroll-column style={{ overflowY: 'auto' }}>
        <EditHarness
          snapshot="<p>alpha beta gamma</p>"
          annotations={[ann(0, 5, { id: 'a1' })]}
          onChange={vi.fn()}
          initialActiveId="a1"
          rubric={rubric}
        />
      </div>
    );
    return restore;
  };

  it('scrolls to a mark that is out of the scrolling column but inside the window', () => {
    const scrollIntoView = vi.fn();
    const restore = renderInColumn(scrollIntoView);
    try {
      expect(scrollIntoView).toHaveBeenCalled();
    } finally {
      restore();
    }
  });
});

describe('AudioAnnotatedResponseView — rubric strand tagging', () => {
  const note = (over: Partial<WrittenAnswerAnnotation> = {}) => ({
    id: 'n1',
    from: 4_000,
    to: 4_000,
    highlightColor: 'yellow' as const,
    authorUid: 'teacher-1',
    createdAt: 0,
    ...over,
  });

  const renderNotes = (
    annotations: WrittenAnswerAnnotation[],
    onChange: (next: WrittenAnswerAnnotation[]) => void,
    withRubric: boolean
  ) =>
    render(
      <AudioAnnotatedResponseView
        src="blob:take"
        durationMs={60_000}
        loading={false}
        error={null}
        unplayableReason={null}
        annotations={annotations}
        onChange={onChange}
        authorUid="teacher-1"
        activeId={null}
        onActiveIdChange={vi.fn()}
        rubric={withRubric ? rubric : undefined}
      />
    );

  it('renders no chips on a note when the question has no rubric', () => {
    renderNotes([note()], vi.fn(), false);
    expect(
      screen.queryByRole('group', { name: /rubric strands/i })
    ).not.toBeInTheDocument();
  });

  it('tags a timestamp note without needing a typed comment', () => {
    const onChange = vi.fn();
    renderNotes([note()], onChange, true);
    fireEvent.click(
      screen.getByRole('button', { name: /tag as evidence for thesis/i })
    );
    const last = onChange.mock.calls.at(-1)?.[0] as WrittenAnswerAnnotation[];
    expect(last[0].rubricCriteria).toEqual([
      { criterionId: 'c1', name: 'Thesis' },
    ]);
    expect(last[0].comment).toBeUndefined();
  });

  it('removes the field when the last tag comes off a note', () => {
    const onChange = vi.fn();
    renderNotes(
      [note({ rubricCriteria: [{ criterionId: 'c1', name: 'Thesis' }] })],
      onChange,
      true
    );
    fireEvent.click(screen.getByRole('button', { name: /remove thesis tag/i }));
    const last = onChange.mock.calls.at(-1)?.[0] as WrittenAnswerAnnotation[];
    expect(last[0].rubricCriteria).toBeUndefined();
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
