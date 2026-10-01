import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import type { RosterGroupSymbol } from '@/types';
import { GroupSymbol } from './GroupSymbol';

/** A group's icon as standalone SVG markup, for print windows. */
export function groupSymbolMarkup(symbol?: RosterGroupSymbol): string {
  const host = document.createElement('div');
  const root = createRoot(host);
  flushSync(() => root.render(<GroupSymbol symbol={symbol} className="" />));
  const markup = host.innerHTML;
  root.unmount();
  return markup;
}
