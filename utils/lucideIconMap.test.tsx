import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Circle } from 'lucide-react';
import {
  getNamedLucideIcon,
  getLucideIconNames,
  loadLucideIconMap,
  getLoadedLucideIconMap,
} from '@/utils/lucideIconMap';

describe('lucideIconMap', () => {
  it('shows the fallback first, then the named icon once the set loads', async () => {
    const Icon = getNamedLucideIcon('Rocket', Circle);
    render(<Icon data-testid="icon" />);
    const before = screen.getByTestId('icon').getAttribute('class') ?? '';
    expect(before).toContain('lucide-circle');

    await waitFor(() =>
      expect(screen.getByTestId('icon').getAttribute('class')).toContain(
        'lucide-rocket'
      )
    );
  });

  it('keeps the fallback for a name that is not a Lucide icon', async () => {
    await loadLucideIconMap();
    const Icon = getNamedLucideIcon('NotARealIcon', Circle);
    render(<Icon data-testid="missing" />);
    expect(screen.getByTestId('missing').getAttribute('class')).toContain(
      'lucide-circle'
    );
  });

  it('returns a stable component per name and fallback', () => {
    expect(getNamedLucideIcon('Rocket', Circle)).toBe(
      getNamedLucideIcon('Rocket', Circle)
    );
  });

  it('lists the full set by PascalCase name once loaded', async () => {
    await loadLucideIconMap();
    const names = getLucideIconNames(getLoadedLucideIconMap());
    expect(names.length).toBeGreaterThan(1000);
    expect(names).toContain('Rocket');
    expect(names).not.toContain('createLucideIcon');
  });
});
