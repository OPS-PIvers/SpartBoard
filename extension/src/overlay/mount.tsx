import { createRoot, type Root } from 'react-dom/client';
import { createOverlayI18n } from './i18n';
import { OverlayRoot } from './OverlayRoot';
import { loadLexend } from '../fonts';
import type { OverlayAction, OverlayState } from './overlayState';

// A plain div, not a custom element name a page could define and take over.
export const OVERLAY_HOST_SELECTOR = 'div[data-spartboard-tour-overlay]';

// Inline !important so the host page's own CSS can't move, hide or restyle the host.
const HOST_STYLE = [
  'all: initial !important',
  'position: fixed !important',
  'top: 0 !important',
  'left: 0 !important',
  'width: 0 !important',
  'height: 0 !important',
  'overflow: visible !important',
  'z-index: 2147483647 !important',
  'display: block !important',
].join(';');

export interface OverlayHandle {
  render: (state: OverlayState) => void;
  unmount: () => void;
}

function adoptCss(shadow: ShadowRoot, css: string) {
  if (typeof CSSStyleSheet === 'function' && 'adoptedStyleSheets' in shadow) {
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(css);
      shadow.adoptedStyleSheets = [sheet];
      return;
    } catch {
      // Constructable sheets unavailable: fall through to a <style> element.
    }
  }
  const style = shadow.ownerDocument.createElement('style');
  style.textContent = css;
  shadow.appendChild(style);
}

/** Whether the overlay's Tailwind utilities reached its shadow root, read off a probe element. */
function sheetApplied(shadow: ShadowRoot, doc: Document): boolean {
  const probe = doc.createElement('div');
  probe.className = 'hidden';
  shadow.appendChild(probe);
  const applied = doc.defaultView?.getComputedStyle(probe).display === 'none';
  probe.remove();
  return applied;
}

/** Mounts the overlay in a closed Shadow DOM so page scripts can't reach into it. */
export function mountOverlay(
  css: string,
  onAction: (action: OverlayAction) => void,
  doc: Document = document
): OverlayHandle {
  const host = doc.createElement('div');
  host.setAttribute('data-spartboard-tour-overlay', '');
  host.setAttribute('style', HOST_STYLE);
  host.setAttribute('data-tour-ignore', '');
  const shadow = host.attachShadow({ mode: 'closed' });
  adoptCss(shadow, css);
  loadLexend(doc);
  const container = doc.createElement('div');
  // The host resets every inherited style, so the overlay sets its own font.
  container.className = 'font-sans leading-normal antialiased';
  shadow.appendChild(container);
  doc.documentElement.appendChild(host);
  const styled = sheetApplied(shadow, doc);
  const i18n = createOverlayI18n();
  let root: Root | null = createRoot(container);
  return {
    render: (state) =>
      root?.render(
        <OverlayRoot
          i18n={i18n}
          state={state}
          styled={styled}
          onAction={onAction}
        />
      ),
    unmount: () => {
      root?.unmount();
      root = null;
      host.remove();
    },
  };
}
