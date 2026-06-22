import React from 'react';

/**
 * Hand-inlined SVG icons for the public LandingPage, replacing the
 * `lucide-react` imports it used. lucide's `createLucideIcon` wraps every glyph
 * in a `forwardRef` + per-render attribute/class merge; on the landing page
 * (10 icons across the hero, feature cards, and tier cards) that overhead was
 * the single largest concentrated mount cost (~3ms in the page-load harness).
 *
 * These are byte-for-byte the same paths lucide ships (v0.563.0) rendered with
 * lucide's default SVG attributes, so the page is pixel-identical — just
 * cheaper to render. Icons here are decorative (always paired with a text
 * label), so they're `aria-hidden`, matching lucide's default for unlabeled
 * icons. If you need a different glyph, copy its node array from
 * `node_modules/lucide-react/dist/esm/icons/<name>.js`.
 */

/**
 * The exact `lucide-react` version these glyph paths were copied from. Bumping
 * the installed package without re-vetting the inlined node arrays above risks
 * silent visual drift (lucide occasionally re-draws icons between releases).
 *
 * A guard test (`landingIcons.test.tsx`) asserts this matches the installed
 * package version, so a `pnpm update lucide-react` fails CI until someone
 * re-copies the paths and bumps this pin in the same change.
 */
export const LANDING_ICONS_LUCIDE_VERSION = '0.563.0';

type IconNode = ReadonlyArray<
  readonly [string, Record<string, string | number>]
>;

// Accept the full SVG prop surface (style, onClick, aria-label, etc.) so these
// stay drop-in compatible with lucide's API. Defaults below come first so
// callers can override any of them (e.g. pass aria-label + role to make an
// icon non-decorative) via the spread.
type IconProps = React.SVGProps<SVGSVGElement>;

const makeIcon = (name: string, node: IconNode): React.FC<IconProps> => {
  const Icon: React.FC<IconProps> = ({ className, ...props }) => {
    // Decorative by default (aria-hidden), matching lucide's behavior for
    // unlabeled icons. But if a caller supplies an accessible name
    // (aria-label / aria-labelledby) the icon is meaningful — expose it to
    // assistive tech with role="img" instead of hiding it, otherwise the
    // label is silently dropped. Both defaults sit before `{...props}` so a
    // caller can still override either explicitly.
    const labeled =
      props['aria-label'] != null || props['aria-labelledby'] != null;
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={24}
        height={24}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden={labeled ? undefined : true}
        role={labeled ? 'img' : undefined}
        {...props}
      >
        {node.map(([tag, attrs], i) =>
          React.createElement(tag, { ...attrs, key: i })
        )}
      </svg>
    );
  };
  Icon.displayName = name;
  return Icon;
};

export const LogIn = makeIcon('LogIn', [
  ['path', { d: 'm10 17 5-5-5-5' }],
  ['path', { d: 'M15 12H3' }],
  ['path', { d: 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4' }],
]);

export const Loader2 = makeIcon('Loader2', [
  ['path', { d: 'M21 12a9 9 0 1 1-6.219-8.56' }],
]);

export const LayoutDashboard = makeIcon('LayoutDashboard', [
  ['rect', { width: '7', height: '9', x: '3', y: '3', rx: '1' }],
  ['rect', { width: '7', height: '5', x: '14', y: '3', rx: '1' }],
  ['rect', { width: '7', height: '9', x: '14', y: '12', rx: '1' }],
  ['rect', { width: '7', height: '5', x: '3', y: '16', rx: '1' }],
]);

export const Timer = makeIcon('Timer', [
  ['line', { x1: '10', x2: '14', y1: '2', y2: '2' }],
  ['line', { x1: '12', x2: '15', y1: '14', y2: '11' }],
  ['circle', { cx: '12', cy: '14', r: '8' }],
]);

export const ListChecks = makeIcon('ListChecks', [
  ['path', { d: 'M13 5h8' }],
  ['path', { d: 'M13 12h8' }],
  ['path', { d: 'M13 19h8' }],
  ['path', { d: 'm3 17 2 2 4-4' }],
  ['path', { d: 'm3 7 2 2 4-4' }],
]);

export const Users = makeIcon('Users', [
  ['path', { d: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2' }],
  ['path', { d: 'M16 3.128a4 4 0 0 1 0 7.744' }],
  ['path', { d: 'M22 21v-2a4 4 0 0 0-3-3.87' }],
  ['circle', { cx: '9', cy: '7', r: '4' }],
]);

export const ShieldCheck = makeIcon('ShieldCheck', [
  [
    'path',
    {
      d: 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z',
    },
  ],
  ['path', { d: 'm9 12 2 2 4-4' }],
]);

export const School = makeIcon('School', [
  ['path', { d: 'M14 21v-3a2 2 0 0 0-4 0v3' }],
  ['path', { d: 'M18 5v16' }],
  ['path', { d: 'm4 6 7.106-3.79a2 2 0 0 1 1.788 0L20 6' }],
  [
    'path',
    {
      d: 'm6 11-3.52 2.147a1 1 0 0 0-.48.854V19a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5a1 1 0 0 0-.48-.853L18 11',
    },
  ],
  ['path', { d: 'M6 5v16' }],
  ['circle', { cx: '12', cy: '9', r: '2' }],
]);

export const Sparkles = makeIcon('Sparkles', [
  [
    'path',
    {
      d: 'M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z',
    },
  ],
  ['path', { d: 'M20 2v4' }],
  ['path', { d: 'M22 4h-4' }],
  ['circle', { cx: '4', cy: '20', r: '2' }],
]);

export const ArrowRight = makeIcon('ArrowRight', [
  ['path', { d: 'M5 12h14' }],
  ['path', { d: 'm12 5 7 7-7 7' }],
]);
