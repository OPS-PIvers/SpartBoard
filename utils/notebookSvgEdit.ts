import DOMPurify from 'dompurify';

/**
 * SVG-native page editing helpers for the SMART Notebook editor (Tier 2).
 *
 * We edit the page's SVG element tree directly — each editable "object" is a
 * direct child of the page's `<g class="foreground">` group (SMART wraps every
 * text block, image, and ink stroke there, each with its own transform). This
 * preserves the pixel-perfect fidelity of the imported pages instead of
 * flattening them into a canvas object model.
 */

export type EditableKind = 'text' | 'image' | 'ink' | 'group' | 'shape';

export interface EditableObjectInfo {
  id: string;
  kind: EditableKind;
}

const EDIT_ID_ATTR = 'data-edit-id';

const stripXmlProlog = (svg: string): string =>
  svg.replace(/^\s*<\?xml[^>]*\?>\s*/i, '');

/**
 * Sanitize an untrusted page SVG before inlining it into the DOM. SMART files
 * are user-uploaded, so a malicious one could embed <script>, event handlers,
 * or <foreignObject>. DOMPurify's SVG profile strips those while preserving
 * geometry, text, and inlined `data:` image URIs.
 */
export const sanitizePageSvg = (svgText: string): string =>
  DOMPurify.sanitize(stripXmlProlog(svgText), {
    USE_PROFILES: { svg: true, svgFilters: true },
    ADD_ATTR: ['xml:id'],
    // Defense-in-depth for shared, user-authored .notebook files: drop the SVG
    // elements that carry script/navigation/HTML vectors. SMART lesson pages
    // are static (text/ink/images), so forbidding these is lossless in
    // practice. DOMPurify already blocks javascript: URIs on the remaining
    // href-bearing tags (image/use).
    FORBID_TAGS: [
      'a',
      'script',
      'foreignObject',
      'animate',
      'animateTransform',
      'animateMotion',
      'set',
    ],
  });

/**
 * Sanitize + make a page SVG responsive: ensure a viewBox (from width/height)
 * and set width/height to 100% so it scales to fit its container while keeping
 * aspect ratio. Returns the serialized SVG markup ready to inline.
 */
export const prepareEditableSvg = (svgText: string): string => {
  const clean = sanitizePageSvg(svgText);
  const doc = new DOMParser().parseFromString(clean, 'image/svg+xml');
  const svg = doc.querySelector('svg');
  if (!svg) return clean;

  const width = svg.getAttribute('width');
  const height = svg.getAttribute('height');
  if (!svg.getAttribute('viewBox') && width && height) {
    svg.setAttribute(
      'viewBox',
      `0 0 ${parseFloat(width)} ${parseFloat(height)}`
    );
  }
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  return new XMLSerializer().serializeToString(svg);
};

/** The page's foreground group holds the editable objects. */
export const findForeground = (svg: SVGSVGElement): SVGGElement | null =>
  svg.querySelector<SVGGElement>('g.foreground') ??
  svg.querySelector<SVGGElement>('g[class~="foreground"]');

const kindOf = (el: Element): EditableKind => {
  const tag = el.tagName.toLowerCase();
  if (tag === 'text') return 'text';
  if (tag === 'image') return 'image';
  if (tag === 'path' || tag === 'line' || tag === 'polyline') return 'ink';
  if (tag === 'g') {
    // A group is "ink" if it only wraps strokes, else a generic group.
    const onlyInk = Array.from(el.children).every((c) =>
      ['path', 'line', 'polyline'].includes(c.tagName.toLowerCase())
    );
    return onlyInk && el.children.length > 0 ? 'ink' : 'group';
  }
  return 'shape';
};

/**
 * Tag each direct child of the foreground group with a stable edit id and
 * return the object list (in document/z order). Idempotent — existing ids are
 * preserved so selection survives re-renders.
 */
export const ensureObjectIds = (svg: SVGSVGElement): EditableObjectInfo[] => {
  const fg = findForeground(svg);
  if (!fg) return [];
  const objects: EditableObjectInfo[] = [];
  let counter = 0;
  for (const child of Array.from(fg.children)) {
    let id = child.getAttribute(EDIT_ID_ATTR);
    if (!id) {
      id = `obj-${counter}`;
      child.setAttribute(EDIT_ID_ATTR, id);
    }
    counter += 1;
    objects.push({ id, kind: kindOf(child) });
  }
  return objects;
};

/**
 * Given a click target inside the inlined SVG, return the id of the top-level
 * foreground object it belongs to (walking up to the direct foreground child),
 * or null if the click landed on the background / outside any object.
 */
export const objectIdForTarget = (
  svg: SVGSVGElement,
  target: Element
): string | null => {
  const fg = findForeground(svg) as Element | null;
  if (!fg) return null;
  let node: Element | null = target;
  while (node) {
    const parent: Element | null = node.parentElement;
    if (parent === fg) {
      return node.getAttribute(EDIT_ID_ATTR);
    }
    node = parent;
  }
  return null;
};

