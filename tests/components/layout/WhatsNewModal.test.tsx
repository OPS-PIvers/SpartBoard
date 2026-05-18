import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { WhatsNewModal } from '@/components/layout/WhatsNewModal';
import type { ChangelogEntry } from '@/hooks/useChangelog';

// The shape returned by useChangelog — typed explicitly so the mock factory
// can return it without the `as any` cast that triggers @typescript-eslint/no-unsafe-return.
interface ChangelogHookReturn {
  entries: ChangelogEntry[];
  loading: boolean;
  error: Error | null;
  latestVersion: string | null;
  entriesSinceCurrent: (v: string) => ChangelogEntry[];
}

// Mock the hook so each test supplies its own entries without touching
// the network. We need to keep the named exports the modal uses at
// import time (writeLastSeenVersion is called inside an effect when
// the modal opens).
const useChangelogMock = vi.fn<() => ChangelogHookReturn>();
const writeLastSeenVersionMock = vi.fn<(v: string | null) => void>();

vi.mock('@/hooks/useChangelog', () => ({
  useChangelog: () => useChangelogMock(),
  writeLastSeenVersion: (v: string | null) => writeLastSeenVersionMock(v),
}));

const detailsOnlyEntry: ChangelogEntry = {
  version: '2026.05.18',
  date: '2026-05-18',
  title: "What's New panel introduced",
  details: [
    {
      type: 'feature',
      text: 'A single, themeless feature bullet for the baseline test.',
    },
  ],
};

const baseHookReturn = (entries: ChangelogEntry[]) => ({
  entries,
  loading: false,
  error: null,
  latestVersion: entries[0]?.version ?? null,
  entriesSinceCurrent: vi.fn(() => entries),
});

const renderModal = (entries: ChangelogEntry[]) => {
  useChangelogMock.mockReturnValue(baseHookReturn(entries));
  return render(
    <WhatsNewModal
      isOpen
      onClose={vi.fn()}
      mode="browse"
      currentVersion={entries[0]?.version ?? ''}
    />
  );
};

describe('WhatsNewModal — no-overview entries', () => {
  beforeEach(() => {
    useChangelogMock.mockReset();
    writeLastSeenVersionMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders the details list flat under the type heading', () => {
    renderModal([detailsOnlyEntry]);
    expect(screen.getByText("What's New panel introduced")).toBeInTheDocument();
    // The "New" type heading appears as an <h5> and in the pill; getAllByText
    // confirms at least one instance is present without failing on duplicates.
    expect(screen.getAllByText('New').length).toBeGreaterThan(0);
    expect(
      screen.getByText(/single, themeless feature bullet/)
    ).toBeInTheDocument();
  });

  it('shows no "Read full update" disclosure when overview is absent', () => {
    renderModal([detailsOnlyEntry]);
    expect(
      screen.queryByRole('button', { name: /read full update/i })
    ).not.toBeInTheDocument();
  });

  it('formats the entry date as a long human string in English', () => {
    renderModal([detailsOnlyEntry]);
    // setTz.ts pins TZ=UTC, and formatEntryDate uses { timeZone: 'UTC' },
    // so the date renders deterministically regardless of host TZ.
    expect(screen.getByText('May 18, 2026')).toBeInTheDocument();
  });

  it('does not render the version slug or "Your build" badge', () => {
    renderModal([detailsOnlyEntry]);
    expect(screen.queryByText('2026.05.18')).not.toBeInTheDocument();
    expect(screen.queryByText(/your build/i)).not.toBeInTheDocument();
  });

  it('renders multiple entries with separators', () => {
    const second: ChangelogEntry = {
      version: '2026.05.10',
      date: '2026-05-10',
      title: 'Older release',
      details: [{ type: 'fix', text: 'Bug squashed.' }],
    };
    renderModal([detailsOnlyEntry, second]);
    expect(screen.getByText('Older release')).toBeInTheDocument();
    // Modal renders via createPortal into document.body, so sections live
    // in the document rather than in the render container. Query the document.
    expect(document.querySelectorAll('section')).toHaveLength(2);
  });
});

// `within` is exported for use in later tasks; pull it into a no-op
// reference here to keep the import alive across edits.
void within;
