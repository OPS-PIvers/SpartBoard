import { describe, it, expect } from 'vitest';
import {
  sanitizePageSvg,
  prepareEditableSvg,
  ensureObjectIds,
  objectIdForTarget,
  findForeground,
} from './notebookSvgEdit';

const parseSvg = (markup: string): SVGSVGElement => {
  const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
  const svg = doc.querySelector('svg');
  if (!svg) throw new Error('no svg');
  return svg as unknown as SVGSVGElement;
};

const PAGE = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">
  <rect x="0" y="0" width="100%" height="100%" style="fill:#fff"/>
  <g class="foreground">
    <text transform="translate(10,20)"><tspan>Hello</tspan></text>
    <image href="data:image/webp;base64,ZHVtbXk=" x="0" y="0" width="50" height="50"/>
    <path d="M0 0 L10 10"/>
  </g>
</svg>`;

describe('sanitizePageSvg', () => {
  it('strips scripts and event handlers', () => {
    const dirty = `<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)">
      <script>alert(2)</script>
      <rect width="10" height="10" onclick="evil()"/>
    </svg>`;
    const clean = sanitizePageSvg(dirty);
    expect(clean).not.toContain('<script');
    expect(clean).not.toContain('onload');
    expect(clean).not.toContain('onclick');
  });

  it('preserves inlined data: image URIs', () => {
    const clean = sanitizePageSvg(PAGE);
    expect(clean).toContain('data:image/webp;base64,ZHVtbXk=');
  });
});

describe('prepareEditableSvg', () => {
  it('adds a viewBox from width/height and makes it responsive', () => {
    const out = prepareEditableSvg(PAGE);
    expect(out).toContain('viewBox="0 0 800 600"');
    expect(out).toContain('width="100%"');
    expect(out).toContain('preserveAspectRatio');
  });
});

describe('ensureObjectIds', () => {
  it('tags each foreground object with a stable id and classifies it', () => {
    const svg = parseSvg(prepareEditableSvg(PAGE));
    const objects = ensureObjectIds(svg);
    expect(objects.map((o) => o.kind)).toEqual(['text', 'image', 'ink']);
    // Idempotent: second call yields the same ids.
    const again = ensureObjectIds(svg);
    expect(again.map((o) => o.id)).toEqual(objects.map((o) => o.id));
  });

  it('returns empty when there is no foreground group', () => {
    const svg = parseSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>'
    );
    expect(ensureObjectIds(svg)).toEqual([]);
    expect(findForeground(svg)).toBeNull();
  });
});

describe('objectIdForTarget', () => {
  it('maps a nested click target up to its foreground object', () => {
    const svg = parseSvg(prepareEditableSvg(PAGE));
    ensureObjectIds(svg);
    const tspan = svg.querySelector('tspan');
    expect(tspan).not.toBeNull();
    const id = objectIdForTarget(svg, tspan as unknown as Element);
    expect(id).toBe('obj-0'); // the <text> object
  });

  it('returns null for a click on the background rect', () => {
    const svg = parseSvg(prepareEditableSvg(PAGE));
    ensureObjectIds(svg);
    const rect = svg.querySelector('rect');
    expect(objectIdForTarget(svg, rect as unknown as Element)).toBeNull();
  });
});