export const findObjectById = (
  svg: SVGSVGElement,
  id: string
): SVGGraphicsElement | null =>
  svg.querySelector<SVGGraphicsElement>(
    `[${EDIT_ID_ATTR}="${CSS.escape(id)}"]`
  );

/**
 * The leaf text runs of a text object — the innermost tspans that directly
 * hold characters (SMART nests tspans for justification/positioning). Editing
 * these in place preserves each run's position and font. Falls back to the
 * element itself when there are no tspans.
 */
export const getTextLeaves = (obj: Element): Element[] => {
  const leaves: Element[] = [];
  obj.querySelectorAll('tspan').forEach((t) => {
    const hasElementChild = Array.from(t.childNodes).some(
      (n) => n.nodeType === Node.ELEMENT_NODE
    );
    if (!hasElementChild && (t.textContent ?? '').length > 0) leaves.push(t);
  });
  if (leaves.length === 0 && (obj.textContent ?? '').trim().length > 0) {
    leaves.push(obj);
  }
  return leaves;
};

/** Current text of an object, one line per leaf run. */
export const readTextLines = (obj: Element): string =>
  getTextLeaves(obj)
    .map((l) => l.textContent ?? '')
    .join('\n');

/**
 * Drop the `textLength`/`lengthAdjust` hints on a run (and its ancestor tspans
 * up to the text root). SMART pins each run to its original measured width with
 * these; once the text changes, that width no longer fits, so the browser
 * crams the new glyphs into the old width and they overlap. Removing the hints
 * lets the edited run render at its natural width.
 */
const stripLengthHints = (leaf: Element, root: Element): void => {
  let node: Element | null = leaf;
  while (node) {
    node.removeAttribute('textLength');
    node.removeAttribute('lengthAdjust');
    if (node === root) break;
    node = node.parentElement;
  }
};

/**
 * Write edited text back into a text object, one line per leaf run, preserving
 * each run's position/font. Content is never lost, but the line *count* is
 * bounded by the original run count: each SMART run is an absolutely-positioned
 * tspan, so we can't synthesize new positioned lines. Typing fewer lines clears
 * the surplus runs; typing MORE lines appends the overflow (space-joined) to
 * the last run rather than dropping it. Best for in-place edits (fix a word,
 * change a number) that keep the original line structure. Edited runs shed
 * their fixed-width hints so longer text extends naturally instead of
 * overlapping (SVG `<text>` has no automatic line wrapping).
 */
export const writeTextLines = (obj: Element, value: string): void => {
  const leaves = getTextLeaves(obj);
  const lines = value.split('\n');
  if (leaves.length === 0) {
    obj.textContent = value;
    return;
  }
  leaves.forEach((leaf, i) => {
    const next =
      i < leaves.length - 1 ? (lines[i] ?? '') : lines.slice(i).join(' ');
    if (next !== leaf.textContent) {
      leaf.textContent = next;
      stripLengthHints(leaf, obj);
    }
  });
};

/** Marks editor-only nodes (e.g. the selection highlight) for stripping. */
const EDIT_OVERLAY_ATTR = 'data-edit-overlay';
/**
 * Snapshots an object's original `transform` before any editor edit, so the
 * editor's composed `data-edit-matrix` (move + resize) can be prepended to it.
 */
const ORIG_TRANSFORM_ATTR = 'data-orig-transform';

/**
 * Serialize the page back to a clean, persistable SVG: removes the editor's
 * overlay nodes and edit-only bookkeeping attributes, and restores explicit
 * width/height from the viewBox so the result renders correctly in an <img>.
 * Object edits (move + resize, applied as a leading `matrix(...)` prepended to
 * each object's original transform) remain as valid SVG — only the bookkeeping
 * attributes are stripped.
 */
export const exportEditedSvg = (svg: SVGSVGElement): string => {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.querySelectorAll(`[${EDIT_OVERLAY_ATTR}]`).forEach((el) => el.remove());
  clone.querySelectorAll(`[${EDIT_ID_ATTR}]`).forEach((el) => {
    // Strip all editor bookkeeping (every data-edit-* attribute + the saved
    // original transform).
    for (const attr of Array.from(el.attributes)) {
      if (
        attr.name.startsWith('data-edit') ||
        attr.name === ORIG_TRANSFORM_ATTR
      ) {
        el.removeAttribute(attr.name);
      }
    }
  });
  // Restore intrinsic size from the viewBox (we set width/height to 100% to
  // make the editor responsive; an <img>-rendered SVG needs real dimensions).
  const viewBox = clone.getAttribute('viewBox');
  if (viewBox) {
    const parts = viewBox.split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
      clone.setAttribute('width', String(parts[2]));
      clone.setAttribute('height', String(parts[3]));
    }
  }
  return new XMLSerializer().serializeToString(clone);
};

export { EDIT_ID_ATTR, EDIT_OVERLAY_ATTR, ORIG_TRANSFORM_ATTR };
