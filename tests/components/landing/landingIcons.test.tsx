/**
 * Guards for the hand-inlined LandingPage SVG icons.
 *
 * 1. Drift detector — `landingIcons.tsx` copies glyph paths byte-for-byte from
 *    a pinned `lucide-react` release. There is no build-time link back to the
 *    package, so a `pnpm update lucide-react` would silently ship stale paths.
 *    This asserts the pin (`LANDING_ICONS_LUCIDE_VERSION`) matches the
 *    installed package version, failing CI until someone re-vets the paths and
 *    bumps the pin together.
 *
 * 2. Accessibility contract — icons are decorative (`aria-hidden`) by default,
 *    but a caller that supplies an accessible name must get a perceivable icon
 *    (`role="img"`, not `aria-hidden`).
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { createRequire } from 'node:module';
import {
  LANDING_ICONS_LUCIDE_VERSION,
  Users,
  ArrowRight,
} from '@/components/landing/landingIcons';

const require = createRequire(import.meta.url);
const installedLucideVersion = (
  require('lucide-react/package.json') as { version: string }
).version;

describe('landingIcons — lucide drift detector', () => {
  it('pins the lucide-react version the inlined paths were copied from', () => {
    expect(LANDING_ICONS_LUCIDE_VERSION).toBe(installedLucideVersion);
  });
});

describe('landingIcons — accessibility', () => {
  it('is decorative (aria-hidden, no role) by default', () => {
    const { container } = render(<ArrowRight />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.getAttribute('role')).toBeNull();
  });

  it('exposes the icon to assistive tech when given an accessible name', () => {
    const { container } = render(<Users aria-label="Team members" />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('aria-hidden')).toBeNull();
    expect(svg?.getAttribute('role')).toBe('img');
    expect(svg?.getAttribute('aria-label')).toBe('Team members');
  });

  it('lets a caller override the aria-hidden default explicitly', () => {
    const { container } = render(<ArrowRight aria-hidden={false} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('aria-hidden')).toBe('false');
  });

  it('forwards arbitrary SVG props (className, style)', () => {
    const { container } = render(
      <ArrowRight className="h-4 w-4" style={{ color: 'red' }} />
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBe('h-4 w-4');
    expect(svg?.style.color).toBe('red');
  });
});
