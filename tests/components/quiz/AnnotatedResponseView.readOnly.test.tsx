import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, createEvent } from '@testing-library/react';
import { AnnotatedResponseView } from '@/components/widgets/QuizWidget/components/AnnotatedResponseView';

const snapshot = '<p>The student wrote this essay about cells.</p>';

const renderEdit = () => {
  const onChange = vi.fn();
  const utils = render(
    <AnnotatedResponseView
      mode="edit"
      snapshot={snapshot}
      annotations={[]}
      authorUid="t1"
      onChange={onChange}
      activeId={null}
      onActiveIdChange={vi.fn()}
    />
  );
  const article = utils.container.querySelector('article') as HTMLElement;
  return { ...utils, onChange, article };
};

describe('AnnotatedResponseView — the response is read-only evidence', () => {
  it('is explicitly not editable, even under an editable ancestor', () => {
    const { article } = renderEdit();
    expect(article.getAttribute('contenteditable')).toBe('false');
  });

  it.each([
    ['paste', () => createEvent.paste(document.body)],
    ['cut', () => createEvent.cut(document.body)],
    ['drop', () => createEvent.drop(document.body)],
    ['dragStart', () => createEvent.dragStart(document.body)],
  ])('blocks %s on the response', (_name, make) => {
    const { article, onChange } = renderEdit();
    const proto = make();
    const event = new (proto.constructor as typeof Event)(proto.type, {
      bubbles: true,
      cancelable: true,
    });
    fireEvent(article, event);
    expect(event.defaultPrevented).toBe(true);
    expect(article.textContent).toBe(
      'The student wrote this essay about cells.'
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it('opens a labelled comment box on selection, so typing never lands in the response', () => {
    const { article } = renderEdit();
    const text = article.querySelector('p')?.firstChild as Text;
    const range = document.createRange();
    range.setStart(text, 4);
    range.setEnd(text, 11);
    range.getBoundingClientRect = () =>
      ({ left: 10, top: 10, bottom: 20, width: 40, height: 10 }) as DOMRect;
    const sel = window.getSelection() as Selection;
    sel.removeAllRanges();
    sel.addRange(range);
    fireEvent.mouseUp(article);
    expect(screen.getByText('Choose highlight color')).toBeVisible();
    const box = screen.getByRole('textbox', {
      name: 'Comment on this highlight',
    });
    expect(document.activeElement).toBe(box);
    expect(article.contains(box)).toBe(false);
  });
});
