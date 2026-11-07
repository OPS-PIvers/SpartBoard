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
  // Keep MathLive's keyboard light on dark-mode devices, matching our light UI.
  document.body.setAttribute('theme', 'light');
  if (document.querySelector('style[data-mathlive-overrides]')) return;
  const style = document.createElement('style');
  style.setAttribute('data-mathlive-overrides', '');
  // Hide the menu button (MathLive re-shows it each render) and undo dark-mode keyboard leftovers.
  style.textContent =
    'math-field::part(menu-toggle){display:none !important}' +
    'body[theme=light] .ML__keyboard{--keyboard-toolbar-background-hover:#eee;--keycap-secondary-border:#c5c9d0;--keycap-secondary-border-bottom:#989da6}';
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
