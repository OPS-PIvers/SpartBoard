import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ResultsWatermark } from '@/components/quiz/ResultsWatermark';

describe('ResultsWatermark', () => {
  it('renders the student name and a formatted timestamp inside an SVG pattern', () => {
    render(
      <ResultsWatermark
        studentName="Ada Lovelace"
        publishedAt={1715731200000}
      />
    );
    const svg = screen.getByRole('presentation', { hidden: true });
    expect(svg).toBeInTheDocument();
    // The text node lives inside <pattern><text>...</text></pattern>
    const text = svg.querySelector('text');
    expect(text?.textContent).toContain('Ada Lovelace');
    expect(text?.textContent).toMatch(/\d{4}|2024|2025|2026/); // date present
  });

  it('does not capture pointer events', () => {
    render(<ResultsWatermark studentName="Ada" publishedAt={0} />);
    const svg = screen.getByRole('presentation', { hidden: true });
    expect(svg).toHaveClass('pointer-events-none');
  });

  it('escapes special characters in the student name (no SVG injection)', () => {
    render(
      <ResultsWatermark
        studentName={'<script>alert(1)</script>'}
        publishedAt={0}
      />
    );
    const svg = screen.getByRole('presentation', { hidden: true });
    expect(svg.innerHTML).not.toContain('<script>');
  });
});
