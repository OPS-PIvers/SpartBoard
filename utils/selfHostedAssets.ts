// Paths served by `scripts/selfHostedAssetsPlugin.ts`; OCR and background removal must never default to a public CDN.
export const TESSERACT_PATHS = {
  workerPath: '/tesseract/worker.min.js',
  corePath: '/tesseract/core',
  langPath: '/tesseract/lang',
};

export const IMGLY_BG_PUBLIC_PATH = '/imgly-bg/';
