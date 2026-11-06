// MathLive is loaded only when a quiz turns the math keyboard on; fonts are self-hosted under /mathlive.
import { Z_INDEX } from '@/config/zIndex';

type MathLive = typeof import('mathlive');

let loading: Promise<MathLive> | null = null;

function linkFonts(): void {
  if (document.querySelector('link[data-mathlive-fonts]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/mathlive/mathlive-fonts.css';
  link.setAttribute('data-mathlive-fonts', '');
  document.head.append(link);
}

// MathLive defaults its keyboard (105) and popup scrim (10099) below our modals, and follows dark mode.
function applyOverrides(): void {
  const root = document.documentElement.style;
  root.setProperty('--keyboard-zindex', String(Z_INDEX.mathKeyboard));
  root.setProperty('--scrim-zindex', String(Z_INDEX.mathKeyboardPopup));
  // The app is light-only; keep MathLive's keyboard light on dark-mode devices too.
  document.body.setAttribute('theme', 'light');
  if (document.querySelector('style[data-mathlive-overrides]')) return;
  const style = document.createElement('style');
  style.setAttribute('data-mathlive-overrides', '');
  // MathLive re-shows its menu button on every render, so hide it with a rule.
  style.textContent = 'math-field::part(menu-toggle){display:none !important}';
  document.head.append(style);
}

export function loadMathLive(): Promise<MathLive> {
  loading ??= Promise.all([
    import('mathlive'),
    import('mathlive/static.css'),
  ]).then(([ml]) => {
    linkFonts();
    applyOverrides();
    ml.MathfieldElement.fontsDirectory = '/mathlive/fonts';
    ml.MathfieldElement.soundsDirectory = null;
    return ml;
  });
  return loading;
}
