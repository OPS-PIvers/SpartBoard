import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import type { Plc } from '@/types';
import TeamNotesDocsPage from './TeamNotesDocsPage';
import { openTeamDoc, openTeamNote } from './teamNotesNavigation';

const bodyProps = vi.hoisted(() => ({ calls: [] as unknown[] }));

vi.mock('@/components/plc/bodies/NotesDocsBody', () => ({
  NotesDocsBody: (props: unknown) => {
    bodyProps.calls.push(props);
    return <div data-testid="notes-docs-body" />;
  },
}));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ canAccessFeature: () => true }),
}));
vi.mock('@/utils/plcPath', async (orig) => ({
  ...(await orig<object>()),
  spaNavigate: vi.fn(),
}));

const plc = { id: 'p1', name: 'Dept', groupType: 'department' } as Plc;
const lastProps = () =>
  bodyProps.calls[bodyProps.calls.length - 1] as Record<string, unknown>;

describe('TeamNotesDocsPage', () => {
  beforeEach(() => {
    bodyProps.calls = [];
  });

  it('renders the existing Notes & Docs body with side panels edge to edge', () => {
    const { getByTestId } = render(
      <TeamNotesDocsPage plc={plc} isLead layout={undefined as never} />
    );
    expect(getByTestId('notes-docs-body').parentElement?.className).toBe(
      'h-full'
    );
    expect(lastProps()).toMatchObject({ plc, noteId: null, docId: null });
  });

  it('opens the note a hub link asked for', () => {
    openTeamNote('p1', 'n1');
    render(<TeamNotesDocsPage plc={plc} isLead layout={undefined as never} />);
    expect(lastProps()).toMatchObject({ noteId: 'n1', docId: null });
  });

  it('opens the doc a hub link asked for', () => {
    openTeamDoc('p1', 'd1');
    render(<TeamNotesDocsPage plc={plc} isLead layout={undefined as never} />);
    expect(lastProps()).toMatchObject({ noteId: null, docId: 'd1' });
  });
});
