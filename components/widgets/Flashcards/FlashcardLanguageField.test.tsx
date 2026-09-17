import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FlashcardLanguageField } from './FlashcardLanguageField';
import { describeLanguageTag } from './utils/flashcardLanguages';

const Harness: React.FC<{ initial: string }> = ({ initial }) => {
  const [value, setValue] = useState(initial);
  return (
    <>
      <FlashcardLanguageField
        label="Term language"
        value={value}
        onChange={setValue}
      />
      <output data-testid="value">{value}</output>
    </>
  );
};

describe('FlashcardLanguageField', () => {
  it('shows language names and changes the saved tag', () => {
    render(<Harness initial="en-US" />);
    const select = screen.getByLabelText('Term language');
    expect(screen.getByRole('option', { name: 'Spanish (US)' })).toBeTruthy();
    fireEvent.change(select, { target: { value: 'es-US' } });
    expect(screen.getByTestId('value').textContent).toBe('es-US');
    expect(select).toHaveProperty('value', 'es-US');
  });

  it('opens a code input for other languages', () => {
    render(<Harness initial="en-US" />);
    fireEvent.change(screen.getByLabelText('Term language'), {
      target: { value: '__other__' },
    });
    const input = screen.getByLabelText('Term language code');
    fireEvent.change(input, { target: { value: 'vi' } });
    expect(screen.getByTestId('value').textContent).toBe('vi');
    expect(screen.getByText('Vietnamese')).toBeTruthy();
  });

  it('opens a saved custom tag in Other', () => {
    render(<Harness initial="vi" />);
    expect(screen.getByLabelText('Term language')).toHaveProperty(
      'value',
      '__other__'
    );
    expect(screen.getByLabelText('Term language code')).toHaveProperty(
      'value',
      'vi'
    );
  });

  it('names valid tags and ignores invalid ones', () => {
    expect(describeLanguageTag('pt-BR')).toContain('Portuguese');
    expect(describeLanguageTag('')).toBeNull();
    expect(describeLanguageTag('not a tag')).toBeNull();
  });
});
