import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/config/firebase', () => ({ auth: { currentUser: null } }));
vi.mock('@/hooks/useResultsTabWarnings', () => ({
  useResultsTabWarnings: vi.fn(),
}));

import { ResultsProtectionGate } from '@/components/student/ResultsProtectionGate';

const renderLocked = (backHref?: string) =>
  render(
    <ResultsProtectionGate
      protection={{
        watermarkEnabled: false,
        tabWarningEnabled: true,
        tabWarningThreshold: 3,
      }}
      responseDocPath="sessions/s/responses/r"
      tabWarnings={3}
      lockedOut
      backHref={backHref}
    >
      <div>results</div>
    </ResultsProtectionGate>
  );

describe('ResultsProtectionGate locked screen', () => {
  it('links back when backHref is set', () => {
    renderLocked('/my-assignments');
    const link = screen.getByRole('link', { name: 'Back to my assignments' });
    expect(link.getAttribute('href')).toBe('/my-assignments');
  });

  it('shows no link without backHref', () => {
    renderLocked();
    expect(screen.getByText('Results locked')).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
  });
});
