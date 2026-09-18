import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { PlcActionItem, PlcMember } from '@/types';
import { NoteActionItems } from '@/components/plc/notes/NoteActionItems';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, o?: { defaultValue?: string }) => o?.defaultValue ?? _k,
  }),
}));

// dnd-kit needs a layout engine jsdom doesn't have, so the list is stubbed to
// render the rows it was given plus a button that fires `onReorder` reversed.
vi.mock('@/components/common/SortableList', () => ({
  SortableList: <T,>({
    items,
    getId,
    onReorder,
    renderItem,
  }: {
    items: T[];
    getId: (item: T) => string;
    onReorder: (next: T[], movedId: string) => void;
    renderItem: (
      item: T,
      handle: {
        attributes: Record<string, unknown>;
        listeners: undefined;
        isDragging: boolean;
      },
      index: number
    ) => React.ReactNode;
  }) => (
    <div>
      <button
        type="button"
        onClick={() => onReorder([...items].reverse(), getId(items[0]) ?? '')}
      >
        reverse-visible
      </button>
      {items.map((item, index) => (
        <div key={getId(item)} data-testid={`row-${getId(item)}`}>
          {renderItem(
            item,
            { attributes: {}, listeners: undefined, isDragging: false },
            index
          )}
        </div>
      ))}
    </div>
  ),
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

const rowAssigneeSelect = () =>
  screen.getByRole('combobox', { name: 'Assignee' });

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
    fireEvent.change(rowAssigneeSelect(), { target: { value: 'u1' } });
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
    expect(
      screen.queryByRole('combobox', { name: 'Assignee' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Reorder action item' })
    ).not.toBeInTheDocument();
  });

  describe('sort and filter', () => {
    const items = [
      item({ id: 'a', text: 'Alpha', done: true }),
      item({ id: 'b', text: 'Bravo', assigneeUid: 'u1' }),
      item({ id: 'c', text: 'Charlie' }),
    ];

    const renderList = (onChange = vi.fn()) => {
      render(
        <NoteActionItems
          items={items}
          members={MEMBERS}
          canEdit
          onChange={onChange}
          currentUid="me"
        />
      );
      return onChange;
    };

    const rowTexts = () =>
      screen
        .getAllByTestId(/^row-/)
        .map((row) => within(row).getByRole('textbox').getAttribute('value'));

    it('filters the rendered rows by status', () => {
      renderList();
      expect(rowTexts()).toEqual(['Alpha', 'Bravo', 'Charlie']);
      fireEvent.change(
        screen.getByRole('combobox', { name: 'Filter by status' }),
        {
          target: { value: 'open' },
        }
      );
      expect(rowTexts()).toEqual(['Bravo', 'Charlie']);
    });

    it('filters the rendered rows by assignee', () => {
      renderList();
      fireEvent.change(
        screen.getByRole('combobox', { name: 'Filter by assignee' }),
        { target: { value: 'unassigned' } }
      );
      expect(rowTexts()).toEqual(['Alpha', 'Charlie']);
    });

    it('resets every control back to the stored order', () => {
      renderList();
      fireEvent.change(
        screen.getByRole('combobox', { name: 'Sort action items' }),
        {
          target: { value: 'text' },
        }
      );
      fireEvent.change(
        screen.getByRole('combobox', { name: 'Filter by status' }),
        {
          target: { value: 'open' },
        }
      );
      fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
      expect(rowTexts()).toEqual(['Alpha', 'Bravo', 'Charlie']);
    });

    it('disables the drag handles under a non-manual sort', () => {
      renderList();
      expect(
        screen.getAllByRole('button', { name: 'Reorder action item' })[0]
      ).toBeEnabled();
      fireEvent.change(
        screen.getByRole('combobox', { name: 'Sort action items' }),
        {
          target: { value: 'due' },
        }
      );
      for (const handle of screen.getAllByRole('button', {
        name: 'Reorder action item',
      })) {
        expect(handle).toBeDisabled();
      }
    });

    it('writes a reorder of the whole list back in the dragged order', () => {
      const onChange = renderList();
      fireEvent.click(screen.getByRole('button', { name: 'reverse-visible' }));
      expect(
        (onChange.mock.calls[0][0] as PlcActionItem[]).map((i) => i.id)
      ).toEqual(['c', 'b', 'a']);
    });

    it('leaves filtered-out items in place when reordering a filtered list', () => {
      const onChange = renderList();
      fireEvent.change(
        screen.getByRole('combobox', { name: 'Filter by status' }),
        {
          target: { value: 'open' },
        }
      );
      fireEvent.click(screen.getByRole('button', { name: 'reverse-visible' }));
      expect(
        (onChange.mock.calls[0][0] as PlcActionItem[]).map((i) => i.id)
      ).toEqual(['a', 'c', 'b']);
    });
  });
});
