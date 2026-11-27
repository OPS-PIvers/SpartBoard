import 'i18next';

// i18next 27 turns strict interpolation typing on by default; keep 26's looser t() types.
declare module 'i18next' {
  interface CustomTypeOptions {
    strictInterpolationChecks: false;
  }
}
