import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';

type Snap = { exists: () => boolean; data: () => unknown };
let emit: ((snap: Snap) => void) | null = null;
const docPaths: string[] = [];

vi.mock('@/config/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...parts: string[]) => {
    docPaths.push(parts.join('/'));
    return parts.join('/');
  },
  onSnapshot: (_ref: unknown, next: (s: Snap) => void) => {
    emit = next;
    return () => undefined;
  },
}));

import { FamilyPage } from './FamilyPage';

const at = (path: string) => window.history.replaceState(null, '', path);

afterEach(() => {
  emit = null;
  docPaths.length = 0;
  document.head
    .querySelectorAll('meta[name="robots"],meta[name="referrer"]')
    .forEach((m) => m.remove());
});

describe('FamilyPage', () => {
  it('shows the Course, the deck and only safe links, and marks the page noindex', () => {
    at('/family/share_1');
    render(<FamilyPage />);
    expect(docPaths).toEqual(['family_pages/share_1']);
    act(() =>
      emit?.({
        exists: () => true,
        data: () => ({
          courseName: 'English 9',
          teacherName: 'Ms. Rivera',
          agenda: { fileId: '1AbCdEfGhIjKlMn', title: 'Agenda' },
          pinnedLinks: [
            { title: 'Bad', url: 'javascript:alert(1)' },
            { title: 'Schedule', url: 'https://example.com/s' },
          ],
          updatedAt: 1,
        }),
      })
    );
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'English 9'
    );
    expect(screen.getByText('Ms. Rivera')).toBeTruthy();
    expect(document.querySelector('iframe')?.getAttribute('src')).toBe(
      'https://docs.google.com/presentation/d/1AbCdEfGhIjKlMn/preview'
    );
    const links = screen.getAllByRole('link');
    expect(links.map((l) => l.getAttribute('href'))).not.toContain(
      'javascript:alert(1)'
    );
    for (const l of links)
      expect(l.getAttribute('rel')).toContain('noreferrer');
    expect(
      document.head
        .querySelector('meta[name="robots"]')
        ?.getAttribute('content')
    ).toContain('noindex');
  });

  it('says the page is unavailable when the link is off', () => {
    at('/family/share_1');
    render(<FamilyPage />);
    act(() => emit?.({ exists: () => false, data: () => undefined }));
    expect(screen.getByTestId('family-page-unavailable')).toBeTruthy();
    expect(document.head.querySelector('meta[name="robots"]')).not.toBeNull();
  });

  it('never reads Firestore for a malformed address', () => {
    at('/family/a%2Fb');
    render(<FamilyPage />);
    expect(docPaths).toEqual([]);
    expect(screen.getByTestId('family-page-unavailable')).toBeTruthy();
  });
});
