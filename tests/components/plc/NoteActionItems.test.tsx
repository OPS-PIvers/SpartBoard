import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { PlcActionItem, PlcMember } from '@/types';
import { NoteActionItems } from '@/components/plc/notes/NoteActionItems';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, o?: { defaultValue?: string }) => o?.defaultValue ?? _k,
  }),
}));

const MEMBERS: PlcMember[] = [
  {
    uid: 'u1',
    email: 'a@x.com',
    displayName: 'Alice',
    role: 'member',
    joinedAt: 0,
    status: 'active',
  },
];

function item(over: Partial<PlcActionItem> = {}): PlcActionItem {
  return {
    id: 'i1',
    text: 'Do the thing',
    done: false,
    createdBy: 'u0',
    createdAt: 0,
    ...over,
  };
}

describe('NoteActionItems', () => {
  it('adds a new item via the add input', () => {
    const onChange = vi.fn();
    render(
      <NoteActionItems
        items={[]}
        members={MEMBERS}
        canEdit
        onChange={onChange}
        currentUid="me"
      />
    );
    const input = screen.getByPlaceholderText('What needs to happen?');
    fireEvent.change(input, { target: { value: 'New task' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as PlcActionItem[];
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({
      text: 'New task',
      done: false,
      createdBy: 'me',
    });
  });

  it('toggles done via the checkbox', () => {
    const onChange = vi.fn();
    render(
      <NoteActionItems
        items={[item({ id: 'a' })]}
        members={MEMBERS}
        canEdit
        onChange={onChange}
        currentUid="me"
      />
    );
    fireEvent.click(screen.getByRole('checkbox'));
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as PlcActionItem[];
    expect(next[0].done).toBe(true);
    expect(next[0].doneAt).not.toBeNull();
  });

  it('assigns a member via the select', () => {
    const onChange = vi.fn();
    render(
      <NoteActionItems
        items={[item({ id: 'a' })]}
        members={MEMBERS}
        canEdit
        onChange={onChange}
        currentUid="me"
      />
    );
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'u1' },
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as PlcActionItem[];
    expect(next[0].assigneeUid).toBe('u1');
  });

  it('removes an item via the remove button', () => {
    const onChange = vi.fn();
    render(
      <NoteActionItems
        items={[item({ id: 'a' })]}
        members={MEMBERS}
        canEdit
        onChange={onChange}
        currentUid="me"
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Remove action item' }));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('hides write controls when read-only', () => {
    const onChange = vi.fn();
    render(
      <NoteActionItems
        items={[item({ id: 'a' })]}
        members={MEMBERS}
        canEdit={false}
        onChange={onChange}
        currentUid="me"
      />
    );
    expect(screen.getByRole('checkbox')).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: 'Remove action item' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText('What needs to happen?')
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });
});
