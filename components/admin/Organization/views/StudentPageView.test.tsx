import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const editor = vi.hoisted(() => ({
  loading: false,
  gradesOn: true,
}));

vi.mock('@/components/admin/access/useGlobalPermissionsEditor', () => ({
  useGlobalPermissionsEditor: () => ({
    loading: editor.loading,
    getPermission: () => ({ enabled: editor.gradesOn }),
  }),
}));
vi.mock('@/components/admin/access/PreviewsPanel', () => ({
  PreviewRow: ({ featureId }: { featureId: string }) => (
    <div data-testid={`row-${featureId}`} />
  ),
}));
vi.mock('@/components/student/landing/StudentLandingSample', () => ({
  StudentLandingSample: ({ gradesEnabled }: { gradesEnabled: boolean }) => (
    <a href="#e1" data-testid="sample">
      {gradesEnabled ? 'Gradebook' : 'Completed'}
    </a>
  ),
}));

import { StudentPageView } from './StudentPageView';

describe('StudentPageView', () => {
  beforeEach(() => {
    editor.loading = false;
    editor.gradesOn = true;
  });

  it('shows the real access rows for the student page', () => {
    render(<StudentPageView />);
    expect(screen.getByTestId('row-student-landing-v2')).toBeInTheDocument();
    expect(screen.getByTestId('row-student-gradebook')).toBeInTheDocument();
  });

  it('previews the Completed tab when the grades flag is off', () => {
    editor.gradesOn = false;
    render(<StudentPageView />);
    expect(screen.getByTestId('sample')).toHaveTextContent('Completed');
  });

  it('keeps sample links from navigating away', () => {
    render(<StudentPageView />);
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    screen.getByTestId('sample').dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
  });
});
