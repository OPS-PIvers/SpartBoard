import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
    expect(screen.getByText('New')).toBeInTheDocument();
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

describe('WhatsNewModal — overview rendering', () => {
  beforeEach(() => {
    useChangelogMock.mockReset();
    writeLastSeenVersionMock.mockReset();
  });

  const overviewEntry: ChangelogEntry = {
    version: '2026.05.19',
    date: '2026-05-19',
    title: 'Collections release',
    overview: [
      {
        type: 'feature',
        subtitle: 'Collections',
        items: [
          { text: 'Group your boards into folders.' },
          { text: 'Share a whole Collection.' },
        ],
      },
      {
        type: 'improvement',
        subtitle: 'Quiz response security',
        items: [{ text: 'Unlock one student at a time.' }],
      },
      {
        type: 'fix',
        // No subtitle — theme-less Fixes section.
        items: [{ text: 'A direct fix bullet under the Fixes heading.' }],
      },
    ],
    details: [
      {
        type: 'feature',
        text: 'Collections — group your boards into folders.',
      },
      {
        type: 'fix',
        text: 'A patch-notes fix bullet (different from the overview Fixes bullet).',
      },
    ],
  };

  it('renders themed subtitles under the right type buckets', () => {
    renderModal([overviewEntry]);
    // Type headings appear in fixed order — New, Improvements, Fixes.
    expect(screen.getByText('New')).toBeInTheDocument();
    expect(screen.getByText('Improvements')).toBeInTheDocument();
    expect(screen.getByText('Fixes')).toBeInTheDocument();
    // Themed subheads appear as bold text on their own.
    expect(screen.getByText('Collections')).toBeInTheDocument();
    expect(screen.getByText('Quiz response security')).toBeInTheDocument();
  });

  it('renders bullets under each themed section', () => {
    renderModal([overviewEntry]);
    expect(
      screen.getByText('Group your boards into folders.')
    ).toBeInTheDocument();
    expect(screen.getByText('Share a whole Collection.')).toBeInTheDocument();
    expect(
      screen.getByText('Unlock one student at a time.')
    ).toBeInTheDocument();
  });

  it('renders a theme-less section with no subtitle, bullets flat under the type heading', () => {
    renderModal([overviewEntry]);
    // The Fixes bullet renders even though its section has no subtitle.
    expect(
      screen.getByText('A direct fix bullet under the Fixes heading.')
    ).toBeInTheDocument();
  });

  it('renders nested sub-bullets under their parent', () => {
    const nestedEntry: ChangelogEntry = {
      version: '2026.05.19',
      date: '2026-05-19',
      title: 'Nested bullets entry',
      overview: [
        {
          type: 'improvement',
          subtitle: 'Quiz response security',
          items: [
            {
              text: 'Two new options when publishing quiz results:',
              items: [
                { text: 'Watermark for screenshots.' },
                { text: 'Tab-navigation lock.' },
              ],
            },
          ],
        },
      ],
      details: [{ type: 'improvement', text: 'Patch-notes entry.' }],
    };
    renderModal([nestedEntry]);
    expect(
      screen.getByText('Two new options when publishing quiz results:')
    ).toBeInTheDocument();
    expect(screen.getByText('Watermark for screenshots.')).toBeInTheDocument();
    expect(screen.getByText('Tab-navigation lock.')).toBeInTheDocument();

    // Sub-bullets render as a nested <ul> under the parent <li>.
    const parentLi = screen
      .getByText('Two new options when publishing quiz results:')
      .closest('li');
    if (!parentLi) throw new Error('expected parent <li> to exist');
    expect(parentLi.querySelector('ul')).not.toBeNull();
  });
});

describe('WhatsNewModal — disclosure', () => {
  beforeEach(() => {
    useChangelogMock.mockReset();
    writeLastSeenVersionMock.mockReset();
  });

  const overviewEntry: ChangelogEntry = {
    version: '2026.05.19',
    date: '2026-05-19',
    title: 'Disclosure test entry',
    overview: [
      {
        type: 'feature',
        subtitle: 'Headline theme',
        items: [{ text: 'Curated overview bullet that is always visible.' }],
      },
    ],
    details: [
      {
        type: 'feature',
        text: 'Exhaustive detail bullet that is hidden until expanded.',
      },
      { type: 'fix', text: 'Bug fix from the patch notes.' },
    ],
  };

  it('shows the "Read full update" button when overview is present', () => {
    renderModal([overviewEntry]);
    expect(
      screen.getByRole('button', { name: /read full update/i })
    ).toBeInTheDocument();
  });

  it('does not render the details list when collapsed', () => {
    renderModal([overviewEntry]);
    expect(
      screen.queryByText(/exhaustive detail bullet/i)
    ).not.toBeInTheDocument();
  });

  it('reveals details and swaps to "Show less" when the disclosure is clicked', async () => {
    const user = userEvent.setup();
    renderModal([overviewEntry]);
    const button = screen.getByRole('button', { name: /read full update/i });
    await user.click(button);
    expect(screen.getByText(/exhaustive detail bullet/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /show less/i })
    ).toBeInTheDocument();
  });

  it('wires aria-expanded and aria-controls to the details region', async () => {
    const user = userEvent.setup();
    renderModal([overviewEntry]);
    const button = screen.getByRole('button', { name: /read full update/i });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    const controlsId = button.getAttribute('aria-controls');
    expect(controlsId).toBeTruthy();
    if (!controlsId) return; // type-guard so getElementById calls below stay clean
    // Controlled element is not in the DOM while collapsed (unmounted).
    expect(document.getElementById(controlsId)).toBeNull();
    await user.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(document.getElementById(controlsId)).not.toBeNull();
  });
});

// `within` is exported for use in later tasks; pull it into a no-op
// reference here to keep the import alive across edits.
void within;
