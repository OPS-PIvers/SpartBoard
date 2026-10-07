import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { UpdateComposer } from './UpdateComposer';

const box = () =>
  screen.getByRole('textbox', {
    name: 'Post an update',
  });

describe('UpdateComposer', () => {
  it('keeps the draft when posting fails', async () => {
    const onSubmit = vi.fn(() => Promise.reject(new Error('offline')));
    render(<UpdateComposer onSubmit={onSubmit} />);
    fireEvent.change(box(), { target: { value: 'Fire drill\nNorth stairs' } });
    fireEvent.click(screen.getByRole('button', { name: 'Post' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Post' }).disabled).toBe(false)
    );
    expect(box().value).toBe('Fire drill\nNorth stairs');
  });

  it('clears the draft after a successful post', async () => {
    const onSubmit = vi.fn(() => Promise.resolve());
    render(<UpdateComposer onSubmit={onSubmit} />);
    fireEvent.change(box(), { target: { value: 'Fire drill' } });
    fireEvent.click(screen.getByRole('button', { name: 'Post' }));
    await waitFor(() => expect(box().value).toBe(''));
  });
});
