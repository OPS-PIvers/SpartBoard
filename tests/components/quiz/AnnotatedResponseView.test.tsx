import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AnnotatedResponseView } from '@/components/widgets/QuizWidget/components/AnnotatedResponseView';
import type { WrittenAnswerAnnotation } from '@/types';

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
  it('renders an empty-state hint when no annotations exist', () => {
    render(
      <AnnotatedResponseView
        mode="edit"
        snapshot="<p>hello world</p>"
        annotations={[]}
        authorUid="teacher-1"
        onChange={vi.fn()}
      />
    );
    expect(
      screen.getByText(/select text in the response/i)
    ).toBeInTheDocument();
  });

  it('renders one row per saved annotation', () => {
    render(
      <AnnotatedResponseView
        mode="edit"
        snapshot="<p>hello world</p>"
        annotations={[
          ann(0, 5, { id: 'a1', comment: 'First' }),
          ann(6, 11, { id: 'a2' }),
        ]}
        authorUid="teacher-1"
        onChange={vi.fn()}
      />
    );
    expect(screen.getByText(/Annotations \(2\)/)).toBeInTheDocument();
    expect(screen.getByText('First')).toBeInTheDocument();
  });

  it('opens the editor panel when an annotation row is clicked', () => {
    const onChange = vi.fn();
    render(
      <AnnotatedResponseView
        mode="edit"
        snapshot="<p>hello world</p>"
        annotations={[ann(0, 5, { id: 'a1', comment: 'note' })]}
        authorUid="teacher-1"
        onChange={onChange}
      />
    );
    const row = screen.getByText('note').closest('button');
    if (!row) throw new Error('Expected annotation row button');
    fireEvent.click(row);
    // Active-editor textarea pre-fills with the comment.
    expect(screen.getByPlaceholderText(/margin comment/i)).toHaveValue('note');
  });

  it('updates the annotation list when the active comment changes', () => {
    const onChange = vi.fn();
    render(
      <AnnotatedResponseView
        mode="edit"
        snapshot="<p>hello world</p>"
        annotations={[ann(0, 5, { id: 'a1', comment: '' })]}
        authorUid="teacher-1"
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /highlight/i }));
    const ta = screen.getByPlaceholderText(/margin comment/i);
    fireEvent.change(ta, { target: { value: 'edited' } });
    const last = onChange.mock.calls.at(-1)?.[0] as WrittenAnswerAnnotation[];
    expect(last[0].comment).toBe('edited');
  });

  it('deletes an annotation via the active-editor trash button', () => {
    const onChange = vi.fn();
    render(
      <AnnotatedResponseView
        mode="edit"
        snapshot="<p>hello world</p>"
        annotations={[ann(0, 5, { id: 'a1', comment: 'x' })]}
        authorUid="teacher-1"
        onChange={onChange}
      />
    );
    const row = screen.getByText('x').closest('button');
    if (!row) throw new Error('Expected annotation row button');
    fireEvent.click(row);
    fireEvent.click(screen.getByRole('button', { name: /delete annotation/i }));
    const last = onChange.mock.calls.at(-1)?.[0] as WrittenAnswerAnnotation[];
    expect(last).toEqual([]);
  });

  it('changes color when a swatch is clicked in the active editor', () => {
    const onChange = vi.fn();
    render(
      <AnnotatedResponseView
        mode="edit"
        snapshot="<p>hello</p>"
        annotations={[ann(0, 5, { id: 'a1', highlightColor: 'yellow' })]}
        authorUid="teacher-1"
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getAllByRole('button', { name: /highlight/i })[0]);
    fireEvent.click(screen.getByRole('button', { name: /pink highlight/i }));
    const last = onChange.mock.calls.at(-1)?.[0] as WrittenAnswerAnnotation[];
    expect(last[0].highlightColor).toBe('pink');
  });
});
