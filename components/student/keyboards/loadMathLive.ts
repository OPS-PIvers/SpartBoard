// MathLive is loaded only when a quiz turns the math keyboard on; fonts are self-hosted under /mathlive.
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

export function loadMathLive(): Promise<MathLive> {
  loading ??= Promise.all([
    import('mathlive'),
    import('mathlive/static.css'),
  ]).then(([ml]) => {
    linkFonts();
    ml.MathfieldElement.fontsDirectory = '/mathlive/fonts';
    ml.MathfieldElement.soundsDirectory = null;
    return ml;
  });
  return loading;
}
