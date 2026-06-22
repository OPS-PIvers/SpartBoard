/**
 * Guards for the hand-inlined LandingPage SVG icons.
 *
 * 1. Glyph parity — the real protection: every inlined icon is rendered and
 *    its glyph children (paths/circles/rects + their geometry attrs) are
 *    compared against the SAME icon imported from `lucide-react`. This catches
 *    BOTH a silent `pnpm update lucide-react` drift AND a one-off transcription
 *    error in the initial hand-copy — neither of which a version-pin alone
 *    would surface.
 *
 * 2. Version pin — a fast, explicit signal: asserts `LANDING_ICONS_LUCIDE_VERSION`
 *    matches the installed package, so a bump is a conscious, documented act.
 *
 * 3. Accessibility contract — icons are decorative (`aria-hidden`) by default,
 *    but a caller that supplies an accessible name must get a perceivable icon
 *    (`role="img"`, not `aria-hidden`).
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { createRequire } from 'node:module';
import * as lucide from 'lucide-react';
import * as landingIcons from '@/components/landing/landingIcons';
import {
  LANDING_ICONS_LUCIDE_VERSION,
  Users,
  ArrowRight,
} from '@/components/landing/landingIcons';

const require = createRequire(import.meta.url);
const installedLucideVersion = (
  require('lucide-react/package.json') as { version: string }
).version;

// Every icon hand-inlined in landingIcons.tsx, by its exported name. Keep in
// sync with the file — a name here that isn't exported (or vice versa) is a bug.
const INLINED_ICON_NAMES = [
  'LogIn',
  'Loader2',
  'LayoutDashboard',
  'Timer',
  'ListChecks',
  'Users',
  'ShieldCheck',
  'School',
  'Sparkles',
  'ArrowRight',
] as const;

type SvgComponent = React.ComponentType<React.SVGProps<SVGSVGElement>>;

// Serialize only the glyph children (tag + sorted geometry attrs), ignoring the
// wrapper <svg>'s own attributes — lucide adds its own class/size/aria that we
// deliberately diverge on; what must match byte-for-byte is the path geometry.
function glyphSignature(svg: Element): string {
  return Array.from(svg.children)
    .map((child) => {
      const attrs = Array.from(child.attributes)
        .map((a) => `${a.name}=${a.value}`)
        .sort()
        .join(' ');
      return `${child.tagName.toLowerCase()}[${attrs}]`;
    })
    .join('|');
}

function renderGlyph(Component: SvgComponent): string {
  const svg = render(<Component />).container.querySelector('svg');
  if (!svg) throw new Error('component rendered no <svg>');
  return glyphSignature(svg);
}

describe('landingIcons — glyph parity with lucide-react', () => {
  it.each(INLINED_ICON_NAMES)(
    '%s renders the exact lucide-react glyph paths',
    (name) => {
      // landingIcons exports plain FCs; lucide exports forwardRef components
      // (typeof 'object') — both are renderable, so just assert they exist and
      // let the rendered-glyph comparison do the real work.
      const Mine = landingIcons[name] as SvgComponent | undefined;
      const Theirs = lucide[name] as unknown as SvgComponent | undefined;
      expect(Mine).toBeTruthy();
      expect(Theirs).toBeTruthy();
      expect(renderGlyph(Mine as SvgComponent)).toBe(
        renderGlyph(Theirs as SvgComponent)
      );
    }
  );
});

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
