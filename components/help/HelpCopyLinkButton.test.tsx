import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HelpResourceItem } from '@/types/helpCenter';
import type { ShortLink } from '@/types';
import type { CreateResult } from '@/hooks/useShortLinks';
import { HelpCopyLinkButton } from './HelpCopyLinkButton';
import { helpShortLinkCode, parseHelpItemPath } from './helpCenterState';

const authValue = vi.hoisted(() => ({ isAdmin: true as boolean | null }));
vi.mock('@/context/useAuth', () => ({ useAuth: () => authValue }));

const mocks = vi.hoisted(() => ({
  createShortLink:
    vi.fn<
      (input: {
        destination: string;
        slug?: string;
        label?: string;
      }) => Promise<CreateResult>
    >(),
  resolveShortLink: vi.fn<(code: string) => Promise<ShortLink | null>>(),
}));
vi.mock('@/hooks/useShortLinks', () => ({
  useCreateShortLink: () => ({ createShortLink: mocks.createShortLink }),
}));
vi.mock('@/utils/shortLinksApi', () => ({
  resolveShortLink: mocks.resolveShortLink,
}));

const item = {
  id: 'AbC123xyz',
  kind: 'embed',
  title: 'Welcome video',
  description: '',
  categoryId: 'getting-started',
  order: 0,
  visible: true,
  orgId: null,
  widgetTypes: [],
  url: 'https://www.youtube.com/watch?v=abc123defgh',
  embedType: 'youtube',
  setId: null,
  openCount: 0,
  createdBy: 'u1',
  createdByEmail: 'a@b.c',
  createdAt: 0,
  updatedAt: 0,
} satisfies HelpResourceItem;

const destination = `${window.location.origin}/help/AbC123xyz`;
const link = (code: string, dest = destination): ShortLink => ({
  code,
  destination: dest,
  createdBy: 'u1',
  createdByEmail: 'a@b.c',
  createdAt: 0,
  updatedAt: 0,
  clicks: 0,
  lastClickedAt: null,
});

describe('HelpCopyLinkButton', () => {
  beforeEach(() => {
    authValue.isAdmin = true;
    mocks.createShortLink.mockReset();
    mocks.resolveShortLink.mockReset();
  });

  it('renders nothing for non-admins', () => {
    authValue.isAdmin = false;
    const { container } = render(
      <HelpCopyLinkButton item={item} variant="text" />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('creates one tracked link per resource and copies it', async () => {
    mocks.resolveShortLink.mockResolvedValue(null);
    mocks.createShortLink.mockImplementation((input) =>
      Promise.resolve({ ok: true, link: link(input.slug ?? 'random') })
    );
    const user = userEvent.setup();
    render(<HelpCopyLinkButton item={item} variant="text" />);
    await user.click(screen.getByRole('button', { name: 'Copy link' }));

    await waitFor(async () =>
      expect(await navigator.clipboard.readText()).toBe(
        `${window.location.origin}/r/help-abc123xyz`
      )
    );
    expect(mocks.createShortLink).toHaveBeenCalledWith({
      destination,
      slug: 'help-abc123xyz',
      label: 'Help: Welcome video',
    });
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });

  it('reuses the existing link so clicks keep adding up', async () => {
    mocks.resolveShortLink.mockResolvedValue(link('help-abc123xyz'));
    const user = userEvent.setup();
    render(<HelpCopyLinkButton item={item} variant="icon" />);
    await user.click(
      screen.getByRole('button', { name: 'Copy link to Welcome video' })
    );

    await waitFor(async () =>
      expect(await navigator.clipboard.readText()).toBe(
        `${window.location.origin}/r/help-abc123xyz`
      )
    );
    expect(mocks.createShortLink).not.toHaveBeenCalled();
  });

  it('copies the plain Help link when the tracked link cannot be made', async () => {
    mocks.resolveShortLink.mockResolvedValue(null);
    mocks.createShortLink.mockResolvedValue({ ok: false, reason: 'nope' });
    const user = userEvent.setup();
    render(<HelpCopyLinkButton item={item} variant="text" />);
    await user.click(screen.getByRole('button', { name: 'Copy link' }));

    await waitFor(async () =>
      expect(await navigator.clipboard.readText()).toBe(destination)
    );
  });
});

describe('helpShortLinkCode', () => {
  it('fits the short link slug rules for a Firestore auto-id', () => {
    const code = helpShortLinkCode('Xy9AbCdEfGhIjKlMnOpQ');
    expect(code).toBe('help-xy9abcdefghijklmnopq');
    expect(code.length).toBeLessThanOrEqual(32);
  });
});

describe('parseHelpItemPath', () => {
  it('reads the resource id from a /help/ path', () => {
    expect(parseHelpItemPath('/help/AbC123xyz')).toBe('AbC123xyz');
    expect(parseHelpItemPath('/help/AbC123xyz/')).toBe('AbC123xyz');
    expect(parseHelpItemPath('/help/')).toBeNull();
    expect(parseHelpItemPath('/help/a%20b')).toBeNull();
    expect(parseHelpItemPath('/plc')).toBeNull();
  });
});
