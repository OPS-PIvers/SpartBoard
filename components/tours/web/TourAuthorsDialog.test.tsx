import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { TourAuthorsDialog } from './TourAuthorsDialog';
import { authorEmailOf, type TourAuthor } from './tourAuthors';

const h = vi.hoisted(() => ({
  onChange: null as ((authors: TourAuthor[]) => void) | null,
  onError: null as ((err: unknown) => void) | null,
  add: vi.fn<(email: string, by: string) => Promise<void>>(),
  remove: vi.fn<(email: string) => Promise<void>>(),
}));
vi.mock('./tourAuthors', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./tourAuthors')>()),
  watchTourAuthors: (
    onChange: (authors: TourAuthor[]) => void,
    onError: (err: unknown) => void
  ) => {
    h.onChange = onChange;
    h.onError = onError;
    return () => undefined;
  },
  addTourAuthor: (email: string, by: string) => h.add(email, by),
  removeTourAuthor: (email: string) => h.remove(email),
}));

const author = (email: string): TourAuthor => ({
  email,
  addedBy: 'admin@orono.k12.mn.us',
  addedAt: 1,
});

const open = () =>
  render(
    <TourAuthorsDialog adminEmail="admin@orono.k12.mn.us" onClose={vi.fn()} />
  );

describe('TourAuthorsDialog', () => {
  beforeEach(() => {
    h.add.mockReset().mockResolvedValue(undefined);
    h.remove.mockReset().mockResolvedValue(undefined);
  });

  it('lists the authors and removes one', () => {
    open();
    act(() => h.onChange?.([author('pat.lee@orono.k12.mn.us')]));
    expect(screen.getByText('pat.lee@orono.k12.mn.us')).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove pat.lee@orono.k12.mn.us' })
    );
    expect(h.remove).toHaveBeenCalledWith('pat.lee@orono.k12.mn.us');
  });

  it('adds a district address in lowercase and records who added it', async () => {
    open();
    act(() => h.onChange?.([]));
    expect(screen.getByText('No authors yet.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Add a person'), {
      target: { value: ' Sam.Roe@Orono.k12.mn.us ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await act(() => Promise.resolve());
    expect(h.add).toHaveBeenCalledWith(
      'sam.roe@orono.k12.mn.us',
      'admin@orono.k12.mn.us'
    );
  });

  it('turns down an outside address and a repeat', () => {
    open();
    act(() => h.onChange?.([author('pat.lee@orono.k12.mn.us')]));
    const field = screen.getByLabelText('Add a person');
    fireEvent.change(field, { target: { value: 'sam@gmail.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByRole('alert')).toHaveTextContent('orono.k12.mn.us');
    fireEvent.change(field, { target: { value: 'pat.lee@orono.k12.mn.us' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByRole('alert')).toHaveTextContent('already on the list');
    expect(h.add).not.toHaveBeenCalled();
  });

  it('says so when the list cannot load', () => {
    open();
    act(() => h.onError?.(new Error('denied')));
    expect(screen.getByRole('alert')).toHaveTextContent("couldn't load");
  });
});

describe('authorEmailOf', () => {
  it('accepts only district addresses', () => {
    expect(authorEmailOf(' A.B@ORONO.k12.mn.us')).toBe('a.b@orono.k12.mn.us');
    expect(authorEmailOf('a@example.com')).toBeNull();
    expect(authorEmailOf('a b@orono.k12.mn.us')).toBeNull();
  });
});
