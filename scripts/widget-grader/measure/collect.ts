// In-page collector: runs inside the browser via page.evaluate, so it must not reference anything outside its own body.

import type {
  BackgroundLayer,
  Box,
  CollectOptions,
  ControlInfo,
  FaceSnapshot,
  MediaInfo,
  ScrollerInfo,
  StripInfo,
  TextInfo,
} from './snapshotTypes';

export function collectFaceSnapshot(opts: CollectOptions): FaceSnapshot {
  const TOLERANCE = 1.5;
  const card = document.querySelector<HTMLElement>(
    `[data-draggable-window][data-widget-id="${opts.widgetId}"]`
  );
  if (!card) throw new Error(`No window for ${opts.widgetId}`);

  const toBox = (
    r: DOMRect | { left: number; top: number; width: number; height: number }
  ): Box => ({
    x: r.left,
    y: r.top,
    w: r.width,
    h: r.height,
  });
  const intersect = (a: Box, b: Box): Box | null => {
    const x = Math.max(a.x, b.x);
    const y = Math.max(a.y, b.y);
    const r = Math.min(a.x + a.w, b.x + b.w);
    const btm = Math.min(a.y + a.h, b.y + b.h);
    return r - x > 0 && btm - y > 0 ? { x, y, w: r - x, h: btm - y } : null;
  };
  const cuts = (inner: Box, clip: Box | null): boolean =>
    !clip ||
    inner.x < clip.x - TOLERANCE ||
    inner.y < clip.y - TOLERANCE ||
    inner.x + inner.w > clip.x + clip.w + TOLERANCE ||
    inner.y + inner.h > clip.y + clip.h + TOLERANCE;
  const describe = (el: Element): string => {
    const parts: string[] = [];
    for (
      let n: Element | null = el;
      n && n !== card && parts.length < 4;
      n = n.parentElement
    ) {
      const tag = n.tagName.toLowerCase();
      const cls =
        typeof n.className === 'string' && n.className.trim()
          ? `.${n.className.trim().split(/\s+/).slice(0, 2).join('.')}`
          : '';
      parts.unshift(`${tag}${cls}`);
    }
    return parts.join(' > ');
  };
  const isScrollStyle = (v: string) => v === 'auto' || v === 'scroll';
  const clipsStyle = (v: string) => v !== 'visible';

  const cardBox = toBox(card.getBoundingClientRect());
  const opacityCache = new Map<Element, number>();
  const cumulativeOpacity = (el: Element): number => {
    const cached = opacityCache.get(el);
    if (cached !== undefined) return cached;
    const own = Number(styleOf(el).opacity) || 0;
    const value =
      el === card || !el.parentElement
        ? own
        : own * cumulativeOpacity(el.parentElement);
    opacityCache.set(el, value);
    return value;
  };

  const styles = new Map<Element, CSSStyleDeclaration>();
  const styleOf = (el: Element): CSSStyleDeclaration => {
    let st = styles.get(el);
    if (!st) {
      st = getComputedStyle(el);
      styles.set(el, st);
    }
    return st;
  };

  // Overflow-clipping boxes from `el` up to and including the card, memoized per element.
  interface Clipper {
    clip: Box;
    scrolls: boolean;
    truncates: boolean;
  }
  const chains = new Map<Element, Clipper[]>();
  const clippers = (el: Element): Clipper[] => {
    const cached = chains.get(el);
    if (cached) return cached;
    const style = styleOf(el);
    const clipsX = clipsStyle(style.overflowX);
    const clipsY = clipsStyle(style.overflowY);
    const rest =
      el === card || !el.parentElement ? [] : clippers(el.parentElement);
    let chain = rest;
    if ((clipsX || clipsY) && el instanceof HTMLElement) {
      const r = el.getBoundingClientRect();
      chain = [
        {
          clip: {
            x: clipsX ? r.left + el.clientLeft : -1e6,
            y: clipsY ? r.top + el.clientTop : -1e6,
            w: clipsX ? el.clientWidth : 2e6,
            h: clipsY ? el.clientHeight : 2e6,
          },
          scrolls:
            (clipsX && isScrollStyle(style.overflowX)) ||
            (clipsY && isScrollStyle(style.overflowY)),
          truncates:
            style.textOverflow === 'ellipsis' ||
            Boolean(style.webkitLineClamp && style.webkitLineClamp !== 'none'),
        },
        ...rest,
      ];
    }
    chains.set(el, chain);
    return chain;
  };

  const clipInfo = (el: Element, box: Box, includeSelf: boolean) => {
    let visible: Box | null = box;
    let nonScroll: Box | null = box;
    let inScroller = false;
    let truncated = false;
    const start = includeSelf ? el : el === card ? null : el.parentElement;
    for (const c of start ? clippers(start) : []) {
      const before = visible;
      visible = visible ? intersect(visible, c.clip) : null;
      if (before && cuts(before, visible)) {
        if (c.scrolls) inScroller = true;
        else if (c.truncates) truncated = true;
        else nonScroll = nonScroll ? intersect(nonScroll, c.clip) : null;
      }
    }
    return {
      visible,
      nonScroll,
      byNonScroller: cuts(box, nonScroll),
      inScroller,
      truncated,
    };
  };

  const skipHit = (el: Element) =>
    el.hasAttribute('data-inner-edge-strip') ||
    el.classList.contains('resize-handle');
  const firstHit = (x: number, y: number): Element | null => {
    if (x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight)
      return null;
    for (const el of document.elementsFromPoint(x, y))
      if (!skipHit(el)) return el;
    return null;
  };

  // Controls
  const controlEls = Array.from(
    card.querySelectorAll<HTMLElement>(opts.controlSelector)
  ).filter(
    (el) =>
      !skipHit(el) && !el.closest('[data-inner-edge-strip], .resize-handle')
  );
  const controlSet = new Set<Element>(controlEls);
  const controls: ControlInfo[] = [];
  // Hit-testing is the slow part on huge faces (a number line has thousands of ticks), so sample evenly.
  const hitStride = Math.max(
    1,
    Math.ceil(controlEls.length / opts.maxHitTests)
  );
  let index = -1;
  for (const el of controlEls) {
    index++;
    const style = styleOf(el);
    if (style.visibility !== 'visible' || style.display === 'none') continue;
    let target: HTMLElement = el;
    let box = toBox(el.getBoundingClientRect());
    if (box.w === 0 && box.h === 0) continue;
    const srOnly = box.w <= 2 || box.h <= 2;
    if (srOnly) {
      const label = (el as HTMLInputElement).labels?.[0];
      if (!label) continue;
      target = label;
      box = toBox(label.getBoundingClientRect());
      if (box.w <= 2 || box.h <= 2) continue;
    }
    const clip = clipInfo(target, box, false);
    let centerHit: ControlInfo['centerHit'] = 'self';
    let coveredBy: string | null = null;
    if (!clip.visible) centerHit = clip.byNonScroller ? 'clipped' : 'scrolled';
    else {
      const cx = clip.visible.x + clip.visible.w / 2;
      const cy = clip.visible.y + clip.visible.h / 2;
      const hit = index % hitStride === 0 ? firstHit(cx, cy) : el;
      if (!hit) centerHit = 'offscreen';
      else {
        const label = hit.closest('label');
        const ok =
          hit === el ||
          el.contains(hit) ||
          hit === target ||
          target.contains(hit) ||
          (label !== null && (label as HTMLLabelElement).control === el);
        if (!ok) {
          centerHit = 'covered';
          coveredBy = describe(hit);
        }
      }
    }
    let nested = false;
    for (let p = el.parentElement; p && p !== card; p = p.parentElement)
      if (controlSet.has(p)) {
        nested = true;
        break;
      }
    controls.push({
      path: describe(el),
      label: (
        el.getAttribute('aria-label') ||
        el.textContent ||
        el.getAttribute('title') ||
        ''
      )
        .trim()
        .slice(0, 40),
      box,
      visibleBox: clip.visible,
      nonScrollBox: clip.nonScroll,
      clippedByNonScroller: clip.byNonScroller,
      hiddenInScroller: clip.inScroller,
      centerHit,
      coveredBy,
      srOnly,
      transparent: cumulativeOpacity(target) < 0.05,
      nested,
    });
  }

  // Text
  const layerMemo = new Map<Element, BackgroundLayer[]>();
  const layersFor = (el: Element): BackgroundLayer[] => {
    const cached = layerMemo.get(el);
    if (cached) return cached;
    const st = styleOf(el);
    const rest = el.parentElement ? layersFor(el.parentElement) : [];
    const image =
      st.backgroundImage && st.backgroundImage !== 'none'
        ? st.backgroundImage
        : null;
    const layers =
      image || st.backgroundColor !== 'rgba(0, 0, 0, 0)'
        ? [{ color: st.backgroundColor, image }, ...rest]
        : rest;
    layerMemo.set(el, layers);
    return layers;
  };
  const texts: TextInfo[] = [];
  const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const raw = node.textContent ?? '';
    if (!raw.trim()) continue;
    const parent = node.parentElement;
    if (
      !parent ||
      parent.closest('[data-inner-edge-strip], .resize-handle, script, style')
    )
      continue;
    const style = styleOf(parent);
    if (style.visibility !== 'visible' || cumulativeOpacity(parent) < 0.05)
      continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    const box = toBox(range.getBoundingClientRect());
    if (box.w <= 2 || box.h <= 2) continue;
    const clip = clipInfo(parent, box, true);
    const own = parent instanceof HTMLElement ? parent : null;
    const scale =
      own && own.offsetHeight > 0
        ? parent.getBoundingClientRect().height / own.offsetHeight
        : 1;
    const ownClips =
      own !== null &&
      !isScrollStyle(style.overflowX) &&
      !isScrollStyle(style.overflowY) &&
      (clipsStyle(style.overflowX) || clipsStyle(style.overflowY)) &&
      style.textOverflow !== 'ellipsis' &&
      !(style.webkitLineClamp && style.webkitLineClamp !== 'none') &&
      (own.scrollWidth > own.clientWidth + 1 ||
        own.scrollHeight > own.clientHeight + 1);
    texts.push({
      path: describe(parent),
      text: raw.trim().replace(/\s+/g, ' ').slice(0, 60),
      box,
      fontPx:
        (parseFloat(style.fontSize) || 0) *
        (Number.isFinite(scale) && scale > 0 ? scale : 1),
      fontWeight: Number(style.fontWeight) || 400,
      nonScrollBox: clip.nonScroll,
      clippedByNonScroller: clip.byNonScroller,
      hiddenInScroller: clip.inScroller,
      truncated: clip.truncated,
      overflowsOwnBox: ownClips,
      color: style.color,
      layers: layersFor(parent),
    });
  }

  // Media and painted blocks (for G2 and the content box)
  const media: MediaInfo[] = [];
  const painted: Box[] = [];
  const cardArea = cardBox.w * cardBox.h;
  for (const el of Array.from(
    card.querySelectorAll<Element>('img, video, canvas, svg, iframe, div, span')
  )) {
    if (el.tagName.toLowerCase() === 'svg' && el.parentElement?.closest('svg'))
      continue;
    if (el.closest('[data-inner-edge-strip], .resize-handle')) continue;
    const style = styleOf(el);
    if (style.visibility !== 'visible' || cumulativeOpacity(el) < 0.05)
      continue;
    const box = toBox(el.getBoundingClientRect());
    if (box.w < 12 || box.h < 12) continue;
    const tag = el.tagName.toLowerCase();
    const isMedia = tag !== 'div' && tag !== 'span';
    if (!isMedia) {
      const hasPaint =
        (style.backgroundColor !== 'rgba(0, 0, 0, 0)' ||
          style.backgroundImage !== 'none') &&
        box.w * box.h < 0.9 * cardArea;
      if (!hasPaint) continue;
    }
    const clip = clipInfo(el, box, false);
    if (clip.visible) painted.push(clip.visible);
    if (isMedia) {
      const visibleArea = clip.visible ? clip.visible.w * clip.visible.h : 0;
      media.push({
        path: describe(el),
        box,
        nonScrollBox: clip.nonScroll,
        clippedByNonScroller: clip.byNonScroller,
        clippedFraction:
          box.w * box.h > 0 ? 1 - visibleArea / (box.w * box.h) : 0,
      });
    }
  }

  // Scrollers
  const scrollEls = [
    card,
    ...Array.from(card.querySelectorAll<HTMLElement>('*')),
  ].filter((el): el is HTMLElement => {
    if (!(el instanceof HTMLElement)) return false;
    const s = styleOf(el);
    return (
      (isScrollStyle(s.overflowY) && el.scrollHeight > el.clientHeight + 1) ||
      (isScrollStyle(s.overflowX) && el.scrollWidth > el.clientWidth + 1)
    );
  });
  const scrollSet = new Set<Element>(scrollEls);
  const scrollers: ScrollerInfo[] = scrollEls.map((el) => {
    let nested = false;
    for (let p = el.parentElement; p; p = p.parentElement) {
      if (scrollSet.has(p)) {
        nested = true;
        break;
      }
      if (p === card) break;
    }
    return {
      path: describe(el),
      box: toBox(el.getBoundingClientRect()),
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      nested,
    };
  });

  // Content box: union of visible text, media, painted blocks and controls
  const parts: Box[] = [...painted];
  for (const t of texts) {
    const v = intersect(t.box, cardBox);
    if (v && !t.hiddenInScroller) parts.push(v);
  }
  for (const c of controls)
    if (c.visibleBox && !c.transparent) parts.push(c.visibleBox);
  let contentBox: Box | null = null;
  for (const p of parts) {
    if (!contentBox) contentBox = { ...p };
    else {
      const x = Math.min(contentBox.x, p.x);
      const y = Math.min(contentBox.y, p.y);
      const r = Math.max(contentBox.x + contentBox.w, p.x + p.w);
      const b = Math.max(contentBox.y + contentBox.h, p.y + p.h);
      contentBox = { x, y, w: r - x, h: b - y };
    }
  }
  if (contentBox) contentBox = intersect(contentBox, cardBox);

  // Drag surface grid: does a mouse pointer-down here start a window drag?
  let samples = 0;
  let draggable = 0;
  for (let i = 0; i < opts.gridCols; i++) {
    for (let j = 0; j < opts.gridRows; j++) {
      const x = cardBox.x + ((i + 0.5) * cardBox.w) / opts.gridCols;
      const y = cardBox.y + ((j + 0.5) * cardBox.h) / opts.gridRows;
      samples++;
      const hit = firstHit(x, y);
      if (hit && card.contains(hit) && !hit.closest(opts.dragBlockingSelector))
        draggable++;
    }
  }

  // Inner edge strips: covered when interactive content sits beneath them
  const strips: StripInfo[] = [];
  for (const strip of Array.from(
    card.querySelectorAll<HTMLElement>('[data-inner-edge-strip]')
  )) {
    const r = strip.getBoundingClientRect();
    const horizontal = r.width >= r.height;
    let covered = 0;
    const n = 8;
    for (let k = 0; k < n; k++) {
      const x = horizontal
        ? r.left + ((k + 0.5) * r.width) / n
        : r.left + r.width / 2;
      const y = horizontal
        ? r.top + r.height / 2
        : r.top + ((k + 0.5) * r.height) / n;
      const hit = firstHit(x, y);
      if (hit && card.contains(hit) && hit.closest(opts.interactiveSelector))
        covered++;
    }
    strips.push({
      side: strip.getAttribute('data-inner-edge-strip') ?? '',
      samples: n,
      covered,
    });
  }

  const toolbarEl = document.querySelector('[data-tour="widget.toolbar"]');
  return {
    card: cardBox,
    viewport: { w: window.innerWidth, h: window.innerHeight },
    controls,
    texts,
    media,
    scrollers,
    contentBox,
    drag: { samples, draggable },
    strips,
    toolbar: toolbarEl ? toBox(toolbarEl.getBoundingClientRect()) : null,
    faceText: (card.innerText || '').replace(/\s+/g, ' ').trim(),
  };
}
