import { createContext, useContext } from 'react';

export interface PresentTheme {
  root: string;
  strong: string;
  muted: string;
  faint: string;
  accent: string;
  rule: string;
  track: string;
  bar: string;
  correctText: string;
  correctBar: string;
}

/** Quiz's projector board (brand-blue-dark). */
export const DARK_PRESENT_THEME: PresentTheme = {
  root: 'bg-brand-blue-dark text-white',
  strong: 'text-white',
  muted: 'text-white/70',
  faint: 'text-white/50',
  accent: 'text-brand-blue-lighter',
  rule: 'border-white/20',
  track: 'bg-white/15',
  bar: 'bg-brand-blue-light',
  correctText: 'text-emerald-300 font-semibold',
  correctBar: 'bg-emerald-400',
};

/** Review's game board, on the app's light brand tokens. */
export const LIGHT_PRESENT_THEME: PresentTheme = {
  root: 'bg-white text-brand-gray-darkest',
  strong: 'text-brand-gray-darkest',
  muted: 'text-brand-gray-primary',
  faint: 'text-brand-gray-primary',
  accent: 'text-brand-blue-primary',
  rule: 'border-brand-gray-lighter',
  track: 'bg-brand-blue-lighter',
  bar: 'bg-brand-blue-primary',
  correctText: 'text-emerald-700 font-semibold',
  correctBar: 'bg-emerald-600',
};

export const PresentThemeContext =
  createContext<PresentTheme>(DARK_PRESENT_THEME);

export const usePresentTheme = (): PresentTheme =>
  useContext(PresentThemeContext);
