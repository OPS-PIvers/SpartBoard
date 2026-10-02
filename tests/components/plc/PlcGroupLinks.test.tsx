import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Plc, PlcLink } from '@/types';
import { PlcGroupLinks } from '@/components/plc/resources/PlcGroupLinks';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, opts?: Record<string, unknown>) => {
      let s = (opts?.defaultValue as string | undefined) ?? _key;
      for (const [k, v] of Object.entries(opts ?? {})) {
        s = s.replace(`{{${k}}}`, String(v));
      }
      return s;
    },
  }),
}));

const addLink = vi.fn().mockResolvedValue(undefined);
const removeLink = vi.fn().mockResolvedValue(undefined);
let links: PlcLink[] = [];
vi.mock('@/hooks/usePlcLinks', async (orig) => ({
  ...(await orig<typeof import('@/hooks/usePlcLinks')>()),
  usePlcLinks: () => ({
    links,
    loading: false,
    error: null,
    addLink,
    removeLink,
  }),
}));

let canEdit = true;
vi.mock('@/context/usePlcContext', () => ({
  useCanEditPlcContent: () => canEdit,
}));
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addToast: vi.fn() }),
}));
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm: vi.fn().mockResolvedValue(true) }),
}));

const plc = { id: 'g1', name: 'OMS Staff' } as Plc;
const link = (over: Partial<PlcLink>): PlcLink => ({
  id: 'l1',
  title: 'Turn and Talk',
  url: 'https://docs.google.com/document/d/abc',
  createdBy: 'u1',
  createdByName: 'Paul',
  createdAt: 0,
  updatedAt: 0,
  ...over,
});

describe('PlcGroupLinks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    canEdit = true;
    links = [];
  });

  it('adds a link from the form', async () => {
    render(<PlcGroupLinks plc={plc} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add link' }));
    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'Cold Call' },
    });
    fireEvent.change(screen.getByLabelText('Link'), {
      target: { value: 'docs.google.com/document/d/x' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(addLink).toHaveBeenCalledWith({
        title: 'Cold Call',
        url: 'docs.google.com/document/d/x',
        note: '',
      })
    );
  });

  it('labels each link with its site', () => {
    links = [
      link({}),
      link({
        id: 'l2',
        title: 'Handbook',
        url: 'https://www.orono.k12.mn.us/h',
      }),
    ];
    render(<PlcGroupLinks plc={plc} />);
    expect(screen.getByText('docs.google.com · Paul')).toBeInTheDocument();
    expect(screen.getByText('orono.k12.mn.us · Paul')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Handbook' })).toHaveAttribute(
      'href',
      'https://www.orono.k12.mn.us/h'
    );
  });

  it('hides add and remove from viewers', () => {
    canEdit = false;
    links = [link({})];
    render(<PlcGroupLinks plc={plc} />);
    expect(screen.queryByRole('button', { name: 'Add link' })).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Remove Turn and Talk' })
    ).toBeNull();
  });

  it('removes a link after confirming', async () => {
    links = [link({})];
    render(<PlcGroupLinks plc={plc} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove Turn and Talk' })
    );
    await waitFor(() => expect(removeLink).toHaveBeenCalledWith('l1'));
  });
});
