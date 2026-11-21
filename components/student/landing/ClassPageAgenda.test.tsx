import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ClassPageAgenda } from './ClassPageAgenda';

describe('ClassPageAgenda', () => {
  it('renders nothing without an Agenda or links', () => {
    const { container } = render(
      <ClassPageAgenda view={{ agendas: [], links: [] }} />
    );
    expect(container.innerHTML).toBe('');
  });

  it('embeds the first slide and always offers Google Slides', () => {
    render(
      <ClassPageAgenda
        view={{
          agendas: [
            { fileId: 'deck_123456789', title: 'Bio', teacherName: null },
          ],
          links: [{ title: 'Syllabus', url: 'https://docs.example.com/s' }],
        }}
      />
    );
    expect(screen.getByTitle('Bio').getAttribute('src')).toBe(
      'https://docs.google.com/presentation/d/deck_123456789/preview'
    );
    const open = screen.getByRole('link', { name: /Open in Google Slides/ });
    expect(open.getAttribute('href')).toBe(
      'https://docs.google.com/presentation/d/deck_123456789/edit?usp=sharing'
    );
    expect(open.getAttribute('rel')).toContain('noopener');
    expect(
      screen.getByRole('link', { name: /Syllabus/ }).getAttribute('href')
    ).toBe('https://docs.example.com/s');
  });

  it("names each co-teacher's deck when they differ", () => {
    render(
      <ClassPageAgenda
        view={{
          agendas: [
            { fileId: 'deck_aaaaaaaaaa', title: 'A', teacherName: 'Mr. Lee' },
            { fileId: 'deck_bbbbbbbbbb', title: 'B', teacherName: 'Ms. Ortiz' },
          ],
          links: [],
        }}
      />
    );
    expect(screen.getByText('Mr. Lee')).toBeTruthy();
    expect(screen.getByText('Ms. Ortiz')).toBeTruthy();
    expect(
      screen.getAllByRole('link', { name: /Open in Google Slides/ })
    ).toHaveLength(2);
  });
});
