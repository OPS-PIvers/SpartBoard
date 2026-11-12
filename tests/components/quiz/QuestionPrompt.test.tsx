import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { QuestionPrompt } from '@/components/quiz/QuestionPrompt';
import { isLongPrompt, spacedPrompt } from '@/utils/quizPromptText';

describe('QuestionPrompt', () => {
  it('keeps a short stem as a bold heading', () => {
    expect(isLongPrompt('What is 2 + 2?')).toBe(false);
    const { container } = render(
      <QuestionPrompt text="What is 2 + 2?" light />
    );
    expect(container.querySelector('h2')?.className).toContain('font-bold');
  });

  it('puts a blank line between the paragraphs of a long prompt', () => {
    const text = 'The picture shows a comb. \nDescribe the force.\n\n\nDrag.';
    expect(isLongPrompt(text)).toBe(true);
    expect(spacedPrompt(text)).toBe(
      'The picture shows a comb.\n\nDescribe the force.\n\nDrag.'
    );
    const { container } = render(<QuestionPrompt text={text} light />);
    const h2 = container.querySelector('h2');
    expect(h2?.className).toContain('font-medium');
    expect(h2?.className).not.toContain('font-bold');
  });

  it('treats one long paragraph as body text without adding breaks', () => {
    const text = 'word '.repeat(60).trim();
    expect(isLongPrompt(text)).toBe(true);
    expect(spacedPrompt(text)).toBe(text);
  });
});
